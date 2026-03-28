import { Component, OnInit, OnChanges, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThermalPrinterService } from '../../services/thermal-printer.service';

@Component({
  selector: 'app-receipt-sidebar',
  standalone: true,
  imports: [
    CommonModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./receipt-sidebar.component.css'],
  template: `
    <!-- Receipt Sidebar Overlay -->
    <div class="receipt-overlay" [class.active]="isOpen" (click)="closeReceipt()">
      <div class="receipt-sidebar" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="receipt-header">
          <h2>Receipt</h2>
          <button class="close-btn" (click)="closeReceipt()">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <!-- Receipt Content -->
        <div class="receipt-content" id="receipt-print" *ngIf="transaction">
          <!-- Success Banner -->
          <div class="success-banner">
            <div class="success-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <span class="success-text">Transaction Complete</span>
            <span class="success-amount">{{ formatPrice(getTotal()) }}</span>
          </div>

          <!-- Transaction Details -->
          <div class="transaction-details">
            <div class="detail-row">
              <span>Receipt #</span>
              <span class="detail-value">{{ getReceiptNumber() }}</span>
            </div>
            <div class="detail-row">
              <span>Date</span>
              <span class="detail-value">{{ formatDate(transaction?.timestamp) }}</span>
            </div>
            <div class="detail-row">
              <span>Payment</span>
              <span class="detail-value">{{ getPaymentMethodDisplay(transaction?.paymentMethod) }}</span>
            </div>
            <div class="detail-row" *ngIf="transaction?.serviceType">
              <span>Service</span>
              <span class="detail-value">{{ transaction?.serviceType === 'dineIn' ? 'Dine-in' : 'Take-out' }}</span>
            </div>
            <div class="detail-row" *ngIf="transaction?.customerInfo?.name">
              <span>Customer</span>
              <span class="detail-value">{{ transaction?.customerInfo?.name }}</span>
            </div>
          </div>

          <!-- Items List -->
          <div class="items-section">
            <div class="section-label">Items</div>
            <div class="items-list">
              <div class="item-row" *ngFor="let item of transactionItems; trackBy: trackByItem">
                <div class="item-left">
                  <span class="item-name">
                    {{ item.name || item.Name || 'Unknown Item' }}
                    <span *ngIf="getTemperature(item)" class="temperature-badge" [class.hot]="isHot(item)" [class.cold]="isCold(item)">
                      {{ isHot(item) ? 'Hot' : 'Iced' }}
                    </span>
                  </span>
                  <div class="item-addons" *ngIf="hasAddOns(item)">
                    <span *ngFor="let addOn of getAddOns(item)" class="addon-item">
                      <span *ngIf="addOn.quantity && addOn.quantity > 1">{{ addOn.quantity }}x </span>+ {{ addOn.name }} ({{ formatPrice(addOn.price * (addOn.quantity || 1)) }})
                    </span>
                  </div>
                  <span class="item-meta">{{ formatPrice(getItemBasePrice(item)) }} x {{ item.quantity || item.Quantity || 0 }}</span>
                </div>
                <span class="item-total">{{ formatPrice(getItemTotal(item)) }}</span>
              </div>
            </div>
          </div>

          <!-- Totals Section -->
          <div class="totals-section">
            <div class="total-row" *ngIf="transaction">
              <span>Subtotal</span>
              <span>{{ formatPrice(getSubtotal()) }}</span>
            </div>
            <div class="total-row discount-row" *ngIf="getDiscountTotal() > 0">
              <span>Discount <span *ngIf="getDiscountTypeLabel()">({{ getDiscountTypeLabel() }})</span></span>
              <span>-{{ formatPrice(getDiscountTotal()) }}</span>
            </div>
            <div class="total-row grand-total">
              <span>Total</span>
              <span>{{ formatPrice(getTotal()) }}</span>
            </div>

            <!-- Cash Payment Details -->
            <div *ngIf="transaction?.paymentMethod === 'cash' && transaction?.amountReceived" class="cash-details">
              <div class="total-row">
                <span>Received</span>
                <span>{{ formatPrice(transaction?.amountReceived || transaction?.AmountReceived || 0) }}</span>
              </div>
              <div class="total-row change-row">
                <span>Change</span>
                <span class="change-amount">{{ formatPrice(getChange()) }}</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div class="notes-section" *ngIf="transaction?.notes">
            <div class="section-label">Notes</div>
            <p>{{ transaction?.notes }}</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="receipt-actions">
          <button class="btn btn-new-sale" (click)="startNewSale()">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New Sale
          </button>
          <div class="actions-row">
            <button class="btn btn-print" (click)="printReceipt()" [disabled]="isPrinting || isOpeningDrawer">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" stroke-width="2"/>
              </svg>
              {{ isPrinting ? 'Printing...' : 'Print' }}
            </button>
            <button class="btn btn-drawer" (click)="openCashDrawer()" [disabled]="isPrinting || isOpeningDrawer" title="Open Cash Drawer">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M2 10h20M12 14v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {{ isOpeningDrawer ? 'Opening...' : 'Drawer' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ReceiptSidebarComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() transaction: any = null;
  @Output() close = new EventEmitter<void>();
  @Output() newSale = new EventEmitter<void>();

  // Performance optimization: Cache formatted values
  private _cachedFormattedDate: string | null = null;
  private _cachedFormattedPrices: Map<number, string> = new Map();

  isPrinting = false;
  isOpeningDrawer = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private thermalPrinter: ThermalPrinterService
  ) { }

  ngOnInit(): void {
  }

  // Getter to ensure transaction items are always available
  get transactionItems(): any[] {
    if (!this.transaction) return [];
    return this.transaction.items || [];
  }

  // Getter to check if transaction has items
  get hasItems(): boolean {
    return this.transactionItems.length > 0;
  }

  // Get receipt number (daily receipt number if available, otherwise transaction ID)
  getReceiptNumber(): string | number {
    if (!this.transaction) return 'N/A';
    // Prefer daily receipt number if available
    const receiptNumber = this.transaction.receiptNumber || this.transaction.ReceiptNumber;
    if (receiptNumber !== undefined && receiptNumber !== null) {
      return receiptNumber;
    }
    // Fallback to transaction ID
    return this.transaction.id || this.transaction.Id || 'N/A';
  }

  // Performance optimization: Track by function
  trackByItem(index: number, item: any): string {
    if (!item) return `item-${index}`;

    // Include temperature and add-ons in the key to ensure items with same product
    // but different temperatures/add-ons are treated as separate items
    const productId = item.productId || item.ProductId || index.toString();
    const addOns = item.addOns || item.addons || item.AddOns || [];
    const addOnsKey = Array.isArray(addOns) && addOns.length > 0
      ? addOns.map((a: any) => (a.name || a || '').toString()).sort().join(',')
      : '';

    // Get temperature without calling this.getTemperature (avoid scope issues)
    let temperature = item.temperature || item.Temperature || undefined;
    if (typeof temperature === 'number') {
      if (temperature === 1) temperature = 'hot';
      else if (temperature === 2) temperature = 'cold';
      else temperature = 'none';
    } else if (typeof temperature === 'string') {
      const lowerTemp = temperature.toLowerCase();
      if (lowerTemp === 'hot' || lowerTemp === '1') temperature = 'hot';
      else if (lowerTemp === 'cold' || lowerTemp === 'iced' || lowerTemp === '2') temperature = 'cold';
      else temperature = 'none';
    } else {
      temperature = 'none';
    }

    return `${productId}-${temperature}-${addOnsKey}-${index}`;
  }

  hasAddOns(item: any): boolean {
    if (!item) return false;
    // Check for addOns or addons (handle different naming conventions)
    const addOns = item.addOns || item.addons;
    const hasAddOns = Array.isArray(addOns) && addOns.length > 0;
    return hasAddOns;
  }

  getAddOns(item: any): any[] {
    if (!item) return [];
    // Return addOns or addons (handle different naming conventions)
    const addOns = item.addOns || item.addons;
    const result = Array.isArray(addOns) ? addOns : [];
    return result;
  }

  getTemperature(item: any): string | null {
    if (!item) return null;
    // Handle different temperature formats: string, number, or enum
    const temp = item.temperature;
    if (!temp && temp !== 0) return null; // Allow 0 (None)

    // If it's a number (enum), convert it
    if (typeof temp === 'number') {
      // 0 = None, 1 = Hot, 2 = Cold (based on Temperature enum)
      if (temp === 1) return 'hot';
      if (temp === 2) return 'cold'; // Will be displayed as "Iced"
      return null;
    }

    // If it's a string
    if (typeof temp === 'string') {
      const lowerTemp = temp.toLowerCase();
      if (lowerTemp === 'hot' || lowerTemp === '1') return 'hot';
      if (lowerTemp === 'cold' || lowerTemp === 'iced' || lowerTemp === '2') return 'cold'; // Will be displayed as "Iced"
      if (lowerTemp === 'none' || lowerTemp === '0' || lowerTemp === '') return null;
      return lowerTemp; // Return as-is if it's something else
    }

    return null;
  }

  isHot(item: any): boolean {
    const temp = this.getTemperature(item);
    return temp === 'hot';
  }

  isCold(item: any): boolean {
    const temp = this.getTemperature(item);
    // Accept both 'cold' and 'iced' as cold temperature
    return temp === 'cold' || temp === 'iced';
  }

  // Monitor transaction changes
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transaction']) {
      // Clear cached values when transaction changes
      this._cachedFormattedDate = null;
      this._cachedFormattedPrices.clear();


      // Trigger change detection
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }

    if (changes['isOpen']) {
      if (this.isOpen) {
        // When receipt opens, ensure change detection is triggered
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    }
  }

  closeReceipt(): void {
    this.close.emit();
  }

  startNewSale(): void {
    this.newSale.emit();
  }

  async printReceipt(): Promise<void> {
    // Use thermal printer instead of browser print dialog
    this.isPrinting = true;
    try {
      await this.thermalPrinter.printReceipt(this.transaction, true);
    } catch (error: any) {
      alert(error.message || 'Failed to print receipt. Please check printer configuration.');
    } finally {
      this.isPrinting = false;
      this.cdr.markForCheck();
    }
  }

  async openCashDrawer(): Promise<void> {
    this.isOpeningDrawer = true;
    try {
      await this.thermalPrinter.openCashDrawer();
    } catch (error: any) {
      alert(error.message || 'Failed to open cash drawer. Please check printer configuration.');
    } finally {
      this.isOpeningDrawer = false;
      this.cdr.markForCheck();
    }
  }

  // Legacy method - kept for reference but not used
  private printReceiptLegacy(): void {
    const printContent = document.getElementById('receipt-print');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Receipt</title>
              <style>
                body { font-family: 'Courier New', monospace; margin: 0; padding: 20px; }
                .store-header { text-align: center; border-bottom: 1px dashed #666; padding-bottom: 16px; margin-bottom: 16px; }
                .store-header h3 { margin: 0 0 8px 0; font-size: 1.4rem; font-weight: bold; }
                .store-header p { margin: 4px 0; font-size: 0.9rem; color: #666; }
                .transaction-details { margin-bottom: 16px; border-bottom: 1px dashed #666; padding-bottom: 16px; }
                .detail-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem; }
                .items-section { margin-bottom: 16px; }
                .items-header { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; font-weight: bold; border-bottom: 1px solid #666; padding-bottom: 4px; margin-bottom: 8px; font-size: 0.85rem; }
                .item-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 4px; font-size: 0.85rem; }
                .item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .item-qty, .item-price, .item-total { text-align: right; }
                .totals-section { border-top: 1px dashed #666; padding-top: 12px; margin-bottom: 16px; }
                .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.9rem; }
                .grand-total { font-weight: bold; font-size: 1.1rem; border-top: 1px solid #666; padding-top: 8px; margin-top: 8px; }
                .cash-payment-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #666; }
                .cash-payment-section .total-row { font-size: 0.95rem; }
                .change-amount { color: var(--success-color); font-weight: 600; }
                .payment-details { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #666; }
                .notes-section { margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
                .notes-section h4 { margin: 0 0 8px 0; font-size: 0.9rem; }
                .notes-section p { margin: 0; font-size: 0.85rem; color: #555; }
                .receipt-footer { text-align: center; border-top: 1px dashed #666; padding-top: 16px; }
                .receipt-footer p { margin: 4px 0; font-size: 0.9rem; }
                .footer-note { font-style: italic; color: #666; font-size: 0.8rem !important; }
              </style>
            </head>
            <body>
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }
    }
  }

  formatDate(timestamp: string | Date | undefined): string {
    let timestampToUse: string | Date;

    if (!timestamp) {
      // Try to get timestamp from transaction if not provided
      if (this.transaction?.timestamp) {
        timestampToUse = this.transaction.timestamp;
      } else {
        return new Date().toLocaleString();
      }
    } else {
      timestampToUse = timestamp;
    }

    // Use cached value if available
    const timestampStr = typeof timestampToUse === 'string' ? timestampToUse : timestampToUse.toISOString();
    if (this._cachedFormattedDate && this.transaction?.timestamp === timestampStr) {
      return this._cachedFormattedDate;
    }

    try {
      const date = typeof timestampToUse === 'string' ? new Date(timestampToUse) : timestampToUse;
      if (!date || isNaN(date.getTime())) {
        return new Date().toLocaleString();
      }
      const formatted = date.toLocaleString();

      // Cache the result
      this._cachedFormattedDate = formatted;
      return formatted;
    } catch (error) {
      return new Date().toLocaleString();
    }
  }

  formatPrice(price: number): string {
    if (price === undefined || price === null) return '₱0.00';

    // Use cached value if available
    if (this._cachedFormattedPrices.has(price)) {
      return this._cachedFormattedPrices.get(price)!;
    }

    const formatted = `₱${price.toFixed(2)}`;

    // Cache the result (limit cache size to prevent memory leaks)
    if (this._cachedFormattedPrices.size < 100) {
      this._cachedFormattedPrices.set(price, formatted);
    }

    return formatted;
  }

  // Calculate subtotal (sum of item prices before discount)
  getSubtotal(): number {
    if (!this.transaction?.items || this.transaction.items.length === 0) {
      return 0;
    }

    // Calculate subtotal (sum of item prices)
    const subtotal = this.transaction.items.reduce((sum: number, item: any) => {
      const price = item.price || 0;
      const quantity = item.quantity || 0;
      return sum + (price * quantity);
    }, 0);

    return subtotal;
  }

  // Calculate total discount from items
  getDiscountTotal(): number {
    if (!this.transaction?.items || this.transaction.items.length === 0) return 0;
    const discount = this.transaction.items.reduce((sum: number, item: any) => {
      return sum + (item.discount?.amount || 0);
    }, 0);
    return discount;
  }

  // Calculate total (subtotal - discount + service fee, no VAT)
  getTotal(): number {
    if (!this.transaction) {
      return 0;
    }

    // Use transaction.total if available, otherwise calculate
    if (this.transaction.total && this.transaction.total > 0) {
      return this.transaction.total;
    }

    const subtotal = this.getSubtotal(); // Sum of item prices (Gross)
    const discount = this.getDiscountTotal();
    const serviceFee = this.transaction.serviceFee || 0;

    // Total = Subtotal - Discount + Service Fee
    const calculatedTotal = subtotal - discount + serviceFee;

    return calculatedTotal;
  }

  // Calculate change (Amount Received - Total)
  getChange(): number {
    if (!this.transaction) {
      return 0;
    }

    const amountReceived = this.transaction.amountReceived || this.transaction.AmountReceived || 0;
    const total = this.getTotal();

    // Calculate change: Amount Received - Total
    const change = amountReceived - total;

    // Return 0 if change is negative (shouldn't happen, but safety check)
    return Math.max(0, change);
  }

  // Get item base price (without add-ons, but with temperature adjustment)
  getItemBasePrice(item: any): number {
    if (!item) return 0;

    // Get the total price per unit (includes add-ons)
    const totalPricePerUnit = item.price || item.Price || 0;

    // Calculate add-ons total per unit (accounting for quantities)
    const addOns = this.getAddOns(item);
    const addOnsTotalPerUnit = addOns.reduce((sum: number, addOn: any) => {
      const addonQty = addOn.quantity || 1;
      return sum + ((addOn.price || 0) * addonQty);
    }, 0);

    // Base price per unit = total price per unit - add-ons per unit
    // This correctly handles temperature-adjusted prices (hotPrice/coldPrice)
    // because item.price already includes the temperature adjustment
    return totalPricePerUnit - addOnsTotalPerUnit;
  }

  // Get item total (with discount if applicable)
  getItemTotal(item: any): number {
    if (!item) return 0;
    const price = item.price || item.Price || 0;
    const quantity = item.quantity || item.Quantity || 0;
    const itemTotal = price * quantity;
    if (item.discount && item.discount.amount) {
      return itemTotal - item.discount.amount;
    }
    return itemTotal;
  }

  // Get formatted payment method display
  getPaymentMethodDisplay(paymentMethod: string): string {
    if (!paymentMethod) return 'Cash';
    const method = paymentMethod.toLowerCase();
    switch (method) {
      case 'cash':
        return 'Cash';
      case 'card':
        return 'Card';
      case 'mobile':
        return 'Mobile Payment';
      default:
        return paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
    }
  }
  getDiscountTypeLabel(): string {
    if (!this.transaction?.customerInfo?.discountType) return '';
    const type = this.transaction.customerInfo.discountType;
    if (type === 'senior') return 'Senior';
    if (type === 'pwd') return 'PWD';
    if (type === 'manual') return 'Custom';
    return '';
  }
}



