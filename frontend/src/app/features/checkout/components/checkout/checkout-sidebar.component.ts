import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartItem } from '../../models/cart-item.model';
import { CartService } from '../../services/cart.service';
import { TransactionService } from '../../services/transaction.service';
import { ReceiptNumberService } from '../../services/receipt-number.service';
import { CustomerInfo } from '../../models/transaction.model';
import { ReceiptSidebarComponent } from '../receipt/receipt-sidebar.component';

@Component({
  selector: 'app-checkout-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReceiptSidebarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./checkout-sidebar.component.css'],
  template: `
    <!-- Checkout Sidebar Overlay -->
    <div class="checkout-overlay" [class.active]="isOpen" [class.inline]="inline" (click)="!inline && closeCheckout()">
      <div class="checkout-sidebar" [class.inline]="inline" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="checkout-header">
          <div class="header-left">
            <button *ngIf="inline" class="back-btn" (click)="back.emit()" title="Back to Cart">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <h2>Checkout</h2>
            <div class="form-status" *ngIf="isFormDirty">
              <svg class="status-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="status-text">Saving...</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="restore-btn" *ngIf="hasSavedData() && !hasFormData()" (click)="restoreSavedData()" title="Restore Saved Data">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 21v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="clear-btn" (click)="clearFormData()" title="Clear Form">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button *ngIf="!inline" class="close-btn" (click)="closeCheckout()">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Success/Error Messages -->
        <div *ngIf="message" class="message-container" [class]="messageType">
          <div class="message-content">
            <span class="message-icon">
              <svg *ngIf="messageType === 'success'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg *ngIf="messageType === 'error'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="message-text">{{ message }}</span>
            <button class="message-close" (click)="clearMessage()">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="checkout-content">
          <!-- Open Orders -->
          <div class="section">
            <div class="open-orders-header-row">
              <h3>Open Orders</h3>
            </div>
            <div class="open-order-name-row">
              <input
                type="text"
                [(ngModel)]="openOrderName"
                placeholder="Optional name (e.g., Table 3, John)"
              >
            </div>
            <button class="open-order-save-btn" (click)="saveOpenOrder()" [disabled]="cartItems.length === 0">
              Save Open Order
            </button>
          </div>

          <!-- Customer Information -->
          <div class="section">
            <h3>Customer Information</h3>
            <div class="form-group">
              <label>Full Name</label>
              <input 
                type="text" 
                [(ngModel)]="customerInfo.name"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Enter customer name"
              >
            </div>
            <div class="form-group">
              <label>Email</label>
              <input 
                type="email" 
                [(ngModel)]="customerInfo.email"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Enter email address"
              >
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input 
                type="tel" 
                [(ngModel)]="customerInfo.phone"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Enter phone number"
              >
            </div>
            
            <!-- Discount Toggle -->
            <div class="form-group checkbox-group">
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  [ngModel]="isDiscountEnabled" 
                  (ngModelChange)="toggleDiscount($event)"
                >
                <span class="slider"></span>
              </label>
              <span class="toggle-label" (click)="toggleDiscount(!isDiscountEnabled)">Apply Discount</span>
            </div>

            <!-- Discount Details (only shown if discount is enabled) -->
            <div *ngIf="isDiscountEnabled" class="discount-details-container">
              <div class="discount-row">
                <!-- Discount Category -->
                <div class="form-group flex-grow">
                  <label>Category</label>
                  <select 
                    [ngModel]="customerInfo.discountType"
                    class="form-select"
                    (ngModelChange)="onDiscountCategoryChange($event)"
                  >
                    <option value="manual">Other</option>
                    <option value="senior">Senior Citizen</option>
                    <option value="pwd">PWD</option>
                  </select>
                </div>

                <!-- Discount Value (Amount) -->
                <div class="form-group percentage-group amount-group">
                  <label>Amount</label>
                  <div class="percentage-input-wrapper">
                    <input 
                      type="number" 
                      [(ngModel)]="manualDiscountAmount"
                      (ngModelChange)="onManualDiscountChange()"
                      class="form-input"
                      min="0"
                      placeholder="0.00"
                    >
                    <span class="percentage-symbol">₱</span>
                  </div>
                  <div *ngIf="showDiscountAmountError" class="error-message">
                    Discount cannot exceed ₱{{ subtotalBeforeDiscount | number:'1.2-2' }}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Discount ID (shown only for Senior/PWD) -->
            <div class="form-group" *ngIf="isDiscountEnabled && (customerInfo.discountType === 'senior' || customerInfo.discountType === 'pwd')">
              <label>Discount ID Number *</label>
              <input 
                type="text" 
                [(ngModel)]="customerInfo.discountId"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Enter Senior Citizen or PWD ID number"
                class="form-input"
                [class.error]="isDiscountIdRequired"
                required
              >
              <div *ngIf="isDiscountIdRequired" class="error-message">
                Discount ID is required for {{ customerInfo.discountType === 'senior' ? 'Senior Citizen' : 'PWD' }} discount
              </div>
            </div>
          </div>

          <!-- Payment Method -->
          <div class="section">
            <h3>Payment Method</h3>
            <div class="payment-options">
              <label class="payment-option" [class.selected]="paymentMethod === 'cash'">
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="cash"
                  [(ngModel)]="paymentMethod"
                  (ngModelChange)="onPaymentMethodChange()"
                >
                <span class="payment-label">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                    <text x="12" y="17" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor" font-family="Arial, sans-serif">₱</text>
                  </svg>
                  Cash
                </span>
              </label>
              
              <label class="payment-option" [class.selected]="paymentMethod === 'card'">
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="card"
                  [(ngModel)]="paymentMethod"
                  (ngModelChange)="onPaymentMethodChange()"
                >
                <span class="payment-label">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <line x1="1" y1="10" x2="23" y2="10" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Card
                </span>
              </label>
              
              <label class="payment-option" [class.selected]="paymentMethod === 'mobile'">
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="mobile"
                  [(ngModel)]="paymentMethod"
                  (ngModelChange)="onPaymentMethodChange()"
                >
                <span class="payment-label">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Mobile
                </span>
              </label>
            </div>
            <div *ngIf="showPaymentError" class="error-message">Please select a payment method</div>
          </div>

          <!-- Service Type -->
          <div class="section">
            <h3>Service Type</h3>
            <div class="payment-options">
              <label class="payment-option" [class.selected]="serviceType === 'dineIn'">
                <input 
                  type="radio" 
                  name="serviceType" 
                  value="dineIn"
                  [(ngModel)]="serviceType"
                  (ngModelChange)="onServiceTypeChange()"
                >
                <span class="payment-label">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Dine-in
                </span>
              </label>
              
              <label class="payment-option" [class.selected]="serviceType === 'takeOut'">
                <input 
                  type="radio" 
                  name="serviceType" 
                  value="takeOut"
                  [(ngModel)]="serviceType"
                  (ngModelChange)="onServiceTypeChange()"
                >
                <span class="payment-label">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  Take-out
                </span>
              </label>
            </div>
          </div>

          <!-- Order Summary -->
          <div class="section">
            <h3>Order Summary</h3>
            <div class="order-items">
              <div *ngFor="let item of cartItems; trackBy: trackByItem" class="order-item">
                <div class="item-info">
                  <div class="item-name-row">
                    <span class="item-name">{{ item.name }}</span>
                    <span *ngIf="item.temperature" class="temperature-badge" [class.hot]="item.temperature === 'hot'" [class.cold]="item.temperature === 'cold'">
                      <span *ngIf="item.temperature === 'hot'">🔥 hot</span>
                      <span *ngIf="item.temperature === 'cold'">❄️ Iced</span>
                    </span>
                  </div>
                  <div class="item-addons" *ngIf="item.addOns && item.addOns.length > 0">
                    <span *ngFor="let addOn of item.addOns" class="addon-item">
                      <span *ngIf="addOn.quantity && addOn.quantity > 1">{{ addOn.quantity }}x </span>+ {{ addOn.name }} (+₱{{ (addOn.price * (addOn.quantity || 1)) | number:'1.2-2' }})
                    </span>
                  </div>
                  <span class="item-qty">x{{ item.quantity }}</span>
                </div>
                <span class="item-price">₱{{ item.total | number:'1.2-2' }}</span>
              </div>
            </div>
            
            <div class="order-totals">
              <div class="total-row" *ngIf="hasDiscount && discountTotal > 0">
                <span>Subtotal:</span>
                <span>₱{{ subtotalBeforeDiscount | number:'1.2-2' }}</span>
              </div>
              <div class="total-row" *ngIf="hasDiscount && discountTotal > 0">
                <span>Discount ({{ customerInfo.discountType === 'senior' ? 'Senior' : customerInfo.discountType === 'pwd' ? 'PWD' : 'Other' }}):</span>
                <span class="discount-value">-₱{{ discountTotal | number:'1.2-2' }}</span>
              </div>
              <div class="total-row final-total">
                <span>Total</span>
                <span>₱{{ total | number:'1.2-2' }}</span>
              </div>
            </div>
          </div>

          <!-- Cash Payment Input (shown only for cash) -->
          <div *ngIf="paymentMethod === 'cash'" class="section">
            <h3>Cash Payment</h3>
            <div class="form-group">
              <label>Amount Received</label>
              <input 
                type="number" 
                [(ngModel)]="amountReceived"
                (ngModelChange)="onAmountReceivedChange()"
                (focus)="onAmountFocus()"
                placeholder="Enter amount received"
                min="0"
                step="0.01"
                [class.error]="showAmountError"
              >
              <div *ngIf="showAmountError" class="error-message">Amount must be at least ₱{{ total | number:'1.2-2' }}</div>
              
              <!-- Quick Amount Buttons -->
              <div class="quick-amount-buttons">
                <button 
                  type="button" 
                  class="quick-amount-btn"
                  *ngFor="let amount of quickAmounts"
                  (click)="setQuickAmount(amount)"
                  [class.active]="amountReceived === amount"
                >
                  ₱{{ amount | number:'1.0-0' }}
                </button>
              </div>
            </div>
            <!-- Order Breakdown - Always visible -->
            <div class="breakdown-section">
              <div class="breakdown-row">
                <span>Subtotal:</span>
                <span>₱{{ getSubtotal() | number:'1.2-2' }}</span>
              </div>
              
              <!-- Show discount if greater than 0 -->
              <div class="breakdown-row" *ngIf="getDiscount() > 0 || discountTotal > 0">
                <span>Discount:</span>
                <span class="discount-value">-₱{{ (getDiscount() || discountTotal || 0) | number:'1.2-2' }}</span>
              </div>
              
              <div class="breakdown-row total-row">
                <span>Total Amount:</span>
                <span>₱{{ total | number:'1.2-2' }}</span>
              </div>
            </div>
            
            <div *ngIf="amountReceived > 0" class="change-display">
              <div class="change-row">
                <span>Amount Received:</span>
                <span>₱{{ amountReceived | number:'1.2-2' }}</span>
              </div>
              <div class="change-row change-amount">
                <span>Change:</span>
                <span>₱{{ change | number:'1.2-2' }}</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="section">
            <h3>Additional Notes</h3>
            <div class="form-group">
            <textarea 
              [(ngModel)]="notes"
              (ngModelChange)="onNotesChange()"
              placeholder="Add any special instructions or notes..."
              rows="3"
            ></textarea>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="checkout-footer">
          <button class="btn btn-secondary" (click)="inline ? back.emit() : closeCheckout()">
            {{ inline ? 'Back to Cart' : 'Cancel' }}
          </button>
          <button 
            class="btn btn-primary" 
            (click)="processTransaction()"
            [disabled]="isProcessing"
          >
            <span *ngIf="!isProcessing">Complete Transaction</span>
            <span *ngIf="isProcessing" class="loading">
              <svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                </circle>
              </svg>
              Processing...
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Receipt Sidebar -->
    <app-receipt-sidebar 
      [isOpen]="isReceiptOpen"
      [transaction]="completedTransaction"
      (close)="closeReceipt()"
      (newSale)="startNewSale()"
    ></app-receipt-sidebar>
  `,
})
export class CheckoutSidebarComponent implements OnInit {
  @Input() isOpen = false;
  @Input() inline = false;
  @Output() close = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() transactionComplete = new EventEmitter<any>();

