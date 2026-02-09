import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CartItem, AddOn } from '../models/cart-item.model';
import { OpenOrder } from '../models/open-order.model';
import { Product } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  private storageKey = 'pos_cart';
  private saveTimeout: any;
  private cartTotals = { subtotal: 0, total: 0, itemCount: 0 };
  private openOrdersSubject = new BehaviorSubject<OpenOrder[]>([]);
  private openOrdersStorageKey = 'pos_open_orders';
  private activeOpenOrderId: number | null = null;

  constructor() {
    this.loadCartFromStorage();
    this.loadOpenOrdersFromStorage();
  }

  getCartItems(): Observable<CartItem[]> {
    return this.cartItemsSubject.asObservable();
  }

  getOpenOrders(): Observable<OpenOrder[]> {
    return this.openOrdersSubject.asObservable();
  }

  hasActiveOpenOrder(): boolean {
    return this.activeOpenOrderId !== null;
  }

  getActiveOpenOrderId(): number | null {
    return this.activeOpenOrderId;
  }

  saveOpenOrder(name?: string): OpenOrder | null {
    const items = this.cartItemsSubject.value;
    if (items.length === 0) return null;

    const trimmedName = name?.trim();
    const current = this.openOrdersSubject.value;
    let openOrder: OpenOrder;

    if (this.activeOpenOrderId !== null) {
      const existingIndex = current.findIndex(order => order.id === this.activeOpenOrderId);
      if (existingIndex !== -1) {
        const existing = current[existingIndex];
        openOrder = {
          ...existing,
          name: trimmedName || existing.name,
          items: this.cloneCartItems(items)
        };
        const updated = [...current];
        updated.splice(existingIndex, 1);
        this.openOrdersSubject.next([openOrder, ...updated]);
        this.saveOpenOrdersToStorage();
        this.clearCart();
        return openOrder;
      }
    }

    openOrder = {
      id: Date.now(),
      name: trimmedName || `Open Order ${new Date().toLocaleString()}`,
      items: this.cloneCartItems(items),
      createdAt: new Date().toISOString()
    };

    this.openOrdersSubject.next([openOrder, ...current]);
    this.saveOpenOrdersToStorage();

    this.clearCart();
    return openOrder;
  }

  loadOpenOrder(id: number): void {
    const openOrder = this.openOrdersSubject.value.find(order => order.id === id);
    if (!openOrder) return;

    this.activeOpenOrderId = id;
    this.cartItemsSubject.next(this.cloneCartItems(openOrder.items));
    this.recalculateTotals();
    this.debouncedSaveCart();
  }

  removeOpenOrder(id: number): void {
    const updated = this.openOrdersSubject.value.filter(order => order.id !== id);
    this.openOrdersSubject.next(updated);
    this.saveOpenOrdersToStorage();
    if (this.activeOpenOrderId === id) {
      this.activeOpenOrderId = null;
    }
  }

  addToCart(product: Product, quantity: number = 1, temperature: 'hot' | 'cold' | null = null, addOns?: AddOn[]): void {
    const currentItems = this.cartItemsSubject.value;

    // Calculate price based on temperature
    let itemPrice = product.price;
    if (temperature === 'hot' && product.hotPrice !== undefined) {
      itemPrice = product.hotPrice;
    } else if (temperature === 'cold' && product.coldPrice !== undefined) {
      itemPrice = product.coldPrice;
    }

    // Add add-on prices to item price (accounting for quantities)
    const addOnsTotal = addOns ? addOns.reduce((sum, addOn) => {
      const quantity = addOn.quantity || 1;
      return sum + (addOn.price * quantity);
    }, 0) : 0;
    const finalItemPrice = itemPrice + addOnsTotal;

    // Check if item with same product ID, temperature, and add-ons already exists
    // For simplicity, we'll compare add-ons by creating a sorted string key with quantities
    const addOnsKey = addOns ? addOns.map(a => `${a.name}:${a.quantity || 1}`).sort().join(',') : '';
    const existingItemIndex = currentItems.findIndex(item => {
      const itemAddOnsKey = item.addOns ? item.addOns.map(a => `${a.name}:${a.quantity || 1}`).sort().join(',') : '';
      return item.productId === product.id &&
        item.temperature === temperature &&
        itemAddOnsKey === addOnsKey;
    });

    if (existingItemIndex !== -1) {
      // Update existing item
      currentItems[existingItemIndex].quantity += quantity;
      currentItems[existingItemIndex].total =
        currentItems[existingItemIndex].quantity * finalItemPrice;
    } else {
      // Add new item
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        price: finalItemPrice,
        basePrice: product.price,
        quantity: quantity,
        total: finalItemPrice * quantity,
        image: product.image,
        category: product.category,
        stock: product.stock,
        temperature: temperature || undefined,
        addOns: addOns && addOns.length > 0 ? [...addOns] : undefined
      };
      currentItems.push(newItem);
    }

    // Update totals incrementally
    this.updateTotalsIncrementally(finalItemPrice * quantity);

    // Use next() with the same array reference for better performance
    this.cartItemsSubject.next(currentItems);

    // Debounced save to localStorage
    this.debouncedSaveCart();
  }

  updateQuantity(productId: string, quantity: number): void {
    const currentItems = this.cartItemsSubject.value;
    const itemIndex = currentItems.findIndex(item => item.productId === productId);

    if (itemIndex !== -1) {
      const oldTotal = currentItems[itemIndex].total;

      if (quantity <= 0) {
        currentItems.splice(itemIndex, 1);
        this.updateTotalsIncrementally(-oldTotal);
      } else {
        const newTotal = currentItems[itemIndex].price * quantity;
        currentItems[itemIndex].quantity = quantity;
        currentItems[itemIndex].total = newTotal;
        this.updateTotalsIncrementally(newTotal - oldTotal);
      }

      this.cartItemsSubject.next(currentItems);
      this.debouncedSaveCart();
    }
  }

  removeFromCart(productId: string): void {
    const currentItems = this.cartItemsSubject.value;
    const itemIndex = currentItems.findIndex(item => item.productId === productId);

    if (itemIndex !== -1) {
      const removedTotal = currentItems[itemIndex].total;
      currentItems.splice(itemIndex, 1);

      this.updateTotalsIncrementally(-removedTotal);
      this.cartItemsSubject.next(currentItems);
      this.debouncedSaveCart();
    }
  }

  clearCart(): void {
    this.cartItemsSubject.next([]);
    this.resetTotals();
    this.debouncedSaveCart();
    this.activeOpenOrderId = null;
  }

  completeOpenOrder(): void {
    if (this.activeOpenOrderId === null) return;
    this.removeOpenOrder(this.activeOpenOrderId);
    this.activeOpenOrderId = null;
  }

  getCartTotal(): number {
    return this.cartTotals.total;
  }

  getCartItemCount(): number {
    return this.cartTotals.itemCount;
  }

  // Discount methods
  applyDiscountToCart(discountType: 'senior' | 'pwd' | 'manual', discountPercentage: number = 20): void {
    const currentItems = this.cartItemsSubject.value;
    const updatedItems = currentItems.map(item => {
      const discountAmount = (item.price * item.quantity * discountPercentage) / 100;
      const discountedTotal = (item.price * item.quantity) - discountAmount;

      return {
        ...item,
        total: discountedTotal,
        discount: {
          type: discountType,
          percentage: discountPercentage,
          amount: discountAmount
        }
      };
    });

    this.cartItemsSubject.next(updatedItems);
    this.recalculateTotals(); // Recalculate after discount changes
    this.debouncedSaveCart();
  }

  removeDiscountFromCart(): void {
    const currentItems = this.cartItemsSubject.value;
    const updatedItems = currentItems.map(item => {
      const { discount, ...itemWithoutDiscount } = item;
      return {
        ...itemWithoutDiscount,
        total: item.price * item.quantity
      };
    });

    this.cartItemsSubject.next(updatedItems);
    this.recalculateTotals(); // Recalculate after discount changes
    this.debouncedSaveCart();
  }

  getDiscountTotal(): number {
    const items = this.cartItemsSubject.value;
    return items.reduce((total, item) => {
      return total + (item.discount?.amount || 0);
    }, 0);
  }

  getSubtotalBeforeDiscount(): number {
    const items = this.cartItemsSubject.value;
    return items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  }

  // Performance optimization: Update totals incrementally
  private updateTotalsIncrementally(amount: number): void {
    this.cartTotals.subtotal += amount;
    this.cartTotals.total = this.cartTotals.subtotal;

    // Update item count
    const items = this.cartItemsSubject.value;
    this.cartTotals.itemCount = items.reduce((count, item) => count + item.quantity, 0);
  }

  // Performance optimization: Reset totals
  private resetTotals(): void {
    this.cartTotals.subtotal = 0;
    this.cartTotals.total = 0;
    this.cartTotals.itemCount = 0;
  }

  // Performance optimization: Recalculate totals (only when necessary)
  private recalculateTotals(): void {
    const items = this.cartItemsSubject.value;
    this.cartTotals.subtotal = items.reduce((total, item) => total + item.total, 0);
    this.cartTotals.total = this.cartTotals.subtotal;
    this.cartTotals.itemCount = items.reduce((count, item) => count + item.quantity, 0);
  }

  // Performance optimization: Debounced localStorage save
  private debouncedSaveCart(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveCartToStorage();
    }, 150); // Reduced debounce time for better responsiveness
  }

  private saveCartToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.cartItemsSubject.value));
    } catch (error) {
      // Error saving cart to storage
    }
  }

  private saveOpenOrdersToStorage(): void {
    try {
      localStorage.setItem(this.openOrdersStorageKey, JSON.stringify(this.openOrdersSubject.value));
    } catch (error) {
      // Error saving open orders to storage
    }
  }

  private loadCartFromStorage(): void {
    try {
      const savedCart = localStorage.getItem(this.storageKey);
      if (savedCart) {
        const cartItems = JSON.parse(savedCart);
        this.cartItemsSubject.next(cartItems);
        this.recalculateTotals(); // Recalculate totals after loading
      }
    } catch (error) {
      // Error loading cart from storage
    }
  }

  private loadOpenOrdersFromStorage(): void {
    try {
      const savedOpenOrders = localStorage.getItem(this.openOrdersStorageKey);
      if (savedOpenOrders) {
        const openOrders = JSON.parse(savedOpenOrders);
        this.openOrdersSubject.next(openOrders);
      }
    } catch (error) {
      // Error loading open orders from storage
    }
  }

  private cloneCartItems(items: CartItem[]): CartItem[] {
    return items.map(item => ({
      ...item,
      addOns: item.addOns ? item.addOns.map(addOn => ({ ...addOn })) : undefined
    }));
  }
}

