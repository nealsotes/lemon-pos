import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { Transaction } from '../models/transaction.model';
import { OfflineService } from '../../../core/services/offline.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TransactionService } from './transaction.service';

/**
 * Covers the offline sale path: what a queued sale carries when it finally syncs,
 * when it is allowed to leave the queue, and what happens when the device cannot
 * persist the queue at all. Each sale in this queue is money already taken from a
 * customer, so anything lost here is lost revenue with no record of it.
 */
describe('TransactionService offline sync', () => {
  let isOnline$: BehaviorSubject<boolean>;
  let toast: jasmine.SpyObj<ToastService>;
  let httpMock: HttpTestingController;

  /**
   * A dine-in sale rung up during an outage: two lattes at 100 with a 20% senior
   * discount (line total 160) plus a 20 service fee. The customer handed over 500
   * and got 320 back, so 180 is the figure that must reach the books.
   */
  const queuedSale = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 1748000000000,
    timestamp: '2026-10-16T06:00:00.000Z',
    items: [
      {
        productId: 'p1',
        name: 'Latte',
        category: 'Coffee',
        price: 100,
        basePrice: 100,
        quantity: 2,
        temperature: 'hot',
        addOns: [],
        discount: { type: 'senior', percentage: 20, amount: 40 }
      }
    ],
    total: 180,
    paymentMethod: 'cash',
    serviceType: 'dineIn',
    serviceFee: 20,
    customerInfo: { name: 'Walk-in', email: '', phone: '', discountType: 'senior', discountId: 'SC-1234' },
    status: 'pending',
    notes: 'Table 4',
    amountReceived: 500,
    change: 320,
    ...overrides
  });

  /**
   * Seeds the persisted queue and the cached transaction list the way an outage
   * would leave them, then builds the service offline so its constructor picks the
   * queue up without issuing any request.
   */
  const bootWithQueuedSale = (sale: Transaction): TransactionService => {
    localStorage.setItem('pendingTransactions', JSON.stringify([sale]));
    localStorage.setItem('transactions', JSON.stringify([sale]));
    return TestBed.inject(TransactionService);
  };

  /** Reads back what is actually on disk, which is all that survives a closed tab. */
  const persistedQueue = (): Transaction[] =>
    JSON.parse(localStorage.getItem('pendingTransactions') ?? '[]');

  /** The total the backend will recompute and overwrite the posted total with. */
  const backendRecomputedTotal = (body: any): number => {
    const itemsSubtotal = body.items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
    const itemsDiscount = body.items.reduce((sum: number, i: any) => sum + (i.discount?.amount ?? 0), 0);
    return itemsSubtotal - itemsDiscount + body.serviceFee;
  };

  beforeEach(() => {
    localStorage.clear();
    isOnline$ = new BehaviorSubject<boolean>(false);
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error', 'info']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OfflineService, useValue: { isOnline$ } },
        { provide: ToastService, useValue: toast }
      ]
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('what a queued sale carries when it syncs', () => {
    it('posts the service fee and payment detail, not just the four core fields', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);

      const body = httpMock.expectOne('/api/transactions').request.body;
      expect(body.serviceType).toBe('dineIn');
      expect(body.serviceFee).toBe(20);
      expect(body.amountReceived).toBe(500);
      expect(body.change).toBe(320);
      expect(body.notes).toBe('Table 4');
    });

    it('books the total the customer actually paid', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);

      const body = httpMock.expectOne('/api/transactions').request.body;
      // The backend overwrites the posted total whenever it differs from its own
      // (net subtotal + serviceFee) by more than 0.05, silently and without logging.
      // Omitting serviceFee made these two disagree by exactly the fee, so the sale
      // was booked 20 short. They must now agree.
      expect(body.total).toBe(180);
      expect(backendRecomputedTotal(body)).toBe(body.total);
    });

    it('posts the sale as completed so it is not hidden from every report', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);

      const body = httpMock.expectOne('/api/transactions').request.body;
      // 'pending' on a queued sale means "not yet synced", not "not yet paid".
      // ReportingService counts only Status == "completed", so relaying the queued
      // 'pending' verbatim would sync the sale and still leave it out of the books.
      expect(body.status).toBe('completed');
    });

    it('keeps the discount record so the sale reconciles against the receipt', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);

      const body = httpMock.expectOne('/api/transactions').request.body;
      expect(body.items[0].discount).toEqual({ type: 'senior', percentage: 20, amount: 40 });
      expect(body.customerInfo.discountType).toBe('senior');
      expect(body.customerInfo.discountId).toBe('SC-1234');
    });
  });

  describe('when the queue is allowed to drain', () => {
    it('leaves the sale on disk while its POST is still in flight', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);

      // Request issued but never answered — the tab is closed, the device sleeps, or
      // the page navigates away. Nothing has confirmed the sale, so nothing may be
      // dropped: whatever is on disk at this instant is all that survives.
      httpMock.expectOne('/api/transactions');

      expect(persistedQueue().length).toBe(1);
      expect(persistedQueue()[0].total).toBe(180);
    });

    it('removes the sale from disk only after the server confirms it', () => {
      const sale = queuedSale();
      bootWithQueuedSale(sale);

      isOnline$.next(true);
      const request = httpMock.expectOne('/api/transactions');
      expect(persistedQueue().length).toBe(1);

      request.flush({ ...sale, id: 99, status: 'completed' });

      expect(persistedQueue()).toEqual([]);
    });

    it('keeps the sale queued when the server rejects it', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);
      httpMock.expectOne('/api/transactions').error(new ProgressEvent('error'), { status: 0 });

      expect(persistedQueue().length).toBe(1);
    });

    it('drains each sale independently when one of two fails', () => {
      const first = queuedSale({ id: 1, total: 180 });
      const second = queuedSale({ id: 2, total: 180 });
      localStorage.setItem('pendingTransactions', JSON.stringify([first, second]));
      localStorage.setItem('transactions', JSON.stringify([first, second]));
      TestBed.inject(TransactionService);

      isOnline$.next(true);
      const requests = httpMock.match('/api/transactions');
      expect(requests.length).toBe(2);

      requests[0].flush({ ...first, status: 'completed' });
      requests[1].error(new ProgressEvent('error'), { status: 0 });

      const remaining = persistedQueue();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(2);
    });

    it('does not re-post a sale whose first POST has not come back yet', () => {
      bootWithQueuedSale(queuedSale());

      isOnline$.next(true);
      const first = httpMock.match('/api/transactions');
      expect(first.length).toBe(1);

      // isOnline$ re-emits on every 30s health check. The sale is still queued because
      // its POST is in flight; posting it again would double-book the customer.
      isOnline$.next(true);
      expect(httpMock.match('/api/transactions').length).toBe(0);

      first[0].flush({ id: 99, status: 'completed' });
    });
  });

  describe('when the device cannot persist the queue', () => {
    beforeEach(() => {
      spyOn(console, 'error');
      spyOn(console, 'warn');
    });

    it('tells the cashier when the sale cannot be written to disk at all', () => {
      spyOn(localStorage, 'setItem').and.callFake(() => {
        throw new DOMException('exceeded the quota', 'QuotaExceededError');
      });
      const service = TestBed.inject(TransactionService);

      service.createTransaction(
        [{ productId: 'p1', name: 'Latte', price: 100, quantity: 1, total: 100, image: '', category: 'Coffee', stock: 5 }],
        'cash',
        { name: '', email: '', phone: '', discountType: 'none', discountId: '' }
      ).subscribe();

      // Silence here would mean an unsynced sale living only in memory, with the
      // cashier believing it was saved.
      expect(toast.error).toHaveBeenCalled();
      expect(toast.error.calls.mostRecent().args[0]).toContain('unsynced sale');
    });

    it('drops the transactions display cache to make room rather than lose a sale', () => {
      const realSetItem = localStorage.setItem.bind(localStorage);
      // Mimics a shared origin quota that the 'transactions' blob has filled: writes
      // only succeed once that key is gone.
      spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
        if (localStorage.getItem('transactions') !== null) {
          throw new DOMException('exceeded the quota', 'QuotaExceededError');
        }
        realSetItem(key, value);
      });
      realSetItem('transactions', JSON.stringify([queuedSale()]));
      realSetItem('pendingTransactions', JSON.stringify([]));

      const service = TestBed.inject(TransactionService);
      service.createTransaction(
        [{ productId: 'p1', name: 'Latte', price: 100, quantity: 1, total: 100, image: '', category: 'Coffee', stock: 5 }],
        'cash',
        { name: '', email: '', phone: '', discountType: 'none', discountId: '' }
      ).subscribe();

      expect(persistedQueue().length).toBe(1);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('tells the cashier when the queue on disk cannot be read back', () => {
      localStorage.setItem('pendingTransactions', '{ not json');

      TestBed.inject(TransactionService);

      expect(toast.error).toHaveBeenCalled();
    });
  });

  /**
   * DELIBERATE RED TEST — D3, pinned and not fixed in this branch.
   *
   * A sale rung up at 14:00 during an outage and synced at 18:00 is recorded at 18:00:
   * TransactionService.cs sets `transaction.Timestamp = DateTime.UtcNow` unconditionally
   * on create, and the create contract has no field for a client-supplied sale time. When
   * the outage spans midnight the sale lands on the wrong calendar day, which corrupts
   * that day's sales report and both days' P&L.
   *
   * Fixing it means changing the transaction-create contract to accept the sale time,
   * which is a design decision that belongs in the offline spec rather than in a bug fix
   * branch. This test is expected to FAIL until that decision is made. Do not delete it
   * and do not weaken it to green — it is the only record that the defect is known.
   */
  describe('DELIBERATE RED TEST: D3 synced offline sales get the wrong timestamp', () => {
    it('keeps the original sale time when a sale queued before midnight syncs the next day', () => {
      // Rung up at 23:40 on 16 October, during the outage.
      const saleTime = '2026-10-16T15:40:00.000Z';
      const sale = queuedSale({ timestamp: saleTime });
      bootWithQueuedSale(sale);

      isOnline$.next(true);
      const request = httpMock.expectOne('/api/transactions');

      // The backend answers with its own creation time, as it does today.
      const syncedAt = '2026-10-17T02:15:00.000Z';
      request.flush({ ...sale, id: 99, status: 'completed', timestamp: syncedAt });

      let recorded: Transaction | undefined;
      TestBed.inject(TransactionService).getTransactions().subscribe(list => {
        recorded = list.find(t => t.total === 180);
      });

      expect(recorded?.timestamp).toBe(saleTime);
    });
  });
});
