import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BestSellerService } from './best-seller.service';

describe('BestSellerService', () => {
  let service: BestSellerService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(BestSellerService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('fetches best sellers and publishes the product-id set', () => {
    service.load(30, 10);

    const req = httpTesting.expectOne('/api/products/best-sellers?days=30&count=10');
    expect(req.request.method).toBe('GET');
    req.flush([
      { productId: 'p1', name: 'Latte', category: 'Drinks', quantity: 6, revenue: 600 },
      { productId: 'p2', name: 'Croissant', category: 'Food', quantity: 2, revenue: 160 }
    ]);

    const ids = service.getBestSellerIds();
    expect(ids.has('p1')).toBeTrue();
    expect(ids.has('p2')).toBeTrue();
    expect(ids.size).toBe(2);
    expect(service.isBestSeller('p1')).toBeTrue();
    expect(service.isBestSeller('missing')).toBeFalse();
  });

  it('maps PascalCase API keys too (backend serializes anonymous rows PascalCase)', () => {
    service.load();

    const req = httpTesting.expectOne('/api/products/best-sellers?days=30&count=10');
    req.flush([
      { ProductId: 'p3', Name: 'Cake', Category: 'Food', Quantity: 2, Revenue: 500 }
    ]);

    expect(service.isBestSeller('p3')).toBeTrue();
  });

  it('degrades to an empty set when the API errors', () => {
    service.load();

    const req = httpTesting.expectOne('/api/products/best-sellers?days=30&count=10');
    req.flush('error', { status: 500, statusText: 'Server Error' });

    expect(service.getBestSellerIds().size).toBe(0);
    expect(service.isBestSeller('p1')).toBeFalse();
  });

  it('refresh() re-fetches the window', () => {
    service.refresh();

    const req = httpTesting.expectOne('/api/products/best-sellers?days=30&count=10');
    expect(req.request.method).toBe('GET');
    req.flush([{ productId: 'p1', name: 'Latte', category: 'Drinks', quantity: 1, revenue: 100 }]);

    expect(service.isBestSeller('p1')).toBeTrue();
  });
});