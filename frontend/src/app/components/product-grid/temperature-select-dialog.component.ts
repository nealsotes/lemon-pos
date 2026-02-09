import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Product } from '../../models/product.model';
import { AddOn } from '../../models/cart-item.model';
import { BEVERAGE_ADD_ONS } from './add-ons-config';

export interface TemperatureDialogData {
  product: Product;
}

export interface TemperatureDialogResult {
  temperature: 'hot' | 'cold' | null;
  addOns?: AddOn[];
}

@Component({
  selector: 'app-temperature-select-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, FormsModule],
  template: `
    <div class="dialog-container">
      <h2 class="dialog-title">{{ data.product.name }}</h2>
      <p class="dialog-subtitle">Select temperature</p>
      
      <div class="temperature-options">
        <button 
          class="temperature-btn hot-btn"
          [class.selected]="selectedTemperature === 'hot'"
          (click)="selectTemperature('hot')"
          *ngIf="hasHotPrice"
        >
          <div class="temperature-icon">🔥</div>
          <div class="temperature-label">Hot</div>
          <div class="temperature-price">
            ₱{{ (data.product.hotPrice || data.product.price) | number:'1.2-2' }}
          </div>
        </button>
        
        <button 
          class="temperature-btn cold-btn"
          [class.selected]="selectedTemperature === 'cold'"
          (click)="selectTemperature('cold')"
          *ngIf="hasColdPrice"
        >
          <div class="temperature-icon">❄️</div>
          <div class="temperature-label">Iced</div>
          <div class="temperature-price">
            ₱{{ (data.product.coldPrice || data.product.price) | number:'1.2-2' }}
          </div>
        </button>
        
        <!-- Only show standard option if both hot and cold prices are not available -->
        <button 
          class="temperature-btn default-btn"
          [class.selected]="selectedTemperature === null"
          (click)="selectTemperature(null)"
          *ngIf="!hasHotPrice && !hasColdPrice"
        >
          <div class="temperature-icon">📦</div>
          <div class="temperature-label">Standard</div>
          <div class="temperature-price">
            ₱{{ data.product.price | number:'1.2-2' }}
          </div>
        </button>
      </div>
      
      <!-- Add-ons Section -->
      <!-- Show add-ons only after temperature is selected (when both hot and cold are available), or if it's a standard product -->
      <div class="addons-section" *ngIf="canShowAddOns()">
        <p class="addons-title">Add-ons (Optional)</p>
        <p class="addons-hint" *ngIf="!canSelectAddOns()">Please select a temperature first</p>
        <div class="addons-list">
          <div *ngFor="let addOn of availableAddOns" class="addon-option">
            <div class="addon-info">
              <span class="addon-name">{{ addOn.name }}</span>
              <span class="addon-price">₱{{ addOn.price | number:'1.2-2' }} each</span>
            </div>
            <div class="addon-quantity-controls">
              <button 
                class="quantity-btn decrement-btn"
                [disabled]="!canSelectAddOns() || getAddOnQuantity(addOn.name) === 0"
                (click)="decrementAddOn(addOn)"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span class="quantity-display">{{ getAddOnQuantity(addOn.name) }}</span>
              <button 
                class="quantity-btn increment-btn"
                [disabled]="!canSelectAddOns()"
                (click)="incrementAddOn(addOn)"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="addons-total" *ngIf="getSelectedAddOnsTotal() > 0">
          <span>Add-ons Total:</span>
          <span class="total-amount">+₱{{ getSelectedAddOnsTotal() | number:'1.2-2' }}</span>
        </div>
      </div>
      
      <div class="dialog-actions">
        <button class="btn btn-secondary" (click)="cancel()">Cancel</button>
        <button class="btn btn-primary" (click)="confirm()" [disabled]="!canConfirm()">Add to Cart</button>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 24px;
      min-width: 320px;
      max-height: none;
      overflow-y: visible;
    }
    
    .dialog-title {
      margin: 0 0 8px 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    
    .dialog-subtitle {
      margin: 0 0 24px 0;
      color: var(--text-secondary);
      font-size: 0.95rem;
    }
    
    .temperature-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .temperature-btn {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 2px solid var(--border-color);
      border-radius: 12px;
      background: var(--surface-color);
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    }
    
    .temperature-btn:hover {
      border-color: var(--border-light);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      transform: translateY(-2px);
    }
    
    .temperature-btn.selected {
      border-color: var(--primary-color);
      background: var(--background-secondary);
      box-shadow: 0 4px 16px rgba(196, 165, 116, 0.2);
    }
    
    .hot-btn.selected {
      border-color: var(--error-color);
      background: #fef2f2;
    }
    
    .cold-btn.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    
    .temperature-icon {
      font-size: 2rem;
      flex-shrink: 0;
    }
    
    .temperature-label {
      flex: 1;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .temperature-price {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--accent-color);
    }
    
    .dialog-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .btn-secondary {
      background: var(--background-tertiary);
      color: var(--text-secondary);
      border: 2px solid var(--border-color);
    }
    
    .btn-secondary:hover {
      background: var(--border-color);
      color: var(--text-primary);
    }
    
    .btn-primary {
      background: var(--primary-color);
      color: var(--surface-color);
      box-shadow: 0 4px 12px rgba(196, 165, 116, 0.25);
    }
    
    .btn-primary:hover:not(:disabled) {
      background: var(--primary-dark);
      box-shadow: 0 6px 16px rgba(196, 165, 116, 0.35);
    }
    
    .btn-primary:disabled {
      background: var(--border-light);
      color: var(--text-muted);
      cursor: not-allowed;
      box-shadow: none;
    }
    
    .addon-option input[type="checkbox"]:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    
    .addon-option:has(input[type="checkbox"]:disabled) {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .addons-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }

    .addons-title {
      margin: 0 0 8px 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .addons-hint {
      margin: 0 0 12px 0;
      font-size: 0.85rem;
      color: var(--warning-color);
      font-style: italic;
    }

    .addons-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 12px;
      max-height: 260px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .addon-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      transition: all 0.2s ease;
      background: var(--surface-color);
    }

    .addon-option:hover {
      background-color: var(--background-secondary);
      border-color: var(--border-light);
    }

    .addon-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .addon-name {
      font-size: 0.9rem;
      color: var(--text-primary);
      font-weight: 600;
    }

    .addon-price {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .addon-quantity-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .quantity-btn {
      width: 32px;
      height: 32px;
      border: 2px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-color);
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .quantity-btn svg {
      width: 16px;
      height: 16px;
      color: var(--text-secondary);
    }

    .quantity-btn:hover:not(:disabled) {
      background: var(--primary-color);
      border-color: var(--primary-color);
    }

    .quantity-btn:hover:not(:disabled) svg {
      color: var(--surface-color);
    }

    .quantity-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .quantity-display {
      min-width: 32px;
      text-align: center;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .addons-total {
      display: flex;
      justify-content: space-between;
      padding: 8px 10px;
      background-color: var(--background-secondary);
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .total-amount {
      color: var(--accent-color);
    }
  `]
})
export class TemperatureSelectDialogComponent {
  selectedTemperature: 'hot' | 'cold' | null = null;
  selectedAddOns: AddOn[] = [];
  availableAddOns = BEVERAGE_ADD_ONS;

