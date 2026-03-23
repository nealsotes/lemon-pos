import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

export interface IngredientEditorDialogData {
  ingredient: Ingredient | null;
}

@Component({
  selector: 'app-ingredient-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    ButtonComponent
  ],
  template: `
    <div class="ingredient-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <h2>{{ data.ingredient ? 'Edit Ingredient' : 'Add New Ingredient' }}</h2>
        <button class="dialog-close-btn" (click)="onClose()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <form [formGroup]="ingredientForm" (ngSubmit)="save()">
          <!-- Section: Basic Info -->
          <div class="form-section-label">Basic Information</div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label for="name">Name *</label>
              <input type="text" id="name" formControlName="name" class="form-control"
                placeholder="e.g. Arabica Coffee Beans">
              <div class="error-message"
                *ngIf="ingredientForm.get('name')?.invalid && ingredientForm.get('name')?.touched">
                Name is required (minimum 2 characters)
              </div>
            </div>

            <div class="form-group">
              <label for="supplier">Supplier</label>
              <input type="text" id="supplier" formControlName="supplier" class="form-control"
                placeholder="e.g. Metro Wholesale">
            </div>
          </div>

          <!-- Section: Stock & Measurement -->
          <div class="form-section-label">Stock & Measurement</div>
          <div class="form-group unit-group">
            <label>Unit *</label>
            <div class="unit-card-list">
              <button type="button"
                *ngFor="let unit of units"
                class="unit-card"
                [class.selected]="ingredientForm.get('unit')?.value === unit"
                (click)="ingredientForm.get('unit')?.setValue(unit)">
                <span class="unit-icon">{{ getUnitIcon(unit) }}</span>
                <span class="unit-label">{{ unit }}</span>
              </button>
            </div>
          </div>
          <div class="form-grid form-grid-2" style="margin-top: 12px;">
            <div class="form-group">
              <label for="quantity">Quantity *</label>
              <input type="number" id="quantity" formControlName="quantity" class="form-control"
                placeholder="0" [step]="isPieceUnit ? '1' : '0.01'">
            </div>

            <div class="form-group">
              <label for="lowStockThreshold">Low Stock Alert</label>
              <input type="number" id="lowStockThreshold" formControlName="lowStockThreshold" class="form-control"
                placeholder="10" [step]="isPieceUnit ? '1' : '0.01'">
            </div>
          </div>

          <!-- Section: Cost & Tracking -->
          <div class="form-section-label">Cost & Tracking</div>
          <div class="form-grid form-grid-3">
            <div class="form-group">
              <label for="unitCost">Unit Cost (&#8369;)</label>
              <input type="number" id="unitCost" formControlName="unitCost" class="form-control" placeholder="0.00"
                step="0.01">
            </div>

            <div class="form-group">
              <label for="expirationDate">Expiration Date</label>
              <input type="date" id="expirationDate" formControlName="expirationDate" class="form-control">
            </div>

            <div class="form-group value-summary"
              *ngIf="ingredientForm.get('quantity')?.value && ingredientForm.get('unitCost')?.value">
              <label>Total Value</label>
              <div class="summary-val">&#8369;{{ totalCost | number:'1.2-2' }}</div>
            </div>
          </div>
        </form>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <app-button variant="secondary" (click)="onClose()">Cancel</app-button>
        <app-button variant="primary" (click)="save()" [disabled]="ingredientForm.invalid">
          {{ data.ingredient ? 'Update' : 'Add' }} Ingredient
        </app-button>
      </div>
    </div>
  `,
  styles: [`
    .ingredient-dialog {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      font-family: var(--font-ui);
      color: var(--text-primary);
      background: var(--bg-surface);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
    }

    /* ---------- Header ---------- */
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }

    .dialog-header h2 {
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0;
    }

    .dialog-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .dialog-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-primary);
      background: var(--bg-subtle);
    }

    /* ---------- Body ---------- */
    .dialog-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      min-height: 0;
    }

    /* ---------- Form ---------- */
    .form-section-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      margin-bottom: 8px;
      margin-top: 20px;
      padding-left: 2px;
    }

    .form-section-label:first-of-type {
      margin-top: 0;
    }

    .form-grid {
      display: grid;
      gap: 12px;
    }

    .form-grid-2 {
      grid-template-columns: 1fr 1fr;
    }

    .form-grid-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .form-control {
      padding: 10px 12px;
      background: var(--bg-subtle, var(--background-secondary));
      border: 1px solid var(--border, var(--border-color));
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 0.875rem;
      font-family: var(--font-ui);
      outline: none;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .form-control:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .form-control::placeholder {
      color: var(--text-muted);
    }

    /* ---------- Unit Card List ---------- */
    .unit-card-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .unit-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 64px;
      height: 58px;
      padding: 8px 4px;
      background: var(--bg-subtle, var(--background-secondary));
      border: 1.5px solid var(--border, var(--border-color));
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
      font-family: var(--font-ui);
    }

    .unit-card:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(var(--accent-rgb), 0.04);
    }

    .unit-card.selected {
      border-color: var(--accent);
      background: rgba(var(--accent-rgb), 0.08);
      color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .unit-icon {
      font-size: 0.875rem;
      font-weight: 800;
      font-family: var(--font-display);
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .unit-card.selected .unit-icon {
      color: var(--accent);
    }

    .unit-label {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.7;
    }

    .unit-card.selected .unit-label {
      opacity: 1;
    }

    .value-summary {
      background: rgba(var(--accent-rgb), 0.04);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px dashed rgba(var(--accent-rgb), 0.3);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .summary-val {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent);
      font-family: var(--font-display);
      letter-spacing: -0.01em;
    }

    .error-message {
      font-size: 0.6875rem;
      color: var(--danger);
      font-weight: 500;
    }

    /* ---------- Footer ---------- */
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 640px) {
      .dialog-header {
        padding: 16px;
      }

      .dialog-body {
        padding: 16px;
      }

      .form-grid-2,
      .form-grid-3 {
        grid-template-columns: 1fr;
      }

      .dialog-footer {
        padding: 12px 16px;
      }
    }

    @media (pointer: coarse) {
      .form-control {
        min-height: 44px;
        padding: 12px 14px;
        font-size: 1rem;
      }

      .dialog-close-btn {
        width: 44px;
        height: 44px;
      }
    }
  `]
})
export class IngredientEditorDialogComponent implements OnInit {
  ingredientForm: FormGroup;
  units = ['kg', 'g', 'L', 'ml', 'pcs', 'pack', 'bottle', 'can'];