  cartItems: CartItem[] = [];
  openOrderName = '';
  customerInfo: CustomerInfo = {
    name: '',
    email: '',
    phone: '',
    discountType: 'none' as 'senior' | 'pwd' | 'none' | 'manual',
    discountId: ''
  };
  manualDiscountPercentage = 0;
  manualDiscountAmount = 0;
  paymentMethod = 'cash';
  serviceType: 'dineIn' | 'takeOut' = 'dineIn';
  serviceFee = 0;
  notes = '';
  subtotal = 0;
  tax = 0;
  total = 0;
  discountTotal = 0;
  subtotalBeforeDiscount = 0;

  // Quick amount buttons for cash payment
  quickAmounts = [100, 200, 500, 1000, 1500, 2000];

  // Cash payment
  amountReceived = 0;
  change = 0;

  // Validation states
  showNameError = false; // Kept for backward compatibility but no longer used
  showPaymentError = false;
  showAmountError = false;
  showDiscountAmountError = false;

  // UI states
  isProcessing = false;
  message = '';
  messageType: 'success' | 'error' = 'success';

  // Receipt states
  isReceiptOpen = false;
  completedTransaction: any = null;

  // Form persistence
  private readonly STORAGE_KEY = 'checkout_form_data';
  private autoSaveTimeout: any;
  isFormDirty = false;