  constructor(
    public dialogRef: MatDialogRef<TemperatureSelectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TemperatureDialogData
  ) {
    // Auto-select if only one option available
    if (this.hasHotPrice && !this.hasColdPrice) {
      this.selectedTemperature = 'hot';
    } else if (this.hasColdPrice && !this.hasHotPrice) {
      this.selectedTemperature = 'cold';
    } else if (!this.hasHotPrice && !this.hasColdPrice) {
      this.selectedTemperature = null;
    }
  }

  get hasHotPrice(): boolean {
    return this.data.product.hotPrice !== undefined && this.data.product.hotPrice !== null;
  }

  get hasColdPrice(): boolean {
    return this.data.product.coldPrice !== undefined && this.data.product.coldPrice !== null;
  }

  selectTemperature(temperature: 'hot' | 'cold' | null): void {
    this.selectedTemperature = temperature;
  }

  getAddOnQuantity(addOnName: string): number {
    const addOn = this.selectedAddOns.find(a => a.name === addOnName);
    return addOn?.quantity || 0;
  }

  incrementAddOn(addOn: AddOn): void {
    const existingIndex = this.selectedAddOns.findIndex(a => a.name === addOn.name);
    if (existingIndex > -1) {
      // Increment existing addon quantity
      this.selectedAddOns[existingIndex].quantity = (this.selectedAddOns[existingIndex].quantity || 1) + 1;
    } else {
      // Add new addon with quantity 1
      this.selectedAddOns.push({ ...addOn, quantity: 1 });
    }
  }

  decrementAddOn(addOn: AddOn): void {
    const existingIndex = this.selectedAddOns.findIndex(a => a.name === addOn.name);
    if (existingIndex > -1) {
      const currentQuantity = this.selectedAddOns[existingIndex].quantity || 1;
      if (currentQuantity > 1) {
        // Decrease quantity
        this.selectedAddOns[existingIndex].quantity = currentQuantity - 1;
      } else {
        // Remove addon if quantity would become 0
        this.selectedAddOns.splice(existingIndex, 1);
      }
    }
  }

  getSelectedAddOnsTotal(): number {
    return this.selectedAddOns.reduce((sum, addOn) => {
      const quantity = addOn.quantity || 1;
      return sum + (addOn.price * quantity);
    }, 0);
  }

  // Check if add-ons section can be shown
  canShowAddOns(): boolean {
    // Always show add-ons section, but disable it until temperature is selected (when both hot and cold are available)
    return true;
  }

  // Check if add-ons can be selected
  canSelectAddOns(): boolean {
    // If both hot and cold are available, require temperature selection first
    if (this.hasHotPrice && this.hasColdPrice) {
      return this.selectedTemperature !== null;
    }
    // Otherwise, allow selection
    return true;
  }

  // Check if user can confirm (add to cart)
  canConfirm(): boolean {
    // If both hot and cold are available, temperature must be selected
    if (this.hasHotPrice && this.hasColdPrice) {
      return this.selectedTemperature !== null;
    }
    // Otherwise, allow confirmation (temperature is auto-selected or not needed)
    return true;
  }

  confirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    const result: TemperatureDialogResult = {
      temperature: this.selectedTemperature,
      addOns: this.selectedAddOns.length > 0 ? this.selectedAddOns : undefined
    };
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}




