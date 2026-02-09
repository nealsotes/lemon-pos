import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CartItem } from '../../models/cart-item.model';
import { OpenOrder } from '../../models/open-order.model';
import { CartService } from '../../services/cart.service';
import { CheckoutSidebarComponent } from '../checkout/checkout-sidebar.component';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CheckoutSidebarComponent
  ],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {
  cartItems: CartItem[] = [];
  openOrders: OpenOrder[] = [];
  isOpenOrderActive = false;
  activeOpenOrderId: number | null = null;
  activeOpenOrderName = '';
  subtotal = 0;
  tax = 0;
  total = 0;
  isCheckoutOpen = false;

  constructor(
    private cartService: CartService
  ) {}

  ngOnInit(): void {
    this.cartService.getCartItems().subscribe(items => {
      this.cartItems = items;
      this.calculateTotals();
      this.updateActiveOpenOrderDisplay();
    });

    this.cartService.getOpenOrders().subscribe(openOrders => {
      this.openOrders = openOrders;
      this.updateActiveOpenOrderDisplay();
    });
  }

  private calculateTotals(): void {
    // Calculate subtotal (tax is already included in product prices)
    this.subtotal = this.cartItems.reduce((sum, item) => sum + item.total, 0);
    
    // Set total to subtotal (since tax is already included in product prices)
    this.total = this.subtotal;
    this.tax = 0; // No separate tax display
  }

  increaseQuantity(item: CartItem): void {
    if (item.quantity < item.stock) {
      this.cartService.updateQuantity(item.productId, item.quantity + 1);
    }
  }

  decreaseQuantity(item: CartItem): void {
    if (item.quantity > 1) {
      this.cartService.updateQuantity(item.productId, item.quantity - 1);
    }
  }

  removeFromCart(item: CartItem): void {
    this.cartService.removeFromCart(item.productId);
  }

  clearCart(): void {
    this.cartService.clearCart();
  }

  saveOpenOrder(): void {
    if (this.cartItems.length === 0) {
      return;
    }
    this.cartService.saveOpenOrder();
  }

  loadOpenOrder(order: OpenOrder): void {
    this.cartService.loadOpenOrder(order.id);
  }

  removeOpenOrder(order: OpenOrder): void {
    this.cartService.removeOpenOrder(order.id);
  }

  proceedToCheckout(): void {
    if (this.cartItems.length === 0) {
      return;
    }
    
    // Open checkout sidebar instead of navigating
    this.isCheckoutOpen = true;
  }

  closeCheckout(): void {
    this.isCheckoutOpen = false;
  }

  onTransactionComplete(event: any): void {
    // Reload cart data to update counts and totals
    this.cartService.getCartItems().subscribe(items => {
      this.cartItems = items;
      this.calculateTotals();
    });
    // Don't close checkout sidebar immediately - receipt sidebar is embedded in it
    // The receipt sidebar will close both sidebars when user closes it
    // Keep checkout sidebar open so receipt sidebar can be displayed
  }

  trackByItem(index: number, item: CartItem): string {
    // Include temperature and add-ons in the key to ensure items with same product
    // but different temperatures/add-ons are treated as separate items
    const addOnsKey = item.addOns ? item.addOns.map(a => a.name).sort().join(',') : '';
    const temperatureKey = item.temperature || 'none';
    return `${item.productId}-${temperatureKey}-${addOnsKey}`;
  }

  isImageUrl(image: string | undefined): boolean {
    if (!image) return false;
    return image.startsWith('data:image/') ||
      image.startsWith('http') ||
      image.startsWith('/uploads/') ||
      image.startsWith('/');
  }

  getCartImageUrl(image: string | undefined): string | undefined {
    return this.isImageUrl(image) ? image : undefined;
  }

  onImageError(event: any): void {
    const img = event.target;
    img.style.display = 'none';
    const placeholder = img.parentElement?.querySelector('.image-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  }

  private updateActiveOpenOrderDisplay(): void {
    this.activeOpenOrderId = this.cartService.getActiveOpenOrderId();
    this.isOpenOrderActive = this.activeOpenOrderId !== null;
    const activeOrder = this.activeOpenOrderId
      ? this.openOrders.find(order => order.id === this.activeOpenOrderId)
      : undefined;
    this.activeOpenOrderName = activeOrder?.name || '';
  }
}