  constructor(
    private cartService: CartService,
    private transactionService: TransactionService,
    private receiptNumberService: ReceiptNumberService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cartService.getCartItems().subscribe(items => {
      this.cartItems = items;
      this.calculateTotals();
      this.cdr.markForCheck();
    });


    // Load saved form data when component initializes
    this.loadSavedFormData();
  }

  // Performance optimization: Memoize expensive calculations
  private _cachedTotals: { subtotal: number; total: number; discountTotal: number } | null = null;
  private _lastCartItemsHash: string = '';

  private getCartItemsHash(): string {
    return this.cartItems.map(item => `${item.productId}-${item.quantity}-${item.total}`).join('|');
  }

  // Performance optimization: Track by function
  trackByItem(index: number, item: CartItem): string {
    // Include temperature and add-ons in the key to ensure items with same product
    // but different temperatures/add-ons are treated as separate items
    const addOnsKey = item.addOns ? item.addOns.map(a => a.name).sort().join(',') : '';
    const temperatureKey = item.temperature || 'none';
    return `${item.productId}-${temperatureKey}-${addOnsKey}`;
  }

  saveOpenOrder(): void {
    if (this.cartItems.length === 0) {
      return;
    }
    this.cartService.saveOpenOrder(this.openOrderName);
    this.openOrderName = '';
    this.closeCheckout();
  }


