import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CartItem } from '../models/cart-item.model';
import { CustomerInfo } from '../models/transaction.model';
import { OfflineService } from '../../../core/services/offline.service';
import { TransactionService } from './transaction.service';

/**
 * Covers how TransactionService turns a cart into the amount posted to the backend:
 * total = (sum of already-discounted line totals) + service fee, with no VAT added on
 * top because tax is baked into product prices. This is the figure the customer pays.
 */
describe('TransactionService total composition', () => {
  let service: TransactionService;
  let httpMock: HttpTestingController;

  const customer: CustomerInfo = {
    name: 'Test Customer',
    email: '',
    phone: '',
    discountType: 'none',
    discountId: ''
  };

  const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    productId: 'p1',
    name: 'Latte',
    price: 100,
    quantity: 1,
    total: 100,
    image: '',
    category: 'Coffee',
    stock: 50,
    ...overrides
  });

  /** Pulls the body of the POST /api/transactions request the service just issued. */
  const capturePostedBody = (): any => {
    const request = httpMock.expectOne('/api/transactions');
    expect(request.request.method).toBe('POST');
    const body = request.request.body;
    request.flush({ id: 1, ...body });
    return body;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OfflineService, useValue: { isOnline$: new BehaviorSubject<boolean>(true) } }
      ]
    });
    service = TestBed.inject(TransactionService);
    httpMock = TestBed.inject(HttpTestingController);

    // The constructor eagerly loads existing transactions; answer it so the
    // assertions below only ever see the POST under test.
    httpMock.match('/api/transactions').forEach(request => request.flush([]));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('sums the discounted line totals and adds the service fee on top', () => {
    const items = [
      // 2 x 100 with a 20% senior discount already applied by CartService.
      makeItem({ productId: 'p1', price: 100, quantity: 2, total: 160, discount: { type: 'senior', percentage: 20, amount: 40 } }),
      makeItem({ productId: 'p2', name: 'Muffin', price: 50, quantity: 1, total: 50 })
    ];

    service.createTransaction(items, 'cash', customer, 'takeOut', 15, 300, 75).subscribe();

    const body = capturePostedBody();
    expect(body.total).toBe(225); // 160 + 50 + 15
    expect(body.serviceFee).toBe(15);
    expect(body.serviceType).toBe('takeOut');
    expect(body.amountReceived).toBe(300);
    expect(body.change).toBe(75);
  });

  it('adds no VAT on top of the line totals when there is no service fee', () => {
    service.createTransaction([makeItem({ price: 100, quantity: 3, total: 300 })], 'cash', customer).subscribe();

    const body = capturePostedBody();
    expect(body.total).toBe(300);
    expect(body.serviceFee).toBe(0);
    expect(body.serviceType).toBe('dineIn'); // default when not supplied
  });

  it('preserves the per-line discount record so the receipt can be reprinted', () => {
    const discount = { type: 'pwd' as const, percentage: 20, amount: 40 };
    service.createTransaction([makeItem({ quantity: 2, total: 160, discount })], 'cash', customer).subscribe();

    const body = capturePostedBody();
    expect(body.items[0].discount).toEqual(discount);
  });

  it('fills in basePrice and normalises a missing temperature for the backend enum', () => {
    const items = [
      // No basePrice: should fall back to the line price rather than posting undefined.
      makeItem({ productId: 'p1', price: 125, total: 125 }),
      makeItem({ productId: 'p2', price: 130, basePrice: 100, total: 130, temperature: 'hot' })
    ];

    service.createTransaction(items, 'cash', customer).subscribe();

    const body = capturePostedBody();
    expect(body.items[0].basePrice).toBe(125);
    expect(body.items[0].temperature).toBe('none');
    expect(body.items[1].basePrice).toBe(100);
    expect(body.items[1].temperature).toBe('hot');
  });

  it('falls back to a pending offline transaction when the network is unreachable', () => {
    let result: any;
    service.createTransaction([makeItem({ quantity: 2, total: 160 })], 'cash', customer, 'dineIn', 20).subscribe(t => (result = t));

    httpMock.expectOne('/api/transactions').error(new ProgressEvent('error'), { status: 0 });

    expect(result).toBeTruthy();
    expect(result.status).toBe('pending');
    expect(result.total).toBe(180); // 160 + 20 service fee, preserved offline
  });
});