  get isPieceUnit(): boolean {
    const unit = this.ingredientForm.get('unit')?.value;
    return unit === 'pcs' || unit === 'piece' || unit === 'pieces';
  }

  get totalCost(): number {
    const quantity = parseFloat(this.ingredientForm.get('quantity')?.value || '0');
    const unitCost = parseFloat(this.ingredientForm.get('unitCost')?.value || '0');
    return quantity * unitCost;
  }

  constructor(
    public dialogRef: MatDialogRef<IngredientEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: IngredientEditorDialogData,
    private fb: FormBuilder
  ) {
    this.ingredientForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      quantity: ['', [Validators.required, Validators.min(0)]],
      unit: ['', Validators.required],
      supplier: [''],
      expirationDate: [''],
      lowStockThreshold: ['', [Validators.required, Validators.min(0)]],
      unitCost: ['', [Validators.min(0)]],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    if (this.data.ingredient) {
      const ing = this.data.ingredient;
      this.ingredientForm.patchValue({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        supplier: ing.supplier || '',
        expirationDate: ing.expirationDate ? ing.expirationDate.split('T')[0] : '',
        lowStockThreshold: ing.lowStockThreshold,
        unitCost: ing.unitCost || '',
        isActive: ing.isActive
      });
    }
    this.setupQuantityValidation();
  }

  setupQuantityValidation(): void {
    this.ingredientForm.get('unit')?.valueChanges.subscribe(unit => {
      const quantityControl = this.ingredientForm.get('quantity');
      if (quantityControl) {
        if (unit === 'pcs' || unit === 'piece' || unit === 'pieces') {
          quantityControl.setValidators([
            Validators.required,
            Validators.min(0),
            (control) => {
              const value = control.value;
              if (value !== null && value !== '' && value % 1 !== 0) {
                return { wholeNumber: true };
              }
              return null;
            }
          ]);
        } else {
          quantityControl.setValidators([Validators.required, Validators.min(0)]);
        }
        quantityControl.updateValueAndValidity();
      }

      const thresholdControl = this.ingredientForm.get('lowStockThreshold');
      if (thresholdControl) {
        if (unit === 'pcs' || unit === 'piece' || unit === 'pieces') {
          thresholdControl.setValidators([
            Validators.required,
            Validators.min(0),
            (control) => {
              const value = control.value;
              if (value !== null && value !== '' && value % 1 !== 0) {
                return { wholeNumber: true };
              }
              return null;
            }
          ]);
        } else {
          thresholdControl.setValidators([Validators.required, Validators.min(0)]);
        }
        thresholdControl.updateValueAndValidity();
      }
    });
  }

  getUnitIcon(unit: string): string {
    const icons: Record<string, string> = {
      'kg': 'Kg', 'g': 'g', 'L': 'L', 'ml': 'ml',
      'pcs': '#', 'pack': 'Pk', 'bottle': 'Bt', 'can': 'Cn'
    };
    return icons[unit] || unit.substring(0, 2);
  }

  save(): void {
    if (this.ingredientForm.invalid) return;
    this.dialogRef.close(this.ingredientForm.value);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
