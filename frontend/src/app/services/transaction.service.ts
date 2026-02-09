import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';
import { Transaction, CustomerInfo } from '../models/transaction.model';
import { CartItem } from '../models/cart-item.model';
import { OfflineService } from './offline.service';
import { map } from 'rxjs/operators';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private apiUrl = environment.apiUrl;
  private transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  private pendingTransactions: Transaction[] = [];

  constructor(
    private http: HttpClient,
    private offlineService: OfflineService
  ) {
    this.loadTransactions().subscribe();
    this.loadPendingTransactions();

    // Sync pending transactions when coming back online
    this.offlineService.isOnline$.subscribe(isOnline => {
      if (isOnline && this.pendingTransactions.length > 0) {
        this.syncPendingTransactions();
      }
    });
  }

  getTransactions(): Observable<Transaction[]> {
    return this.transactionsSubject.asObservable();
  }

  createTransaction(
    items: CartItem[],
    paymentMethod: string = 'cash',
    customerInfo: CustomerInfo,
    serviceType: 'dineIn' | 'takeOut' = 'dineIn',
    serviceFee: number = 0,
    amountReceived: number = 0,
    change: number = 0
  ): Observable<Transaction> {
    // Calculate total (tax is already included in product prices)
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const total = subtotal + serviceFee;

    const transactionData = {
      timestamp: new Date().toISOString(),
      items: items.map(item => ({
        productId: item.productId,
        name: item.name,
        category: item.category, // Include category in transaction
        price: item.price,
        basePrice: item.basePrice ?? item.price, // Ensure basePrice is always set
        quantity: item.quantity,
        temperature: item.temperature || 'none', // Convert null to 'none' for enum
        // Note: addOns and discount are sent but will be ignored by backend (UnmappedMemberHandling.Skip)
        addOns: item.addOns,
        discount: item.discount
      })),
      total,
      paymentMethod,
      serviceType: serviceType || 'dineIn', // Ensure serviceType is always set
      serviceFee: serviceFee || 0,
      customerInfo: {
        name: customerInfo.name || '',
        email: customerInfo.email || '',
        phone: customerInfo.phone || '',
        discountType: customerInfo.discountType,
        discountId: customerInfo.discountId
      },
      status: 'completed',
      notes: '',
      amountReceived,
      change
    };

    if (this.offlineService.isOnline$.value) {
      return this.http.post<Transaction>(`${this.apiUrl}/transactions`, transactionData).pipe(
        timeout(30000), // 30 second timeout
        tap(transaction => {
          const currentTransactions = this.transactionsSubject.value;
          this.transactionsSubject.next([transaction, ...currentTransactions]);
          this.saveToLocalStorage('transactions', this.transactionsSubject.value);
        }),
        catchError(error => {
          // Handle timeout errors
          if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            return throwError(() => new Error('Request timed out. Please check your connection and try again.'));
          }

          // Only create offline transaction if it's a network error (no response from server)
          // If server responded with an error (400, 500, etc.), propagate it so user knows what went wrong
          if (!error.status || error.status === 0) {
            // Network error - no server response, create offline transaction
            return this.createOfflineTransaction(transactionData);
          } else {
            // Server error (400, 500, etc.) - propagate the error so user sees the message
            // This includes errors like "Insufficient stock" which should be shown to the user
            // Create a more detailed error message
            let errorMessage = 'Transaction failed';
            if (error.error) {
              if (typeof error.error === 'string') {
                errorMessage = error.error;
              } else if (error.error.message) {
                errorMessage = error.error.message;
              } else if (error.error.errors && Array.isArray(error.error.errors)) {
                errorMessage = error.error.errors.join(', ');
              }
            }

            const detailedError = {
              ...error,
              userMessage: errorMessage || `Server error: ${error.status} ${error.statusText}`
            };

            return throwError(() => detailedError);
          }
        })
      );
    } else {
      return this.createOfflineTransaction(transactionData);
    }
  }

  private createOfflineTransaction(transactionData: any): Observable<Transaction> {
    const transaction: Transaction = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      items: transactionData.items,
      total: transactionData.total,
      paymentMethod: transactionData.paymentMethod,
      serviceType: transactionData.serviceType || 'dineIn',
      serviceFee: transactionData.serviceFee || 0,
      customerInfo: transactionData.customerInfo,
      status: 'pending',
      notes: transactionData.notes || '',
      amountReceived: transactionData.amountReceived || 0,
      change: transactionData.change || 0
    };

    // Add to pending transactions
    this.pendingTransactions.push(transaction);
    this.savePendingTransactions();

    // Add to current transactions list for display
    const currentTransactions = this.transactionsSubject.value;
    this.transactionsSubject.next([transaction, ...currentTransactions]);
    this.saveToLocalStorage('transactions', this.transactionsSubject.value);

    return of(transaction);
  }

  private syncPendingTransactions(): void {
    if (this.pendingTransactions.length === 0) return;

    const transactionsToSync = [...this.pendingTransactions];
    this.pendingTransactions = [];
    this.savePendingTransactions();

    transactionsToSync.forEach(transaction => {
      const transactionData = {
        items: transaction.items,
        total: transaction.total,
        paymentMethod: transaction.paymentMethod,
        customerInfo: transaction.customerInfo
      };

      this.http.post<Transaction>(`${this.apiUrl}/transactions`, transactionData).pipe(
        tap(syncedTransaction => {
          // Update the transaction status in the local list
          const currentTransactions = this.transactionsSubject.value;
          const index = currentTransactions.findIndex(t => t.id === transaction.id);
          if (index !== -1) {
            currentTransactions[index] = syncedTransaction;
            this.transactionsSubject.next([...currentTransactions]);
            this.saveToLocalStorage('transactions', currentTransactions);
          }
        }),
        catchError(error => {
          // Add back to pending if sync fails
          this.pendingTransactions.push(transaction);
          this.savePendingTransactions();
          return of(null);
        })
      ).subscribe();
    });
  }

  getDailyReport(): Observable<any> {
    if (this.offlineService.isOnline$.value) {
      return this.http.get<any>(`${this.apiUrl}/reports/daily`).pipe(
        tap(report => {
          this.saveToLocalStorage('dailyReport', report);
        }),
        catchError(error => {
          return this.loadFromLocalStorage('dailyReport').pipe(
            switchMap(cachedReport => {
              if (cachedReport && Object.keys(cachedReport).length > 0) {
                return of(cachedReport);
              } else {
                return this.generateOfflineDailyReport();
              }
            })
          );
        })
      );
    } else {
      return this.generateOfflineDailyReport();
    }
  }

  getDailyReportByDate(date: Date): Observable<any> {
    if (this.offlineService.isOnline$.value) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      return this.http.get<any>(`${this.apiUrl}/reports/daily/${dateStr}`).pipe(
        catchError(error => {
          return this.generateOfflineDailyReport();
        })
      );
    } else {
      return this.generateOfflineDailyReport();
    }
  }

  getSalesReport(startDate: Date, endDate: Date): Observable<any> {
    if (this.offlineService.isOnline$.value) {
      const params: any = {};
      if (startDate) params.startDate = startDate.toISOString();
      if (endDate) params.endDate = endDate.toISOString();

      return this.http.get<any>(`${this.apiUrl}/reports/sales`, { params }).pipe(
        catchError(error => {
          return this.generateOfflineSalesReport(startDate, endDate);
        })
      );
    } else {
      return this.generateOfflineSalesReport(startDate, endDate);
    }
  }

  getTopProducts(startDate?: Date, endDate?: Date, count: number = 10): Observable<any[]> {
    if (this.offlineService.isOnline$.value) {
      const params: any = { count };
      if (startDate) params.startDate = startDate.toISOString();
      if (endDate) params.endDate = endDate.toISOString();

      return this.http.get<any[]>(`${this.apiUrl}/reports/top-products`, { params }).pipe(
        catchError(error => {
          return this.generateOfflineTopProducts();
        })
      );
    } else {
      return this.generateOfflineTopProducts();
    }
  }

  getAllTimeProductSales(): Observable<any[]> {
    if (this.offlineService.isOnline$.value) {
      return this.http.get<any[]>(`${this.apiUrl}/reports/all-time-sales`).pipe(
        catchError(error => {
          return of([]);
        })
      );
    } else {
      return of([]);
    }
  }

  getRecentTransactions(count: number = 5): Observable<Transaction[]> {
    return this.transactionsSubject.asObservable().pipe(
      map(transactions => {
        // Get today's transactions first, then fall back to recent ones
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        // Filter for today's transactions first
        const todayTransactions = transactions
          .filter(t => {
            const transactionDate = new Date(t.timestamp);
            return transactionDate >= todayStart && transactionDate < todayEnd && t.status === 'completed';
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // If we have today's transactions, return them (up to the count)
        if (todayTransactions.length > 0) {
          return todayTransactions.slice(0, count);
        }

        // Otherwise, return recent completed transactions
        return transactions
          .filter(t => t.status === 'completed')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, count);
      })
    );
  }

  private generateOfflineDailyReport(): Observable<any> {
    const today = new Date().toDateString();
    const transactions = this.transactionsSubject.value;
    const todayTransactions = transactions.filter(t =>
      new Date(t.timestamp).toDateString() === today
    );

    const totalSales = todayTransactions.reduce((sum, t) => sum + t.total, 0);
    const totalTransactions = todayTransactions.length;

    const report = {
      date: today,
      totalSales,
      totalTransactions,
      transactions: todayTransactions
    };

    return of(report);
  }

  private generateOfflineTopProducts(): Observable<any[]> {
    const today = new Date().toDateString();
    const transactions = this.transactionsSubject.value;
    const todayTransactions = transactions.filter(t =>
      new Date(t.timestamp).toDateString() === today
    );

    const productStats = new Map<string, { quantity: number, revenue: number }>();

    todayTransactions.forEach(transaction => {
      transaction.items.forEach(item => {
        const existing = productStats.get(item.productId) || { quantity: 0, revenue: 0 };
        productStats.set(item.productId, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity)
        });
      });
    });

    const topProducts = Array.from(productStats.entries())
      .map(([productId, stats]) => ({
        productId,
        productName: `Product ${productId}`,
        quantity: stats.quantity,
        revenue: stats.revenue
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return of(topProducts);
  }

  private generateOfflineSalesReport(startDate: Date, endDate: Date): Observable<any> {
    const transactions = this.transactionsSubject.value;
    const filteredTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.timestamp);
      return transactionDate >= startDate && transactionDate <= endDate;
    });

    const dailySales = filteredTransactions
      .reduce((acc: any[], transaction) => {
        const date = new Date(transaction.timestamp).toDateString();
        const existingDay = acc.find(day => day.Date === date);

        if (existingDay) {
          existingDay.TotalSales += transaction.total;
          existingDay.TransactionCount += 1;
        } else {
          acc.push({
            Date: date,
            TotalSales: transaction.total,
            TransactionCount: 1
          });
        }

        return acc;
      }, []);

    return of({
      StartDate: startDate,
      EndDate: endDate,
      TotalSales: filteredTransactions.reduce((sum, t) => sum + t.total, 0),
      TotalTransactions: filteredTransactions.length,
      DailySales: dailySales
    });
  }

  private loadTransactions(): Observable<Transaction[]> {
    if (this.offlineService.isOnline$.value) {
      return this.http.get<Transaction[]>(`${this.apiUrl}/transactions`).pipe(
        map(transactions => {
          // Add missing discountType property to customerInfo
          return transactions.map(transaction => ({
            ...transaction,
            customerInfo: {
              ...transaction.customerInfo,
              discountType: transaction.customerInfo?.discountType || 'none'
            }
          }));
        }),
        tap(transactions => {
          this.transactionsSubject.next(transactions);
          this.saveToLocalStorage('transactions', transactions);
        }),
        catchError(error => {
          return this.loadFromLocalStorage('transactions');
        })
      );
    } else {
      return this.loadFromLocalStorage('transactions').pipe(
        tap(transactions => {
          this.transactionsSubject.next(transactions);
        })
      );
    }
  }

  private loadPendingTransactions(): void {
    try {
      const saved = localStorage.getItem('pendingTransactions');
      if (saved) {
        this.pendingTransactions = JSON.parse(saved);
      }
    } catch (error) {
      // Error loading pending transactions
    }
  }

  private savePendingTransactions(): void {
    try {
      localStorage.setItem('pendingTransactions', JSON.stringify(this.pendingTransactions));
    } catch (error) {
      // Error saving pending transactions
    }
  }

  private saveToLocalStorage(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      // Error saving to localStorage
    }
  }

  private loadFromLocalStorage(key: string): Observable<any> {
    try {
      const data = localStorage.getItem(key);
      return of(data ? JSON.parse(data) : []);
    } catch (error) {
      return of([]);
    }
  }

  refreshData(): Observable<Transaction[]> {
    return this.loadTransactions();
  }
}




