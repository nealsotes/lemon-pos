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
  template: `
    <!-- Checkout Sidebar Overlay -->
    <div class="checkout-overlay" [class.active]="isOpen" (click)="closeCheckout()">
      <div class="checkout-sidebar" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="checkout-header">
          <div class="header-left">
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
            <button class="close-btn" (click)="closeCheckout()">
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

                <!-- Discount Percentage -->
                <div class="form-group percentage-group">
                  <label>Percentage</label>
                  <div class="percentage-input-wrapper">
                    <input 
                      type="number" 
                      [(ngModel)]="manualDiscountPercentage"
                      (ngModelChange)="onManualDiscountChange()"
                      class="form-input"
                      min="0"
                      max="100"
                    >
                    <span class="percentage-symbol">%</span>
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
                  <span class="service-fee-hint" *ngIf="serviceType === 'dineIn'">(2% service charge)</span>
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
                <span>Discount ({{ customerInfo.discountType === 'senior' ? 'Senior' : 'PWD' }}):</span>
                <span class="discount-value">-₱{{ discountTotal | number:'1.2-2' }}</span>
              </div>
              <div class="total-row" *ngIf="serviceFee > 0">
                <span>Service Fee ({{ serviceType === 'dineIn' ? 'Dine-in' : 'Take-out' }}):</span>
                <span>₱{{ serviceFee | number:'1.2-2' }}</span>
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
              
              <!-- Service Fee (if any) -->
              <div class="breakdown-row" *ngIf="serviceFee > 0">
                <span>Service Fee ({{ serviceType === 'dineIn' ? 'Dine-in' : 'Take-out' }}):</span>
                <span>₱{{ serviceFee | number:'1.2-2' }}</span>
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
          <button class="btn btn-secondary" (click)="closeCheckout()">
            Cancel
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
  styles: [`
    .checkout-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease; /* Simplified transition */
      will-change: opacity; /* Optimize for animations */
    }

    .checkout-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .checkout-sidebar {
      position: fixed;
      top: 0;
      right: -500px;
      width: 500px;
      height: 100vh;
      background: #ffffff;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      transition: right 0.2s ease; /* Simplified transition */
      display: flex;
      flex-direction: column;
      border-left: 1px solid #e2e8f0;
      will-change: right; /* Optimize for animations */
      contain: layout style paint; /* CSS containment */
    }

    .checkout-overlay.active .checkout-sidebar {
      right: 0;
    }

    .checkout-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .header-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .form-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #C4A574;
      font-weight: 500;
    }

    .status-icon {
      width: 16px;
      height: 16px;
      animation: spin 1s linear infinite;
    }

    .status-text {
      font-size: 0.8rem;
    }

    .clear-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: #f1f5f9;
      border-radius: 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: #64748b;
    }

    .clear-btn:hover {
      background: #e2e8f0;
      color: #475569;
      transform: scale(1.05);
    }

    .clear-btn svg {
      width: 18px;
      height: 18px;
    }

    .restore-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: #dcfce7;
      border-radius: 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: #16a34a;
    }

    .restore-btn:hover {
      background: #bbf7d0;
      color: #15803d;
      transform: scale(1.05);
    }

    .restore-btn svg {
      width: 18px;
      height: 18px;
    }

    .checkout-header h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      /* Simplify text gradient for better performance */
      /* background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text; */
    }

    .close-btn {
      width: 40px;
      height: 40px;
      border: none;
      background: #f1f5f9;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); */
      border-radius: 0.75rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .close-btn:hover {
      background: #e2e8f0;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); */
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .close-btn svg {
      width: 20px;
      height: 20px;
      color: #64748b;
    }

    /* Message Container */
    .message-container {
      margin: 0 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .message-container.success {
      background: #dcfce7;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); */
      color: #15803d;
      border: 1px solid #86efac;
    }

    .message-container.error {
      background: #fee2e2;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); */
      color: #dc2626;
      border: 1px solid #fca5a5;
    }

    .message-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .message-icon svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .message-text {
      flex: 1;
    }

    .message-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.25rem;
      transition: background-color 0.2s ease;
    }

    .message-close:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }

    .message-close svg {
      width: 16px;
      height: 16px;
    }

    .checkout-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      min-height: 0;
    }

    .section {
      margin-bottom: 2rem;
      background: #ffffff;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%); */
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid #f1f5f9;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
    }

    .section:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);
    }

    .section h3 {
      margin: 0 0 1.25rem 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #1e293b;
      /* Simplify text gradient for better performance */
      /* background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text; */
    }

    /* Open Orders */
    .open-orders-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .open-order-name-row {
      margin-bottom: 0.75rem;
    }

    .open-order-name-row input {
      width: 100%;
      padding: 0.75rem 0.9rem;
      border: 2px solid #e2e8f0;
      border-radius: 0.75rem;
      font-size: 0.9rem;
      background-color: #ffffff;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      font-weight: 500;
    }

    .open-order-name-row input:focus {
      outline: none;
      border-color: #C4A574;
      box-shadow: 0 0 0 3px rgba(196, 165, 116, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);
    }

    .open-order-save-btn {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid #e2e8f0;
      background: #f1f5f9;
      color: #475569;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .open-order-save-btn:hover:not(:disabled) {
      background: #e2e8f0;
      color: #1e293b;
    }

    .open-order-save-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }


    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #374151;
      font-size: 0.95rem;
    }

    .form-group input,
    .form-group textarea,
    .form-select {
      width: 100%;
      padding: 0.875rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 0.875rem;
      font-size: 1rem;
      background-color: #ffffff;
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      font-weight: 500;
    }

    .form-group input:focus,
    .form-group textarea:focus,
    .form-select:focus {
      outline: none;
      border-color: #C4A574;
      box-shadow: 0 0 0 3px rgba(196, 165, 116, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);
    }

    .form-group input.error {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }

    .error-message {
      color: #ef4444;
      font-size: 0.8rem;
      margin-top: 0.5rem;
      font-weight: 500;
    }

    .payment-options {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .payment-option {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .payment-option input[type="radio"] {
      position: absolute;
      opacity: 0;
      cursor: pointer;
    }

    .payment-label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      border: 2px solid #e2e8f0;
      border-radius: 0.875rem;
      background: #ffffff;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%); */
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
      flex: 1;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .payment-option.selected .payment-label {
      border-color: #C4A574;
      background: #FAF8F3;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #FAF8F3 0%, #F5F2ED 100%); */
      box-shadow: 0 4px 16px rgba(196, 165, 116, 0.15);
      transform: translateY(-2px);
    }

    .payment-option:hover .payment-label {
      border-color: #cbd5e1;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .payment-label svg {
      width: 24px;
      height: 24px;
      color: #C4A574;
      flex-shrink: 0;
    }

    .service-fee-hint {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 500;
      margin-left: auto;
      padding-left: 0.5rem;
    }

    /* Toggle Switch Styles */
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 1.25rem;
      padding: 0.5rem 0;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 26px;
      flex-shrink: 0;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #cbd5e1;
      transition: .3s;
      border-radius: 34px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    input:checked + .slider {
      background-color: #C4A574;
    }

    input:focus + .slider {
      box-shadow: 0 0 1px #C4A574;
    }

    input:checked + .slider:before {
      transform: translateX(22px);
    }

    .toggle-label {
      font-size: 1rem;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      user-select: none;
    }

    /* Discount Details Styles */
    .discount-details-container {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 1.25rem;
      animation: slideDown 0.2s ease-out;
    }

    .discount-row {
      display: flex;
      gap: 12px;
    }

    .flex-grow {
      flex: 1;
    }

    .percentage-group {
      width: 100px;
    }

    .percentage-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .percentage-input-wrapper input {
      padding-right: 24px;
      text-align: right;
    }

    .percentage-symbol {
      position: absolute;
      right: 10px;
      color: #64748b;
      font-weight: 500;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Cash Payment Styles */
    .breakdown-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      margin-bottom: 15px;
      visibility: visible !important;
      opacity: 1 !important;
    }
    
    .breakdown-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.95rem;
    }
    
    .breakdown-row.total-row {
      margin-top: 8px;
      padding-top: 12px;
      border-top: 2px solid #dee2e6;
      font-weight: 600;
    }
    
    .breakdown-row .discount-value {
      color: #dc3545;
    }
    
    .change-display {
      background: #f8fafc;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); */
      border: 1px solid #e2e8f0;
      border-radius: 0.875rem;
      padding: 1.25rem;
      margin-top: 1rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .change-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      font-size: 0.95rem;
    }

    .change-row:last-child {
      margin-bottom: 0;
    }

    .change-amount {
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
      margin-top: 0.75rem;
      font-weight: 700;
      color: #95C7BB;
    }

    /* Quick Amount Buttons */
    .quick-amount-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    
    .quick-amount-btn {
      flex: 1;
      min-width: calc(33.333% - 6px);
      padding: 10px 12px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 500;
      color: #495057;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
    }
    
    .quick-amount-btn:hover {
      background: #e9ecef;
      border-color: #C4A574;
      color: #C4A574;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(196, 165, 116, 0.2);
    }
    
    .quick-amount-btn.active {
      background: #C4A574;
      border-color: #C4A574;
      color: white;
      box-shadow: 0 2px 8px rgba(196, 165, 116, 0.3);
    }
    
    .quick-amount-btn:active {
      transform: translateY(0);
    }

    /* Order Items */
    .order-items {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .order-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.25rem;
      background: #ffffff;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%); */
      border-radius: 0.875rem;
      border: 1px solid #f1f5f9;
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .order-item:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);
      border-color: #e2e8f0;
    }

    .item-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex: 1;
    }

    .item-name-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .item-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
    }

    .temperature-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.7rem;
      font-weight: 600;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      flex-shrink: 0;
    }

    .temperature-badge.hot {
      background: #fef2f2;
      border-color: #fecaca;
      color: #dc2626;
    }

    .temperature-badge.cold {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #2563eb;
    }

    .item-addons {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 2px;
      margin-left: 0.5rem;
      font-size: 0.6rem;
      color: #64748b;
      max-width: 100%;
    }

    .addon-item {
      font-size: 0.6rem;
      color: #64748b;
      font-style: italic;
      line-height: 1.2;
    }

    .item-qty {
      font-size: 0.8rem;
      color: #64748b;
      font-weight: 500;
    }

    .item-price {
      font-size: 0.95rem;
      font-weight: 700;
      color: #95C7BB;
      /* Remove text-shadow for better performance */
      /* text-shadow: 0 1px 2px rgba(149, 199, 187, 0.1); */
    }

    /* Order Totals */
    .order-totals {
      background: #f8fafc;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); */
      border-radius: 0.875rem;
      padding: 1.5rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      font-size: 0.95rem;
    }

    .total-row:last-child {
      margin-bottom: 0;
    }

    .discount-value {
      color: #ef4444;
      font-weight: 600;
    }

    .final-total {
      padding-top: 1rem;
      border-top: 2px solid #e2e8f0;
      margin-top: 1rem;
      font-size: 1.125rem;
      font-weight: 700;
      color: #95C7BB;
    }

    /* Footer */
    .checkout-footer {
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); */
      flex-shrink: 0;
      display: flex;
      gap: 1rem;
    }

    .btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      border: none;
      border-radius: 0.875rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      /* Simplify transition for better performance */
      /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
      text-decoration: none;
      letter-spacing: 0.025em;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      /* Remove backdrop-filter for better performance */
      /* backdrop-filter: blur(10px); */
    }

    .btn-primary {
      background: #C4A574;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #C4A574 0%, #B08D5B 100%); */
      color: #ffffff;
      box-shadow: 0 6px 20px rgba(196, 165, 116, 0.25);
    }

    .btn-primary:hover:not(:disabled) {
      background: #B08D5B;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #B08D5B 0%, #9A7A4D 100%); */
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(196, 165, 116, 0.35);
    }

    .btn-primary:disabled {
      background: #94a3b8;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); */
      cursor: not-allowed;
      transform: none;
      box-shadow: 0 2px 8px rgba(148, 163, 184, 0.3);
    }

    .btn-secondary {
      background: #f1f5f9;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); */
      color: #475569;
      border: 2px solid #e2e8f0;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
      /* Simplify background for better performance */
      /* background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); */
      color: #1e293b;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .spinner {
      width: 18px;
      height: 18px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .checkout-sidebar {
        width: 100%;
        right: -100%;
      }

      .checkout-header {
        padding: 1.25rem;
      }

      .checkout-header h2 {
        font-size: 1.25rem;
      }

      .checkout-content {
        padding: 1.25rem;
      }

      .section {
        padding: 1.25rem;
        margin-bottom: 1.5rem;
      }

      .checkout-footer {
        padding: 1.25rem;
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `]
})
export class CheckoutSidebarComponent implements OnInit {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
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

    // No VAT calculation - set to 0
    this.tax = 0;

    // Calculate service fee based on service type (on subtotal after discount)
    this.calculateServiceFee(subtotalAfterDiscount);

    // Total = subtotal + service fee (no VAT)
    this.total = subtotalAfterDiscount + this.serviceFee;

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
    // Dine-in: 2% service charge (on subtotal)
    // Take-out: no service fee
    if (this.serviceType === 'dineIn') {
      this.serviceFee = subtotal * 0.02; // 2% service charge
    } else {
      this.serviceFee = 0;
    }
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
    this.isProcessing = false;
    this.manualDiscountPercentage = 0;
  }

  validateForm(): boolean {
    let isValid = true;

    // Clear previous errors
    this.showPaymentError = false;
    this.showAmountError = false;

    // Validate discount ID if discount is selected (Only for Senior/PWD)
    // isDiscountIdRequired getter handles the logic: (Senior OR PWD) AND ID is empty
    if (this.isDiscountIdRequired) {
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
      // Always use the manualDiscountPercentage value, as the user may have edited it
      this.cartService.applyDiscountToCart(this.customerInfo.discountType, this.manualDiscountPercentage);
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
      }
    } else {
      // Disable discount
      this.customerInfo.discountType = 'none';
      this.customerInfo.discountId = '';
      this.manualDiscountPercentage = 0;
      this.cartService.removeDiscountFromCart();
    }
    this.markFormDirty();
  }

  // Handle category change (Senior, PWD, Other)
  onDiscountCategoryChange(category: string): void {
    this.customerInfo.discountType = category as any;

    // Set default percentages based on category
    if (category === 'senior' || category === 'pwd') {
      this.manualDiscountPercentage = 20;
    } else if (category === 'manual') {
      // Reset to 0 for 'Other' if it was set to standard 20%
      if (this.manualDiscountPercentage === 20) {
        this.manualDiscountPercentage = 0;
      }
    }

    // Apply the new discount
    this.applyCurrentDiscount();
    this.markFormDirty();
  }

  // Apply discount based on current state
  applyCurrentDiscount(): void {
    if (this.customerInfo.discountType === 'none') return;

    if (this.manualDiscountPercentage >= 0) {
      this.cartService.applyDiscountToCart(this.customerInfo.discountType, this.manualDiscountPercentage);
    } else {
      this.cartService.removeDiscountFromCart();
    }
  }

  onDiscountTypeChange(): void {
    // Deprecated, replaced by toggleDiscount and onDiscountCategoryChange
    // Keeping empty to prevent errors if template binding lags
  }

  onManualDiscountChange(): void {
    if (this.isDiscountEnabled) {
      this.applyCurrentDiscount();
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