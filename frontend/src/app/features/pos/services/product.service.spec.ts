import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { ProductService } from './product.service';
import { OfflineService } from '../../../core/services/offline.service';
import { Product } from '../models/product.model';

/**
 * H2 regression specs: the POS catalog fetch used to be hard-capped at
 * `pageSize=100` (page 1 only), so products past the first 100 never reached the
 * POS grid or the localStorage offline cache. The service now accumulates
 * GET /api/products pages until a short page terminates the loop.
 */
describe('ProductService catalog paging (H2)', () => {
  const PAGE_SIZE = 100;

  const makeProduct = (i: number): Product =>
    ({ id: `p${i}`, name: `Item ${i}`, price: 10, category: 'Drinks', stock: 5, image: '' });

  const pageOf = (n: number, offset: number): Product[] =>
    Array.from({ length: n }, (_, k) => makeProduct(offset + k));

  let httpTesting: HttpTestingController;
  let isOnline$: Subject<boolean>;

  beforeEach(() => {
    localStorage.clear();
    isOnline$ = new Subject<boolean>() as any;
    // ProductService only reads offlineService.isOnline$ — drive it with a test
    // Subject so offline behavior stays deterministic (starts "online").
    (isOnline$ as any).value = true;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OfflineService, useValue: { isOnline$: isOnline$ } as unknown as OfflineService }
      ]
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // Satisfy (or flush) the constructor's categories fetch so afterEach verify() stays clean.
  const drainCategories = (categories: string[] = []): void => {
    httpTesting.expectOne('/api/products/categories').flush(categories);
  };

  it('accumulates every page so the POS gets the full catalog, not the first 100', () => {
    const emitted: Product[][] = [];
    const service = TestBed.inject(ProductService);
    service.getProducts().subscribe(products => emitted.push([...products]));

    // The constructor starts the initial load: page 1.
    const page1 = httpTesting.expectOne('/api/products?page=1&pageSize=100');
    expect(page1.request.method).toBe('GET');
    page1.flush(pageOf(PAGE_SIZE, 0));

    // A full page must trigger page 2, and the short page must end the loop.
    const page2 = httpTesting.expectOne('/api/products?page=2&pageSize=100');
    page2.flush(pageOf(41, PAGE_SIZE));
    drainCategories();

    const final = emitted[emitted.length - 1];
    expect(final.length).toBe(141);
    expect(final[0].id).toBe('p0');
    expect(final[140].id).toBe('p140');
    // The offline cache must hold the full accumulated catalog too.
    expect(JSON.parse(localStorage.getItem('products') || '[]').length).toBe(141);
  });

  it('treats an exactly-full last page as maybe-incomplete and still fetches the next page', () => {
    const emitted: Product[][] = [];
    const service = TestBed.inject(ProductService);
    service.getProducts().subscribe(products => emitted.push([...products]));

    const page1 = httpTesting.expectOne('/api/products?page=1&pageSize=100');
    page1.flush(pageOf(PAGE_SIZE, 0));
    // Catalog is exactly 100 — the loop must still ask for page 2 and stop on it.
    const page2 = httpTesting.expectOne('/api/products?page=2&pageSize=100');
    page2.flush([]);
    drainCategories();

    const final = emitted[emitted.length - 1];
    expect(final.length).toBe(PAGE_SIZE);
    expect(final[0].id).toBe('p0');
    expect(final[99].id).toBe('p99');
  });

  it('getProductsForAdmin accumulates pages past 100 with the isActive filter intact', () => {
    const service = TestBed.inject(ProductService);
    // Drain the constructor's initial catalog + categories load (single empty page).
    httpTesting.expectOne('/api/products?page=1&pageSize=100').flush([]);
    httpTesting.expectOne('/api/products/categories').flush([]);

    let result: Product[] | undefined;
    service.getProductsForAdmin(true).subscribe(products => (result = products));

    const page1 = httpTesting.expectOne('/api/products?page=1&pageSize=100&isActive=true');
    page1.flush(pageOf(PAGE_SIZE, 0));
    const page2 = httpTesting.expectOne('/api/products?page=2&pageSize=100&isActive=true');
    page2.flush(pageOf(20, PAGE_SIZE));

    expect(result!.length).toBe(120);
  });

  it('stays on the localStorage cache when offline (paging never touches HTTP)', () => {
    localStorage.setItem('products', JSON.stringify(pageOf(3, 0)));
    (isOnline$ as any).value = false;

    const emitted: Product[][] = [];
    const service = TestBed.inject(ProductService);
    service.getProducts().subscribe(products => emitted.push([...products]));

    expect(emitted[emitted.length - 1].map(p => p.id)).toEqual(['p0', 'p1', 'p2']);
    // No products HTTP request may leave the page while offline; verify() in
    // afterEach fails the spec if one did.
  });

  it('falls back to the cached catalog when the API errors', () => {
    const emitted: Product[][] = [];
    const loading: boolean[] = [];
    const service = TestBed.inject(ProductService);
    service.getProducts().subscribe(products => emitted.push([...products]));
    service.getProductsLoading().subscribe(state => loading.push(state));

    httpTesting.expectOne('/api/products?page=1&pageSize=100').flush('error', { status: 500, statusText: 'Server Error' });
    httpTesting.expectOne('/api/products/categories').flush([]);

    expect(emitted[emitted.length - 1]).toEqual([]);
    expect(loading[loading.length - 1]).toBeFalse();
  });
});