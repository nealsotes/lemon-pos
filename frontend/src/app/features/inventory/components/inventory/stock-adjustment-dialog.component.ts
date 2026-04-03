import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { MovementType } from '../../models/stock-movement.model';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

export interface StockAdjustmentDialogData {
  ingredient: Ingredient;
  defaultAdjustment?: number;
}

export interface StockAdjustmentResult {
  adjustment: number;
  movementType: string;
  reason: string;
  notes: string;
  // Lot fields (purchase only)
  supplier?: string;
  unitCost?: number;
  expirationDate?: string;
  lotNumber?: string;
}

interface MovementTypeOption {
  value: string;
  label: string;
  description: string;
  direction: 'in' | 'out' | 'both';
  color: string;
}

@Component({
  selector: 'app-stock-adjustment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    ButtonComponent
  ],
  template: `
    <div class="adjustment-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-info">
          <div class="header-avatar" [style.background]="getColor(ingredient.name)">
            {{ ingredient.name.charAt(0).toUpperCase() }}
          </div>
          <div class="header-text">
            <h2>Stock Adjustment</h2>
            <span class="header-sub">{{ ingredient.name }} · {{ ingredient.quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} {{ ingredient.unit }} on hand</span>
          </div>
        </div>
        <button class="dialog-close-btn" (click)="dialogRef.close()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <!-- Movement Type -->
        <div class="section">
          <label class="section-label">Type</label>
          <div class="type-grid">
            <button type="button"
              *ngFor="let opt of movementTypes"
              class="type-card"
              [class.selected]="selectedType === opt.value"
              [style.--type-color]="opt.color"
              (click)="selectType(opt)">
              <span class="type-label">{{ opt.label }}</span>
              <span class="type-desc">{{ opt.description }}</span>
            </button>
          </div>
        </div>

        <!-- Quantity -->
        <div class="section">
          <label class="section-label">Quantity ({{ ingredient.unit }})</label>
          <div class="qty-input-row">
            <button type="button" class="qty-step" (click)="stepQuantity(-1)" [disabled]="quantity <= (isPiece ? 1 : 0.01)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
            </button>
            <input type="number" class="qty-input" [(ngModel)]="quantity" [step]="isPiece ? 1 : 0.01" min="0.01">
            <button type="button" class="qty-step" (click)="stepQuantity(1)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div class="qty-preview" *ngIf="quantity > 0">
            <span *ngIf="isOutgoing">{{ ingredient.quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} - {{ quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} = <strong>{{ (ingredient.quantity - quantity) | number:(isPiece ? '1.0-0' : '1.2-2') }}</strong> {{ ingredient.unit }}</span>
            <span *ngIf="!isOutgoing">{{ ingredient.quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} + {{ quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} = <strong>{{ (ingredient.quantity + quantity) | number:(isPiece ? '1.0-0' : '1.2-2') }}</strong> {{ ingredient.unit }}</span>
          </div>
          <div class="error-msg" *ngIf="isOutgoing && quantity > ingredient.quantity">
            Cannot exceed current stock ({{ ingredient.quantity }} {{ ingredient.unit }})
          </div>
        </div>

        <!-- Lot Details (purchase only) -->
        <div class="section lot-section" *ngIf="selectedType === 'purchase'">
          <label class="section-label lot-label">Lot Details</label>
          <div class="lot-grid">
            <div class="lot-field">
              <label>Supplier</label>
              <input type="text" class="lot-input" [(ngModel)]="lotSupplier" [placeholder]="ingredient.supplier || 'Supplier name'">
            </div>
            <div class="lot-field">
              <label>Unit Cost (&#8369;)</label>
              <input type="number" class="lot-input" [(ngModel)]="lotUnitCost" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="lot-field">
              <label>Expiration Date</label>
              <input type="date" class="lot-input" [(ngModel)]="lotExpirationDate">
            </div>
            <div class="lot-field">
              <label>Lot / Invoice #</label>
              <input type="text" class="lot-input" [(ngModel)]="lotNumber" placeholder="e.g. INV-2024-047">
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="section">
          <label class="section-label">Notes (optional)</label>
          <textarea class="notes-input" [(ngModel)]="notes" rows="2" placeholder="e.g. Received from supplier, expired items discarded..."></textarea>
        </div>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <app-button variant="secondary" (click)="dialogRef.close()">Cancel</app-button>
        <app-button variant="primary" (click)="submit()" [disabled]="!isValid">
          {{ isOutgoing ? 'Remove' : 'Add' }} {{ quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} {{ ingredient.unit }}
        </app-button>
      </div>
    </div>
  `,
  styles: [`
    .adjustment-dialog {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      font-family: var(--font-ui);
      color: var(--text-primary);
      background: var(--bg-surface);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .header-avatar {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    .header-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .header-text h2 {
      font-family: var(--font-display);
      font-size: 1.0625rem;
      font-weight: 700;
      margin: 0;
    }

    .header-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .dialog-close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      transition: background var(--transition-fast);
    }

    .dialog-close-btn:hover {
      background: var(--bg-subtle);
    }

    .dialog-body {
      padding: 20px 24px;
      overflow-y: auto;
      flex: 1;
    }

    .section {
      margin-bottom: 20px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-label {
      display: block;
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    /* Type grid */
    .type-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .type-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      cursor: pointer;
      text-align: left;
      transition: border-color var(--transition-fast), background var(--transition-fast);
      font-family: inherit;
    }

    .type-card:hover {
      border-color: var(--type-color, var(--border-strong));
      background: var(--bg-subtle);
    }

    .type-card.selected {
      border-color: var(--type-color, var(--accent));
      background: color-mix(in srgb, var(--type-color, var(--accent)) 8%, transparent);
    }

    .type-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .type-card.selected .type-label {
      color: var(--type-color, var(--accent));
    }

    .type-desc {
      font-size: 0.6875rem;
      color: var(--text-muted);
    }

    /* Quantity input */
    .qty-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .qty-step {
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      background: var(--bg-surface);
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      transition: background var(--transition-fast);
      flex-shrink: 0;
    }

    .qty-step:hover:not(:disabled) {
      background: var(--bg-subtle);
    }

    .qty-step:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .qty-input {
      flex: 1;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      text-align: center;
      padding: 0 12px;
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .qty-input:focus {
      border-color: var(--accent);
    }

    .qty-input::-webkit-inner-spin-button,
    .qty-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .qty-preview {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 6px;
      text-align: center;
    }

    .qty-preview strong {
      color: var(--text-primary);
    }

    .error-msg {
      font-size: 0.75rem;
      color: var(--danger);
      margin-top: 6px;
      text-align: center;
    }

    /* Lot details section */
    .lot-section {
      background: rgba(22, 163, 74, 0.04);
      border: 1px solid rgba(22, 163, 74, 0.15);
      border-radius: var(--radius-md);
      padding: 14px 16px;
    }

    .lot-label {
      color: var(--success) !important;
    }

    .lot-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .lot-field label {
      display: block;
      font-size: 0.6875rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .lot-input {
      width: 100%;
      height: 34px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 0.8125rem;
      padding: 0 10px;
      outline: none;
      transition: border-color var(--transition-fast);
      box-sizing: border-box;
    }

    .lot-input:focus {
      border-color: var(--success);
    }

    .lot-input::placeholder {
      color: var(--text-muted);
    }

    /* Notes */
    .notes-input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 0.8125rem;
      padding: 8px 12px;
      resize: vertical;
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .notes-input:focus {
      border-color: var(--accent);
    }

    .notes-input::placeholder {
      color: var(--text-muted);
    }

    /* Footer */
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 24px;
      border-top: 1px solid var(--border);
    }

    @media (max-width: 480px) {
      .type-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class StockAdjustmentDialogComponent {
  ingredient: Ingredient;
  quantity = 1;
  notes = '';
  selectedType = 'purchase';

  // Lot fields (purchase only)
  lotSupplier = '';
  lotUnitCost: number | null = null;
  lotExpirationDate = '';
  lotNumber = '';

  movementTypes: MovementTypeOption[] = [
    { value: 'purchase', label: 'Purchase', description: 'Received from supplier', direction: 'in', color: '#16a34a' },
    { value: 'return', label: 'Return', description: 'Returned to supplier', direction: 'out', color: '#2563eb' },
    { value: 'waste', label: 'Waste', description: 'Spoiled, damaged, expired', direction: 'out', color: '#dc2626' },
    { value: 'adjustment', label: 'Adjustment', description: 'Correction or count', direction: 'both', color: '#6366f1' }
  ];

  constructor(
    public dialogRef: MatDialogRef<StockAdjustmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StockAdjustmentDialogData
  ) {
    this.ingredient = data.ingredient;
    this.lotSupplier = data.ingredient.supplier || '';
    this.lotUnitCost = data.ingredient.unitCost || null;
    if (data.defaultAdjustment) {
      this.quantity = Math.abs(data.defaultAdjustment);
      this.selectedType = data.defaultAdjustment > 0 ? 'purchase' : 'waste';
    }
  }

  get isPiece(): boolean {
    const u = this.ingredient.unit;
    return u === 'pcs' || u === 'piece' || u === 'pieces';
  }

  get currentOption(): MovementTypeOption {
    return this.movementTypes.find(t => t.value === this.selectedType)!;
  }

  get isOutgoing(): boolean {
    return this.currentOption.direction === 'out';
  }

  get isValid(): boolean {
    if (this.quantity <= 0) return false;
    if (this.isOutgoing && this.quantity > this.ingredient.quantity) return false;
    return true;
  }

  selectType(opt: MovementTypeOption): void {
    this.selectedType = opt.value;
  }

  stepQuantity(step: number): void {
    const newVal = this.quantity + step;
    if (newVal > 0) {
      this.quantity = this.isPiece ? Math.round(newVal) : parseFloat(newVal.toFixed(2));
    }
  }

  submit(): void {
    if (!this.isValid) return;

    const adjustment = this.isOutgoing ? -this.quantity : this.quantity;
    const result: StockAdjustmentResult = {
      adjustment,
      movementType: this.selectedType,
      reason: this.currentOption.label,
      notes: this.notes.trim()
    };

    // Include lot fields for purchases
    if (this.selectedType === 'purchase') {
      result.supplier = this.lotSupplier.trim() || undefined;
      result.unitCost = this.lotUnitCost ?? undefined;
      result.expirationDate = this.lotExpirationDate || undefined;
      result.lotNumber = this.lotNumber.trim() || undefined;
    }

    this.dialogRef.close(result);
  }

  getColor(name: string): string {
    const colors = [
      '#7C3AED', '#6366F1', '#2563EB', '#0891B2', '#059669',
      '#D97706', '#DC2626', '#DB2777', '#7C3AED', '#4F46E5'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
