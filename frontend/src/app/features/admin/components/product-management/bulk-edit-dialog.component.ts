import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BulkUpdateFields } from '../../../pos/services/product.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

export interface BulkEditDialogData {
  productCount: number;
  categories: string[];
}

@Component({
  selector: 'app-bulk-edit-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, ButtonComponent],
  template: `
    <div class="bulk-dialog">
      <div class="dialog-header">
        <div>
          <h2>Bulk edit</h2>
          <p class="dialog-subtitle">Applying to {{ data.productCount }} product{{ data.productCount === 1 ? '' : 's' }}</p>
        </div>
        <button class="dialog-close-btn" (click)="onClose()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="dialog-body">
        <form [formGroup]="form" (ngSubmit)="apply()">
          <!-- Status -->
          <section class="field-block">
            <label class="field-toggle">
              <input type="checkbox" formControlName="changeActive" />
              <span>Change status</span>
            </label>
            <div class="field-body" *ngIf="form.get('changeActive')?.value">
              <select class="form-control form-select" formControlName="isActive">
                <option [ngValue]="true">Active</option>
                <option [ngValue]="false">Inactive</option>
              </select>
            </div>
          </section>

          <!-- Category -->
          <section class="field-block">
            <label class="field-toggle">
              <input type="checkbox" formControlName="changeCategory" />
              <span>Move to category</span>
            </label>
            <div class="field-body" *ngIf="form.get('changeCategory')?.value">
              <input type="text" class="form-control" formControlName="category"
                placeholder="Enter category name" list="bulkCategoryOptions" />
              <datalist id="bulkCategoryOptions">
                <option *ngFor="let cat of data.categories" [value]="cat"></option>
              </datalist>
              <p class="field-hint">Pick an existing category or type a new one.</p>
            </div>
          </section>

          <!-- Price -->
          <section class="field-block">
            <label class="field-toggle">
              <input type="checkbox" formControlName="changePrice" />
              <span>Change price</span>
            </label>
            <div class="field-body" *ngIf="form.get('changePrice')?.value">
              <div class="seg-control">
                <label [class.seg-active]="form.get('priceMode')?.value === 'set'">
                  <input type="radio" formControlName="priceMode" value="set" /> Set to
                </label>
                <label [class.seg-active]="form.get('priceMode')?.value === 'percent'">
                  <input type="radio" formControlName="priceMode" value="percent" /> Adjust by %
                </label>
              </div>
              <div class="input-with-suffix">
                <input type="number" class="form-control" formControlName="priceValue"
                  [placeholder]="form.get('priceMode')?.value === 'percent' ? 'e.g. 10 or -5' : 'e.g. 99.00'" />
                <span class="input-suffix" *ngIf="form.get('priceMode')?.value === 'percent'">%</span>
                <span class="input-suffix" *ngIf="form.get('priceMode')?.value === 'set'">₱</span>
              </div>
              <p class="field-hint" *ngIf="form.get('priceMode')?.value === 'percent'">
                Positive = increase, negative = decrease (e.g. -10 takes 10% off each price).
              </p>
            </div>
          </section>

          <!-- Stock -->
          <section class="field-block">
            <label class="field-toggle">
              <input type="checkbox" formControlName="changeStock" />
              <span>Change stock</span>
            </label>
            <div class="field-body" *ngIf="form.get('changeStock')?.value">
              <div class="seg-control">
                <label [class.seg-active]="form.get('stockMode')?.value === 'set'">
                  <input type="radio" formControlName="stockMode" value="set" /> Set to
                </label>
                <label [class.seg-active]="form.get('stockMode')?.value === 'delta'">
                  <input type="radio" formControlName="stockMode" value="delta" /> Adjust by
                </label>
              </div>
              <input type="number" class="form-control" formControlName="stockValue"
                [placeholder]="form.get('stockMode')?.value === 'delta' ? 'e.g. 10 or -5' : 'e.g. 50'" />
              <p class="field-hint" *ngIf="form.get('stockMode')?.value === 'delta'">
                Positive adds stock, negative removes. Won't go below zero.
              </p>
            </div>
          </section>

          <!-- Add-ons -->
          <section class="field-block">
            <label class="field-toggle">
              <input type="checkbox" formControlName="changeAddOns" />
              <span>Replace add-ons</span>
            </label>
            <div class="field-body" *ngIf="form.get('changeAddOns')?.value">
              <p class="field-hint">Replaces the entire add-on list on every selected product. Empty list removes all add-ons.</p>
              <div formArrayName="addOns" class="addons-list">
                <div *ngFor="let row of addOns.controls; let i = index" [formGroupName]="i" class="addon-row">
                  <input type="text" class="form-control" formControlName="name" placeholder="Add-on name" />
                  <input type="number" class="form-control addon-price-input" formControlName="price" placeholder="0.00" min="0" step="0.01" />
                  <button type="button" class="addon-remove" (click)="removeAddOn(i)" aria-label="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <button type="button" class="addon-add-btn" (click)="addAddOn()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                </svg>
                Add row
              </button>
            </div>
          </section>

          <div class="dialog-footer">
            <p class="footer-warn" *ngIf="!hasAnyFieldSelected()">Pick at least one field to update.</p>
            <div class="footer-actions">
              <app-button type="button" variant="ghost" size="sm" (click)="onClose()">Cancel</app-button>
              <app-button type="submit" variant="primary" size="sm" [disabled]="!canApply()">
                Apply to {{ data.productCount }}
              </app-button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .bulk-dialog {
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      color: var(--text-primary);
      font-family: var(--font-ui);
      max-height: 85vh;
    }
    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .dialog-subtitle {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .dialog-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
    }
    .dialog-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-primary);
    }
    .dialog-body {
      padding: 16px 20px;
      overflow-y: auto;
      flex: 1;
    }
    .field-block {
      padding: 12px 0;
      border-bottom: 1px dashed var(--border);
    }
    .field-block:last-of-type {
      border-bottom: none;
    }
    .field-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    .field-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .field-body {
      margin-top: 10px;
      padding-left: 26px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .field-hint {
      margin: 0;
      font-size: 0.7rem;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .form-control {
      padding: 0 12px;
      height: 34px;
      line-height: 34px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: var(--font-ui);
      outline: none;
      width: 100%;
      box-sizing: border-box;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .form-control:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }
    .form-select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 32px;
    }
    .seg-control {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: var(--bg-subtle);
      align-self: flex-start;
    }
    .seg-control label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 0.78rem;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .seg-control label.seg-active {
      background: var(--accent);
      color: var(--text-inverse, white);
    }
    .seg-control input[type="radio"] {
      display: none;
    }
    .input-with-suffix {
      position: relative;
    }
    .input-with-suffix .form-control {
      padding-right: 36px;
    }
    .input-suffix {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      pointer-events: none;
    }
    .addons-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .addon-row {
      display: grid;
      grid-template-columns: 1fr 110px 34px;
      gap: 6px;
      align-items: center;
    }
    .addon-price-input {
      text-align: right;
    }
    .addon-remove {
      width: 34px;
      height: 34px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .addon-remove:hover {
      color: var(--danger);
      border-color: var(--danger);
    }
    .addon-add-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
      padding: 6px 10px;
      background: transparent;
      border: 1px dashed var(--border);
      border-radius: 5px;
      font-size: 0.75rem;
      color: var(--text-secondary);
      cursor: pointer;
    }
    .addon-add-btn:hover {
      color: var(--accent);
      border-color: var(--accent);
    }
    .dialog-footer {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .footer-warn {
      margin: 0;
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .footer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `]
})
export class BulkEditDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<BulkEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkEditDialogData
  ) {
    this.form = this.fb.group({
      changeActive: [false],
      isActive: [true],

      changeCategory: [false],
      category: [''],

      changePrice: [false],
      priceMode: ['set'],
      priceValue: [0, [Validators.min(-100)]],

      changeStock: [false],
      stockMode: ['set'],
      stockValue: [0],

      changeAddOns: [false],
      addOns: this.fb.array([])
    });
  }

  get addOns(): FormArray {
    return this.form.get('addOns') as FormArray;
  }

  addAddOn(): void {
    this.addOns.push(this.fb.group({
      name: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]]
    }));
  }

  removeAddOn(index: number): void {
    this.addOns.removeAt(index);
  }

  hasAnyFieldSelected(): boolean {
    const v = this.form.value;
    return !!(v.changeActive || v.changeCategory || v.changePrice || v.changeStock || v.changeAddOns);
  }

  canApply(): boolean {
    if (!this.hasAnyFieldSelected()) return false;
    const v = this.form.value;
    if (v.changeCategory && !v.category?.trim()) return false;
    if (v.changePrice && (v.priceValue === null || v.priceValue === undefined || isNaN(Number(v.priceValue)))) return false;
    if (v.changeStock && (v.stockValue === null || v.stockValue === undefined || isNaN(Number(v.stockValue)))) return false;
    if (v.changeAddOns && this.addOns.controls.some(c => !c.value.name?.trim())) return false;
    return true;
  }

  apply(): void {
    if (!this.canApply()) return;
    const v = this.form.value;
    const updates: BulkUpdateFields = {};

    if (v.changeActive) updates.isActive = !!v.isActive;
    if (v.changeCategory) updates.category = v.category.trim();
    if (v.changePrice) {
      updates.price = {
        mode: v.priceMode === 'percent' ? 'percent' : 'set',
        value: Number(v.priceValue) || 0
      };
    }
    if (v.changeStock) {
      updates.stock = {
        mode: v.stockMode === 'delta' ? 'delta' : 'set',
        value: Math.trunc(Number(v.stockValue) || 0)
      };
    }
    if (v.changeAddOns) {
      updates.addOns = {
        items: this.addOns.controls
          .map(c => ({
            name: (c.value.name || '').trim(),
            price: Number(c.value.price) || 0
          }))
          .filter(a => a.name.length > 0)
      };
    }

    this.dialogRef.close(updates);
  }

  onClose(): void {
    this.dialogRef.close(null);
  }
}
