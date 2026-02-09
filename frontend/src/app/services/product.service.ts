import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Product } from '../models/product.model';
import { OfflineService } from './offline.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = '/api';
  private productsSubject = new BehaviorSubject<Product[]>([]);
  private categoriesSubject = new BehaviorSubject<string[]>([]);
  
  constructor(
    private http: HttpClient,
    private offlineService: OfflineService
  ) {
    this.loadProducts();
    this.loadCategories();
  }

  getProducts(): Observable<Product[]> {
    return this.productsSubject.asObservable();
  }

  getCategories(): Observable<string[]> {
    return this.categoriesSubject.asObservable();
  }

  private loadProducts(): void {
    if (this.offlineService.isOnline$.value) {
      this.http.get<Product[]>(`${this.apiUrl}/products?page=1&pageSize=100`).pipe(
        tap(products => {
          const updatedProducts = products || [];
          this.productsSubject.next(updatedProducts);
          this.saveToLocalStorage('products', updatedProducts);
          this.updateCategories();
        }),
        catchError(error => {
          this.loadFromLocalStorage('products').subscribe(products => {
            this.productsSubject.next(products || []);
            this.updateCategories();
          });
          return of([]);
        })
      ).subscribe();
    } else {
      this.loadFromLocalStorage('products').subscribe(products => {
        this.productsSubject.next(products || []);
        this.updateCategories();
      });
    }
  }

  getProductsPaginated(page: number = 1, pageSize: number = 20): Observable<Product[]> {
    if (this.offlineService.isOnline$.value) {
      return this.http.get<Product[]>(`${this.apiUrl}/products?page=${page}&pageSize=${pageSize}`).pipe(
        catchError(error => {
          return this.loadFromLocalStorage('products');
        })
      );
    } else {
      return this.loadFromLocalStorage('products');
    }
  }

  private loadCategories(): void {
    if (this.offlineService.isOnline$.value) {
      this.http.get<string[]>(`${this.apiUrl}/products/categories`).pipe(
        tap(categories => {
          this.categoriesSubject.next(categories || []);
          this.saveToLocalStorage('categories', categories);
        }),
        catchError(error => {
          return this.loadFromLocalStorage('categories');
        })
      ).subscribe({
        next: (categories) => {
          this.categoriesSubject.next(categories || []);
        },
        error: (error) => {
          this.loadFromLocalStorage('categories').subscribe(fallbackCategories => {
            this.categoriesSubject.next(fallbackCategories || []);
          });
        }
      });
    } else {
      this.loadFromLocalStorage('categories').subscribe(categories => {
        this.categoriesSubject.next(categories || []);
      });
    }
  }

  addProduct(product: Omit<Product, 'id'>): Observable<Product> {
    if (this.offlineService.isOnline$.value) {
      return this.http.post<Product>(`${this.apiUrl}/products`, product).pipe(
        tap(newProduct => {
          const currentProducts = this.productsSubject.value;
          this.productsSubject.next([...currentProducts, newProduct]);
          this.saveToLocalStorage('products', this.productsSubject.value);
          this.updateCategories();
        }),
        catchError(error => {
          throw error;
        })
      );
    } else {
      // Handle offline product addition
      const newProduct: Product = {
        ...product,
        id: Date.now().toString()
      };
      const currentProducts = this.productsSubject.value;
      const updatedProducts = [...currentProducts, newProduct];
      this.productsSubject.next(updatedProducts);
      this.saveToLocalStorage('products', updatedProducts);
      this.updateCategories();
      return of(newProduct);
    }
  }

  updateProduct(id: string, product: Partial<Product>): Observable<Product> {
    if (this.offlineService.isOnline$.value) {
      return this.http.put<Product>(`${this.apiUrl}/products/${id}`, product).pipe(
        tap(updatedProduct => {
          const currentProducts = this.productsSubject.value;
          const index = currentProducts.findIndex(p => p.id === id);
          if (index !== -1) {
            currentProducts[index] = updatedProduct;
            this.productsSubject.next([...currentProducts]);
            this.saveToLocalStorage('products', this.productsSubject.value);
            this.updateCategories();
          }
        }),
        catchError(error => {
          throw error;
        })
      );
    } else {
      // Handle offline product update
      const currentProducts = this.productsSubject.value;
      const index = currentProducts.findIndex(p => p.id === id);
      if (index !== -1) {
        const updatedProduct = { ...currentProducts[index], ...product };
        currentProducts[index] = updatedProduct;
        this.productsSubject.next([...currentProducts]);
        this.saveToLocalStorage('products', currentProducts);
        this.updateCategories();
        return of(updatedProduct);
      }
      throw new Error('Product not found');
    }
  }

  deleteProduct(id: string): Observable<void> {
    if (this.offlineService.isOnline$.value) {
      return this.http.delete<void>(`${this.apiUrl}/products/${id}`).pipe(
        tap(() => {
          const currentProducts = this.productsSubject.value;
          const filteredProducts = currentProducts.filter(p => p.id !== id);
          this.productsSubject.next(filteredProducts);
          this.saveToLocalStorage('products', filteredProducts);
          this.updateCategories();
        }),
        catchError(error => {
          throw error;
        })
      );
    } else {
      // Handle offline product deletion
      const currentProducts = this.productsSubject.value;
      const filteredProducts = currentProducts.filter(p => p.id !== id);
      this.productsSubject.next(filteredProducts);
      this.saveToLocalStorage('products', filteredProducts);
      this.updateCategories();
      return of(void 0);
    }
  }

  private updateCategories(): void {
    const products = this.productsSubject.value;
    const categories = [...new Set(products.map(p => p.category).filter(c => c && c.trim() !== ''))];
    this.categoriesSubject.next(categories);
    this.saveToLocalStorage('categories', categories);
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

  refreshData(): void {
    this.loadProducts();
    this.loadCategories();
  }

  forceRefresh(): Observable<Product[]> {
    // Clear localStorage and reload from API to get fresh data
    localStorage.removeItem('products');
    localStorage.removeItem('categories');
    
    if (this.offlineService.isOnline$.value) {
      return this.http.get<Product[]>(`${this.apiUrl}/products?page=1&pageSize=100`).pipe(
        tap(products => {
          const updatedProducts = products || [];
          this.productsSubject.next(updatedProducts);
          this.saveToLocalStorage('products', updatedProducts);
          this.updateCategories();
        }),
        catchError(error => {
          this.loadFromLocalStorage('products').subscribe(products => {
            this.productsSubject.next(products || []);
            this.updateCategories();
          });
          return of([]);
        })
      );
    } else {
      this.loadFromLocalStorage('products').subscribe(products => {
        this.productsSubject.next(products || []);
        this.updateCategories();
      });
      return of(this.productsSubject.value);
    }
  }
}