  private calculateTotals(): void {
    const currentHash = this.getCartItemsHash();

    // Calculate subtotal before discount (sum of item prices * quantity)
    this.subtotalBeforeDiscount = this.cartItems.reduce((sum: number, item) => {
      return sum + (item.price * item.quantity);
    }, 0);

    // Calculate total discount (sum of all item discounts)
    this.discountTotal = this.cartItems.reduce((sum: number, item) => {
      const itemDiscount = item.discount?.amount || 0;
      return sum + itemDiscount;
    }, 0);

    // Calculate subtotal after discount (sum of item prices)
    const subtotalAfterDiscount = this.subtotalBeforeDiscount - this.discountTotal;

    // Store subtotal (sum of item prices after discount)
    this.subtotal = subtotalAfterDiscount;

    this.serviceFee = 0;

    // No VAT calculation - set to 0
    this.tax = 0;

    // Total = subtotal + service fee (no VAT)
    this.total = subtotalAfterDiscount;

    // Cache the results
    this._cachedTotals = {
      subtotal: this.subtotal,
      total: this.total,
      discountTotal: this.discountTotal
    };
    this._lastCartItemsHash = currentHash;

    this.calculateChange();
  }

  private calculateServiceFee(subtotal: number): void {
    this.serviceFee = 0;
  }

  onServiceTypeChange(): void {
    this.calculateTotals();
    this.markFormDirty();
  }

  calculateChange(): void {
    if (this.amountReceived > 0) {
      this.change = this.amountReceived - this.total;
    } else {
      this.change = 0;
    }
  }

  closeCheckout(): void {
    this.clearMessage();
    // Don't reset form - keep data for accidental closes
    this.close.emit();
  }

  // New method to clear form data (called only on successful transaction)
  private clearFormDataOnSuccess(): void {
    this.clearSavedFormData();
    this.resetForm();
  }

  clearMessage(): void {
    this.message = '';
    this.messageType = 'success';
  }

