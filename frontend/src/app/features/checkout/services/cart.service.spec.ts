import { TestBed } from '@angular/core/testing';

import { Product } from '../../pos/models/product.model';
import { CartItem } from '../models/cart-item.model';
import { CartService } from './cart.service';

/**
 * Covers the discount arithmetic in CartService — the money path that decides what a
 * customer is actually charged. Senior Citizen / PWD discounts are statutory in the
 * Philippines, so an error here is a compliance problem, not just a display bug.
 */
describe('CartService discount arithmetic', () => {
  let service: CartService;

  const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'p1',
    name: 'Latte',
    price: 100,
    category: 'Coffee',
    stock: 50,
    image: '',
    ...overrides
  });

  beforeEach(() => {
    // CartService rehydrates from localStorage in its constructor, so clear it first.
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('percentage discounts', () => {
    it('applies the percentage to every line and leaves the pre-discount subtotal intact', () => {
      service.addToCart(makeProduct({ id: 'p1', price: 100 }), 2);
      service.addToCart(makeProduct({ id: 'p2', name: 'Muffin', price: 50 }), 1);

      service.applyDiscountToCart('senior', 20);

      const items = readItems(service);
      expect(items[0].total).toBe(160); // 200 - 20%
      expect(items[0].discount).toEqual({ type: 'senior', percentage: 20, amount: 40 });
      expect(items[1].total).toBe(40); // 50 - 20%
      expect(items[1].discount).toEqual({ type: 'senior', percentage: 20, amount: 10 });

      expect(service.getDiscountTotal()).toBe(50);
      expect(service.getCartTotal()).toBe(200);
      // getSubtotalBeforeDiscount reads price * quantity, so it must NOT move.
      expect(service.getSubtotalBeforeDiscount()).toBe(250);
    });

    it('does not compound when the same discount is applied twice', () => {
      service.addToCart(makeProduct({ price: 100 }), 2);

      service.applyDiscountToCart('pwd', 20);
      service.applyDiscountToCart('pwd', 20);

      expect(service.getDiscountTotal()).toBe(40);
      expect(service.getCartTotal()).toBe(160);
    });

    it('prices add-ons into the discounted line, not around it', () => {
      // Line price becomes 100 + 25 = 125; 2 units = 250; 20% off = 200.
      service.addToCart(makeProduct({ price: 100 }), 2, null, [{ name: 'Extra shot', price: 25 }]);

      service.applyDiscountToCart('senior', 20);

      expect(service.getSubtotalBeforeDiscount()).toBe(250);
      expect(service.getDiscountTotal()).toBe(50);
      expect(service.getCartTotal()).toBe(200);
    });
  });

  describe('flat-amount discounts', () => {
    it('spreads the amount across lines in proportion to each line subtotal', () => {
      service.addToCart(makeProduct({ id: 'p1', price: 100 }), 1); // 100 of 400
      service.addToCart(makeProduct({ id: 'p2', name: 'Cake', price: 300 }), 1); // 300 of 400

      service.applyDiscountToCart('manual', 40, true);

      const items = readItems(service);
      expect(items[0].discount?.amount).toBeCloseTo(10, 10);
      expect(items[1].discount?.amount).toBeCloseTo(30, 10);
      // Each line is discounted by the same effective rate (40 / 400 = 10%).
      expect(items[0].discount?.percentage).toBeCloseTo(10, 10);
      expect(items[1].discount?.percentage).toBeCloseTo(10, 10);

      // The distributed amounts must add back up to exactly what was asked for.
      expect(service.getDiscountTotal()).toBeCloseTo(40, 10);
      expect(service.getCartTotal()).toBeCloseTo(360, 10);
    });

    it('ignores a flat discount on an empty cart rather than producing a negative total', () => {
      service.applyDiscountToCart('manual', 40, true);

      expect(readItems(service)).toEqual([]);
      expect(service.getCartTotal()).toBe(0);
      expect(service.getDiscountTotal()).toBe(0);
    });
  });

  describe('removeDiscountFromCart', () => {
    it('restores every line to price * quantity and drops the discount record', () => {
      service.addToCart(makeProduct({ id: 'p1', price: 100 }), 2);
      service.addToCart(makeProduct({ id: 'p2', name: 'Muffin', price: 50 }), 3);
      service.applyDiscountToCart('senior', 20);

      service.removeDiscountFromCart();

      const items = readItems(service);
      expect(items[0].total).toBe(200);
      expect(items[1].total).toBe(150);
      expect(items[0].discount).toBeUndefined();
      expect(items[1].discount).toBeUndefined();

      expect(service.getDiscountTotal()).toBe(0);
      expect(service.getCartTotal()).toBe(350);
      expect(service.getSubtotalBeforeDiscount()).toBe(350);
    });
  });
});

/** Synchronously snapshot the current cart contents from the BehaviorSubject. */
function readItems(service: CartService): CartItem[] {
  let items: CartItem[] = [];
  service.getCartItems().subscribe(value => (items = value)).unsubscribe();
  return items;
}
