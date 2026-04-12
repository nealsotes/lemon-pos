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
        <!-- Editorial Header -->
        <header class="checkout-header">
          <div class="header-left">
            <h2 class="ed-display ed-display--sm">Checkout</h2>
            <div class="form-status" *ngIf="isFormDirty">
              <span class="ed-pulse-dot"></span>
              <span class="status-text">Auto-saving</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="header-icon-btn" *ngIf="hasSavedData() && !hasFormData()" (click)="restoreSavedData()" title="Restore Saved Data">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 21v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="header-icon-btn" (click)="clearFormData()" title="Clear Form">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button *ngIf="!inline" class="header-icon-btn close-btn" (click)="closeCheckout()">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- Success/Error Messages -->
        <div *ngIf="message" class="message-container" [class]="messageType" [class.shake]="messageShake" role="alert">
          <span class="message-icon">
            <svg *ngIf="messageType === 'success'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg *ngIf="messageType === 'error'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <circle cx="12" cy="17" r="1" fill="currentColor"/>
            </svg>
          </span>
          <div class="message-body">
            <div class="message-title">{{ messageTitle }}</div>
            <div class="message-text">{{ message }}</div>
          </div>
          <button class="message-close" (click)="clearMessage()" aria-label="Dismiss">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="checkout-content">
          <!-- Customer (compact) -->
          <section class="section">
            <h3 class="ed-display ed-display--xs section-title">Customer</h3>
            <div class="form-group">
              <input
                type="text"
                class="ed-input"
                [(ngModel)]="customerInfo.name"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Customer name (optional)"
              >
            </div>
            <button type="button" class="more-fields-toggle" (click)="showMoreCustomerFields = !showMoreCustomerFields">
              {{ showMoreCustomerFields ? '− Hide' : '+ Add' }} email & phone
            </button>
            <div *ngIf="showMoreCustomerFields" class="form-group">
              <input
                type="email"
                class="ed-input"
                [(ngModel)]="customerInfo.email"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Email address"
              >
            </div>
            <div *ngIf="showMoreCustomerFields" class="form-group">
              <input
                type="tel"
                class="ed-input"
                [(ngModel)]="customerInfo.phone"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Phone number"
              >
            </div>
            
            <!-- Discount Toggle -->
            <div class="form-group toggle-group">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  [ngModel]="isDiscountEnabled"
                  (ngModelChange)="toggleDiscount($event)"
                >
                <span class="slider"></span>
              </label>
              <span class="toggle-label" (click)="toggleDiscount(!isDiscountEnabled)">Apply discount</span>
            </div>

            <!-- Discount Details (only shown if discount is enabled) -->
            <div *ngIf="isDiscountEnabled" class="discount-details-container">
              <div class="discount-row">
                <!-- Discount Category -->
                <div class="form-group flex-grow">
                  <label class="ed-label">Category</label>
                  <select
                    [ngModel]="customerInfo.discountType"
                    class="ed-input ed-select"
                    (ngModelChange)="onDiscountCategoryChange($event)"
                  >
                    <option value="manual">Other</option>
                    <option value="senior">Senior Citizen</option>
                    <option value="pwd">PWD</option>
                  </select>
                </div>

                <!-- Discount Value (Amount) -->
                <div class="form-group amount-group">
                  <label class="ed-label">Amount</label>
                  <div class="amount-input-wrapper">
                    <span class="amount-prefix">₱</span>
                    <input
                      type="number"
                      [(ngModel)]="manualDiscountAmount"
                      (ngModelChange)="onManualDiscountChange()"
                      class="ed-input ed-input--prefix"
                      min="0"
                      placeholder="0.00"
                    >
                  </div>
                  <div *ngIf="showDiscountAmountError" class="error-message">
                    Discount cannot exceed ₱{{ subtotalBeforeDiscount | number:'1.2-2' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Discount ID (shown only for Senior/PWD) -->
            <div class="form-group" *ngIf="isDiscountEnabled && (customerInfo.discountType === 'senior' || customerInfo.discountType === 'pwd')">
              <label class="ed-label">Discount ID number *</label>
              <input
                type="text"
                [(ngModel)]="customerInfo.discountId"
                (ngModelChange)="onCustomerInfoChange()"
                placeholder="Enter Senior Citizen or PWD ID number"
                class="ed-input"
                [class.error]="isDiscountIdRequired"
                required
              >
              <div *ngIf="isDiscountIdRequired" class="error-message">
                Discount ID is required for {{ customerInfo.discountType === 'senior' ? 'Senior Citizen' : 'PWD' }} discount
              </div>
            </div>
          </section>

          <!-- Payment Method -->
          <section class="section">
            <h3 class="ed-display ed-display--xs section-title">Payment</h3>
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
          </section>

          <!-- Service Type -->
          <section class="section">
            <h3 class="ed-display ed-display--xs section-title">Service</h3>
            <div class="payment-options service-options">
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
          </section>

          <!-- Order Summary -->
          <section class="section summary-section">
            <h3 class="ed-display ed-display--xs section-title">Order summary</h3>
            <div class="summary-items">
              <div *ngFor="let item of cartItems; trackBy: trackByItem" class="summary-item">
                <div class="summary-item__info">
                  <span class="summary-item__qty">{{ item.quantity }}×</span>
                  <span class="summary-item__name">{{ item.name }}</span>
                  <span *ngIf="item.temperature" class="summary-item__temp">
                    {{ item.temperature === 'hot' ? '🔥' : '❄️' }}
                  </span>
                </div>
                <span class="summary-item__price">₱{{ item.total | number:'1.2-2' }}</span>
              </div>
            </div>
            <div class="compact-summary">
              <div class="ed-stat-row" *ngIf="hasDiscount && discountTotal > 0">
                <span class="ed-stat-row__label">Subtotal</span>
                <span class="ed-stat-row__value">₱{{ subtotalBeforeDiscount | number:'1.2-2' }}</span>
              </div>
              <div class="ed-stat-row" *ngIf="hasDiscount && discountTotal > 0">
                <span class="ed-stat-row__label">Discount</span>
                <span class="ed-stat-row__value discount-value">−₱{{ discountTotal | number:'1.2-2' }}</span>
              </div>
              <div class="grand-total-row">
                <span class="grand-total-label">Total</span>
                <div class="grand-total-display">
                  <span class="grand-total-currency">₱</span>
                  <span class="grand-total-amount">{{ total | number:'1.2-2' }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Cash Payment Input (shown only for cash) -->
          <section *ngIf="paymentMethod === 'cash'" class="section">
            <h3 class="ed-display ed-display--xs section-title">Cash received</h3>
            <div class="form-group">
              <div class="amount-input-wrapper">
                <span class="amount-prefix">₱</span>
                <input
                  type="number"
                  class="ed-input ed-input--prefix ed-input--big"
                  [(ngModel)]="amountReceived"
                  (ngModelChange)="onAmountReceivedChange()"
                  (focus)="onAmountFocus()"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  [class.error]="showAmountError"
                >
              </div>
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

            <div *ngIf="amountReceived > 0" class="change-display">
              <div class="change-row">
                <span class="change-label">Amount received</span>
                <span class="change-value">₱{{ amountReceived | number:'1.2-2' }}</span>
              </div>
              <div class="ed-receipt__divider ed-receipt__divider--dashed"></div>
              <div class="change-row change-amount">
                <span class="change-label">Change due</span>
                <div class="change-display-amount">
                  <span class="ed-total-block__currency">₱</span>
                  <span class="change-big">{{ change | number:'1.2-2' }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Notes (collapsible) -->
          <section class="section">
            <button type="button" class="more-fields-toggle notes-toggle" (click)="showNotes = !showNotes">
              {{ showNotes ? '−' : '+' }} {{ showNotes ? 'Hide' : 'Add' }} note
            </button>
            <div *ngIf="showNotes" class="form-group">
              <textarea
                class="ed-input ed-textarea"
                [(ngModel)]="notes"
                (ngModelChange)="onNotesChange()"
                placeholder="Special instructions..."
                rows="2"
              ></textarea>
            </div>
          </section>
        </div>

        <!-- Footer Actions -->
        <footer class="checkout-footer">
          <button class="ed-btn ed-btn--secondary" (click)="inline ? back.emit() : closeCheckout()">
            <svg class="ed-btn__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>{{ inline ? 'Back' : 'Cancel' }}</span>
          </button>
          <button
            class="ed-btn ed-btn--primary ed-btn--arrow checkout-complete-btn"
            (click)="processTransaction()"
            [disabled]="isProcessing"
          >
            <ng-container *ngIf="!isProcessing">
              <span>Complete transaction</span>
              <svg class="ed-btn__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </ng-container>
            <ng-container *ngIf="isProcessing">
              <svg class="ed-btn__icon spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                </circle>
              </svg>
              <span>Processing</span>
            </ng-container>
          </button>
        </footer>
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
  messageTitle = '';
  messageType: 'success' | 'error' = 'success';
  messageShake = false;

  // Receipt states
  isReceiptOpen = false;
  completedTransaction: any = null;

  // Form persistence
  private readonly STORAGE_KEY = 'checkout_form_data';
  private autoSaveTimeout: any;
  isFormDirty = false;

  // UI state
  showMoreCustomerFields = false;
  showNotes = false;

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
    this.messageTitle = '';
    this.messageType = 'success';
    this.messageShake = false;
  }

  showMessage(text: string, type: 'success' | 'error' = 'success', title: string = ''): void {
    this.message = text;
    this.messageTitle = title || (type === 'success' ? 'Success' : 'Heads up');
    this.messageType = type;

    // Trigger shake animation on error to grab attention
    if (type === 'error') {
      this.messageShake = false;
      this.cdr.detectChanges();
      this.messageShake = true;
    }

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

  validateForm(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Clear previous errors
    this.showPaymentError = false;
    this.showAmountError = false;
    this.showDiscountAmountError = false;

    // Validate discount ID if discount is selected (Only for Senior/PWD)
    if (this.isDiscountIdRequired) {
      const label = this.customerInfo.discountType === 'senior' ? 'Senior Citizen' : 'PWD';
      issues.push(`${label} discount needs an ID number.`);
    }

    // Validate discount amount
    if (this.isDiscountEnabled && this.manualDiscountAmount > this.subtotalBeforeDiscount) {
      this.showDiscountAmountError = true;
      issues.push(`Discount can't exceed the subtotal of ₱${this.subtotalBeforeDiscount.toFixed(2)}.`);
    }

    // Validate payment method
    if (!this.paymentMethod) {
      this.showPaymentError = true;
      issues.push('Choose a payment method.');
    }

    // Validate cash amount
    if (this.paymentMethod === 'cash' && this.amountReceived < this.total) {
      this.showAmountError = true;
      const short = (this.total - this.amountReceived).toFixed(2);
      issues.push(`Cash received is short by ₱${short}.`);
    }

    return { valid: issues.length === 0, issues };
  }

  processTransaction(): void {
    if (this.cartItems.length === 0) {
      this.showMessage('Add at least one product to the cart before checking out.', 'error', 'Cart is empty');
      return;
    }

    const validation = this.validateForm();
    if (!validation.valid) {
      const title = validation.issues.length === 1 ? 'One thing to fix' : `${validation.issues.length} things to fix`;
      this.showMessage(validation.issues.join(' '), 'error', title);
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

  private translateTransactionError(error: any): { title: string; body: string } {
    const status = error?.status ?? 0;

    // Extract any server-provided message for fallback
    let serverMessage = '';
    if (error?.error) {
      if (typeof error.error === 'string') {
        serverMessage = error.error;
      } else if (error.error.message) {
        serverMessage = error.error.message;
      } else if (error.error.userMessage) {
        serverMessage = error.error.userMessage;
      } else if (Array.isArray(error.error.errors)) {
        serverMessage = error.error.errors.join(' ');
      }
    }

    // Network / offline
    if (status === 0) {
      return {
        title: 'No connection',
        body: 'Your device looks offline. Reconnect to the internet and try again.'
      };
    }

    // Auth
    if (status === 401) {
      return {
        title: 'Session expired',
        body: 'Please log in again to complete this sale.'
      };
    }
    if (status === 403) {
      return {
        title: 'Not allowed',
        body: 'Your account does not have permission to complete sales.'
      };
    }

    // Validation
    if (status === 400 || status === 422) {
      return {
        title: 'Order can\'t be processed',
        body: serverMessage || 'Please review the cart and customer details, then try again.'
      };
    }

    // Stock
    if (status === 409) {
      return {
        title: 'Stock changed',
        body: serverMessage || 'One or more items just ran out of stock. Refresh and try again.'
      };
    }

    // Server errors
    if (status >= 500) {
      return {
        title: 'Server error',
        body: 'Something went wrong on our end. Wait a moment and try again — your cart is safe.'
      };
    }

    // Generic fallback
    return {
      title: 'Couldn\'t complete the sale',
      body: serverMessage || 'Something unexpected happened. Try again — your cart is still here.'
    };
  }

  private completeTransaction(): void {
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (this.isProcessing) {
        this.isProcessing = false;
        this.showMessage(
          'The server is taking longer than expected. Check your connection and try again.',
          'error',
          'Request timed out'
        );
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

        const { title, body } = this.translateTransactionError(error);
        this.showMessage(body, 'error', title);
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