  showMessage(text: string, type: 'success' | 'error' = 'success'): void {
    this.message = text;
    this.messageType = type;

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.clearMessage();
      }, 3000);
    }
  }

  resetForm(): void {
    this.customerInfo = {
      name: '',
      email: '',
      phone: '',
      discountType: 'none' as 'senior' | 'pwd' | 'none' | 'manual',
      discountId: ''
    };
    this.paymentMethod = 'cash';
    this.serviceType = 'dineIn';
    this.serviceFee = 0;
    this.notes = '';
    this.amountReceived = 0;
    this.change = 0;
    this.showNameError = false;
    this.showPaymentError = false;
    this.showAmountError = false;
    this.showDiscountAmountError = false;
    this.isProcessing = false;
    this.manualDiscountPercentage = 0;
    this.manualDiscountAmount = 0;
  }

  validateForm(): boolean {
    let isValid = true;

    // Clear previous errors
    this.showPaymentError = false;
    this.showAmountError = false;
    this.showDiscountAmountError = false;

    // Validate discount ID if discount is selected (Only for Senior/PWD)
    // isDiscountIdRequired getter handles the logic: (Senior OR PWD) AND ID is empty
    if (this.isDiscountIdRequired) {
      isValid = false;
    }

    // Validate discount amount
    if (this.isDiscountEnabled && this.manualDiscountAmount > this.subtotalBeforeDiscount) {
      this.showDiscountAmountError = true;
      isValid = false;
    }

    // Validate payment method
    if (!this.paymentMethod) {
      this.showPaymentError = true;
      isValid = false;
    }

    // Validate cash amount
    if (this.paymentMethod === 'cash' && this.amountReceived < this.total) {
      this.showAmountError = true;
      isValid = false;
    }

    return isValid;
  }

  processTransaction(): void {
    if (!this.validateForm()) {
      this.showMessage('Please fix the errors above', 'error');
      return;
    }

    if (this.cartItems.length === 0) {
      this.showMessage('Cart is empty', 'error');
      return;
    }

    this.isProcessing = true;
    this.clearMessage();

    // Discount should already be applied when discount type was selected
    // Just ensure it's still applied (in case cart was cleared or modified)
    if (this.hasDiscount && this.customerInfo.discountType !== 'none') {
      // Always apply as amount-based discount
      this.cartService.applyDiscountToCart(this.customerInfo.discountType, this.manualDiscountAmount, true);
      // Wait a moment for cart to update, then recalculate
      setTimeout(() => this.calculateTotals(), 100);
    }

    // For cash payments, ensure amount is set
    if (this.paymentMethod === 'cash' && this.amountReceived === 0) {
      this.amountReceived = this.total;
      this.calculateChange();
    }

    this.completeTransaction();
  }

  private completeTransaction(): void {
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (this.isProcessing) {
        this.isProcessing = false;
        this.showMessage('Transaction request timed out. Please check your connection and try again.', 'error');
        this.cdr.detectChanges();
      }
    }, 30000); // 30 second timeout

    // Save cart items BEFORE creating transaction (to preserve add-ons after cart is cleared)
    const savedCartItems = JSON.parse(JSON.stringify(this.cartItems)); // Deep copy

    this.transactionService.createTransaction(
      this.cartItems,
      this.paymentMethod,
      this.customerInfo,
      this.serviceType,
      this.serviceFee,
      this.amountReceived,
      this.change
    ).subscribe({
      next: (result) => {
        clearTimeout(timeoutId);
        this.isProcessing = false;
        this.cartService.completeOpenOrder();
        this.cartService.clearCart();

        // Capture form values BEFORE clearing the form
        const currentPaymentMethod = this.paymentMethod;
        const currentServiceType = this.serviceType;
        const currentServiceFee = this.serviceFee;
        const currentCustomerInfo = { ...this.customerInfo };
        const currentAmountReceived = this.amountReceived;
        const currentChange = this.change;
        const currentNotes = this.notes;

        // Show success message
        this.showMessage('Transaction completed successfully! 🎉', 'success');

        // Clear form data only on successful transaction
        this.clearFormDataOnSuccess();

        // Prepare transaction data for receipt using captured values
        // Backend returns Items (PascalCase), frontend expects items (camelCase)
        const resultAny = result as any;
        let backendItems = result.items || resultAny.Items || [];

        // If backend items are empty, use saved cart items as fallback
        if (!backendItems || backendItems.length === 0) {
          backendItems = savedCartItems;
        }

        // Preserve add-ons from saved cart items since backend doesn't store them
        // Normalize backend item properties (PascalCase to camelCase)
        const itemsWithAddOns = backendItems.map((backendItem: any) => {
          // Normalize property names from backend (PascalCase to camelCase)
          const productId = backendItem.productId || backendItem.ProductId || '';
          const name = backendItem.name || backendItem.Name || '';
          const price = backendItem.price || backendItem.Price || 0;
          const quantity = backendItem.quantity || backendItem.Quantity || 0;
          const basePrice = backendItem.basePrice || backendItem.BasePrice || price;

          // Find matching cart item to preserve add-ons and temperature
          // Try to match by productId first, then by name
          const cartItem = savedCartItems.find((cartItem: any) => {
            // Match by productId (preferred)
            if (productId && cartItem.productId === productId) {
              return true;
            }
            // Match by name (fallback)
            if (cartItem.name === name) {
              return true;
            }
            return false;
          });

          // Convert temperature to string if it's a number (enum from backend)
          let temperature = cartItem?.temperature || backendItem.temperature || backendItem.Temperature || undefined;

          if (typeof temperature === 'number') {
            // Backend enum: 0=None, 1=Hot, 2=Cold
            if (temperature === 1) temperature = 'hot';
            else if (temperature === 2) temperature = 'cold';
            else temperature = undefined;
          } else if (typeof temperature === 'string') {
            // Normalize string values
            const lowerTemp = temperature.toLowerCase();
            if (lowerTemp === 'hot' || lowerTemp === '1') temperature = 'hot';
            else if (lowerTemp === 'cold' || lowerTemp === 'iced' || lowerTemp === '2') temperature = 'cold';
            else if (lowerTemp === 'none' || lowerTemp === '0' || lowerTemp === '') temperature = undefined;
          }

          // Build normalized item object
          const normalizedItem: any = {
            productId: productId,
            name: name,
            price: price,
            basePrice: basePrice,
            quantity: quantity,
            // Preserve add-ons from cart if they exist
            addOns: cartItem?.addOns && cartItem.addOns.length > 0 ? [...cartItem.addOns] : (backendItem.addOns || backendItem.AddOns || undefined),
            // Preserve temperature from cart if it exists (normalized to string)
            temperature: temperature,
            // Preserve discount from cart to ensure custom percentages are respected
            // Backend might return default or missing discount if persistence has issues
            discount: cartItem?.discount ? { ...cartItem.discount } : (backendItem.discount || backendItem.Discount || undefined)
          };

          return normalizedItem;
        });

        // Normalize serviceType from backend (might be enum or string)
        let normalizedServiceType = currentServiceType || 'dineIn';
        if (result.serviceType) {
          const st = result.serviceType.toString().toLowerCase();
          if (st === 'dinein' || st === 'dine_in' || st === '0') normalizedServiceType = 'dineIn';
          else if (st === 'takeout' || st === 'take_out' || st === '1') normalizedServiceType = 'takeOut';
        } else if (resultAny.ServiceType !== undefined) {
          const st = resultAny.ServiceType.toString().toLowerCase();
          if (st === 'dinein' || st === 'dine_in' || st === '0') normalizedServiceType = 'dineIn';
          else if (st === 'takeout' || st === 'take_out' || st === '1') normalizedServiceType = 'takeOut';
        }

        // Get daily receipt number
        const dailyReceiptNumber = this.receiptNumberService.getNextReceiptNumber();

        // Prepare transaction data first - ensure all fields are present
        // Create a new object reference for proper change detection
        // Handle both backend response format and ensure all fields are properly set
        const transactionData = {
          id: result.id || resultAny.Id || 0,
          receiptNumber: dailyReceiptNumber, // Daily receipt number (resets to 1 each day)
          timestamp: result.timestamp || resultAny.Timestamp || resultAny.createdAt || new Date().toISOString(),
          items: [...itemsWithAddOns], // Create new array reference
          customerInfo: { ...(currentCustomerInfo || result.customerInfo || resultAny.CustomerInfo || {}) },
          paymentMethod: currentPaymentMethod || result.paymentMethod || resultAny.PaymentMethod || 'cash',
          amountReceived: currentAmountReceived || resultAny.amountReceived || 0,
          change: currentChange || resultAny.change || 0,
          notes: currentNotes || result.notes || resultAny.Notes || '',
          serviceType: normalizedServiceType,
          serviceFee: currentServiceFee || result.serviceFee || resultAny.ServiceFee || 0,
          // Ensure total is calculated correctly
          total: result.total || resultAny.Total || this.total,
          status: result.status || resultAny.Status || 'completed'
        };

        // Set the transaction object (creates new reference for change detection)
        this.completedTransaction = transactionData;

        // Ensure items array is not empty
        if (this.completedTransaction.items.length === 0) {
          // Use saved cart items directly if backend items are empty
          // Create new array reference for change detection
          this.completedTransaction = {
            ...this.completedTransaction,
            items: savedCartItems.map((item: any) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              basePrice: item.basePrice || item.price,
              quantity: item.quantity,
              temperature: item.temperature,
              addOns: item.addOns || [],
              discount: item.discount
            }))
          };
        }

        // Ensure transaction is properly set before opening sidebar
        // Create a deep copy to ensure new reference for change detection
        const transactionCopy = JSON.parse(JSON.stringify(this.completedTransaction));
        this.completedTransaction = transactionCopy;

        // Open receipt sidebar - transaction is already set
        this.isReceiptOpen = true;

        // Force change detection multiple times to ensure UI updates
        this.cdr.markForCheck();
        this.cdr.detectChanges();

        // Additional change detection after a brief delay to ensure UI updates
        setTimeout(() => {
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        }, 200);

        // Emit transaction complete event (parent won't close checkout sidebar anymore)
        this.transactionComplete.emit({
          transaction: this.completedTransaction,
          amountReceived: this.amountReceived,
          change: this.change
        });

        // Don't close checkout sidebar - receipt sidebar will show on top with higher z-index
        // The receipt sidebar will close both when user closes it
      },
      error: (error) => {
        clearTimeout(timeoutId);
        this.isProcessing = false;

        // Extract error message
        let errorMessage = 'Transaction failed. Please try again.';
        if (error?.error) {
          if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.message) {
            errorMessage = error.error.message;
          } else if (error.error.errors && Array.isArray(error.error.errors)) {
            errorMessage = `Validation errors: ${error.error.errors.join(', ')}`;
          } else if (error.error.userMessage) {
            errorMessage = error.error.userMessage;
          }
        } else if (error?.message) {
          errorMessage = error.message;
        } else if (error?.statusText) {
          errorMessage = `Server error: ${error.status} ${error.statusText}`;
        }

        this.showMessage(errorMessage, 'error');
        this.cdr.detectChanges();
      },
      complete: () => {
        clearTimeout(timeoutId);
        // Ensure isProcessing is reset even if complete is called
        if (this.isProcessing) {
          this.isProcessing = false;
          this.cdr.detectChanges();
        }
      }
    });
  }

  closeReceipt(): void {
    this.isReceiptOpen = false;
    this.completedTransaction = null;
    this.cdr.markForCheck();
    // Ensure checkout sidebar is also closed
    this.closeCheckout();
  }

  startNewSale(): void {
    this.isReceiptOpen = false;
    this.completedTransaction = null;
    this.cdr.markForCheck();
    // Ensure checkout sidebar is also closed
    this.closeCheckout();
  }

  // Getter method to check if discount is selected
  get isDiscountEnabled(): boolean {
    return this.customerInfo.discountType !== 'none';
  }

  get hasDiscount(): boolean {
    return this.customerInfo.discountType !== 'none';
  }

  // Getter method to check if discount ID is required
  get isDiscountIdRequired(): boolean {
    return (this.customerInfo.discountType === 'senior' || this.customerInfo.discountType === 'pwd') && !this.customerInfo.discountId?.trim();
  }

  // Toggle discount enable/disable
  toggleDiscount(enabled: boolean): void {
    if (enabled) {
      if (this.customerInfo.discountType === 'none') {
        // Default to 'manual' (Other) with 0% when enabling
        this.customerInfo.discountType = 'manual';
        this.manualDiscountPercentage = 0;
        this.manualDiscountAmount = 0;
      }
    } else {
      // Disable discount
      this.customerInfo.discountType = 'none';
      this.customerInfo.discountId = '';
      this.manualDiscountPercentage = 0;
      this.manualDiscountAmount = 0;
      this.cartService.removeDiscountFromCart();
    }
    this.markFormDirty();
  }

  // Handle category change (Senior, PWD, Other)
  onDiscountCategoryChange(category: string): void {
    this.customerInfo.discountType = category as any;

    // Set default values based on category
    if (category === 'senior' || category === 'pwd') {
      // Calculate 20% of current subtotal as default amount
      this.manualDiscountAmount = this.subtotalBeforeDiscount * 0.20;
    } else if (category === 'manual') {
      // Default to 0 for 'Other'
      this.manualDiscountAmount = 0;
    }

    // Apply the new discount
    this.applyCurrentDiscount();
    this.calculateTotals(); // Ensure totals are updated immediately
    this.markFormDirty();
  }

  // Apply discount based on current state
  applyCurrentDiscount(): void {
    if (this.customerInfo.discountType === 'none') return;

    if (this.manualDiscountAmount >= 0) {
      this.cartService.applyDiscountToCart(this.customerInfo.discountType, this.manualDiscountAmount, true);
    } else {
      this.cartService.removeDiscountFromCart();
    }

    // Recalculate totals after applying discount
    this.calculateTotals();
  }

  onDiscountTypeChange(): void {
    // Deprecated, replaced by toggleDiscount and onDiscountCategoryChange
    // Keeping empty to prevent errors if template binding lags
  }

  onManualDiscountChange(): void {
    if (this.isDiscountEnabled) {
      if (this.manualDiscountAmount > this.subtotalBeforeDiscount) {
        this.showDiscountAmountError = true;
        this.cartService.removeDiscountFromCart();
        this.calculateTotals();
      } else {
        this.showDiscountAmountError = false;
        this.applyCurrentDiscount();
      }
    }
    this.markFormDirty();
  }

  // Form persistence methods
  private loadSavedFormData(): void {
    try {
      const savedData = localStorage.getItem(this.STORAGE_KEY);
      if (savedData) {
        const formData = JSON.parse(savedData);
        this.customerInfo = { ...this.customerInfo, ...formData.customerInfo };
        this.manualDiscountPercentage = formData.manualDiscountPercentage || 0;
        this.manualDiscountAmount = formData.manualDiscountAmount || 0;
        this.paymentMethod = formData.paymentMethod || 'cash';
        this.serviceType = formData.serviceType || 'dineIn';
        this.notes = formData.notes || '';
        this.amountReceived = formData.amountReceived || 0;
        this.calculateChange();
        this.calculateTotals(); // Recalculate service fee

        // Show restoration message
        this.showMessage('Form data restored from previous session', 'success');
      }
    } catch (error) {
      // Error loading saved form data
    }
  }

  private saveFormData(): void {
    try {
      const formData = {
        customerInfo: this.customerInfo,
        manualDiscountPercentage: this.manualDiscountPercentage,
        manualDiscountAmount: this.manualDiscountAmount,
        paymentMethod: this.paymentMethod,
        serviceType: this.serviceType,
        notes: this.notes,
        amountReceived: this.amountReceived,
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(formData));
    } catch (error) {
      // Error saving form data
    }
  }

  private clearSavedFormData(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      // Error clearing saved form data
    }
  }

  private markFormDirty(): void {
    this.isFormDirty = true;
    this.debouncedAutoSave();
  }

  private debouncedAutoSave(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      if (this.isFormDirty) {
        this.saveFormData();
        this.isFormDirty = false;
      }
    }, 1000); // Auto-save after 1 second of inactivity
  }

  // Form field change handlers
  onCustomerInfoChange(): void {
    this.markFormDirty();
  }

  onPaymentMethodChange(): void {
    this.markFormDirty();
  }

  onNotesChange(): void {
    this.markFormDirty();
  }

  onAmountReceivedChange(): void {
    this.calculateChange();
    this.markFormDirty();
  }

  onAmountFocus(): void {
    // Clear the field if it's 0 when user focuses on it
    if (this.amountReceived === 0) {
      this.amountReceived = null as any;
    }
  }

  setQuickAmount(amount: number): void {
    this.amountReceived = amount;
    this.calculateChange();
    this.markFormDirty();
  }

  // Clear form with confirmation
  clearFormData(): void {
    if (this.hasFormData()) {
      const confirmed = confirm('Are you sure you want to clear all form data? This action cannot be undone.');
      if (confirmed) {
        this.clearSavedFormData();
        this.resetForm();
        this.showMessage('Form data cleared', 'success');
      }
    } else {
      this.showMessage('No form data to clear', 'success');
    }
  }

  // Check if form has any data
  hasFormData(): boolean {
    return !!(
      this.customerInfo.name ||
      this.customerInfo.email ||
      this.customerInfo.phone ||
      this.customerInfo.discountType !== 'none' ||
      this.customerInfo.discountId ||
      this.paymentMethod !== 'cash' ||
      this.notes ||
      this.amountReceived > 0
    );
  }

  // Check if there's saved data in localStorage
  hasSavedData(): boolean {
    try {
      const savedData = localStorage.getItem(this.STORAGE_KEY);
      return !!savedData;
    } catch (error) {
      return false;
    }
  }

  // Helper methods for breakdown display
  getSubtotal(): number {
    // Subtotal is sum of item prices after discount
    return this.subtotal;
  }

  getDiscount(): number {
    // Return the discountTotal which is calculated in calculateTotals()
    // Also recalculate from items as a fallback
    const calculatedFromItems = this.cartItems.reduce((sum: number, item) => {
      return sum + (item.discount?.amount || 0);
    }, 0);

    // Use the higher value (in case one is stale)
    const discount = Math.max(this.discountTotal || 0, calculatedFromItems);

    return discount;
  }


  // Restore saved data manually
  restoreSavedData(): void {
    this.loadSavedFormData();
  }
}



