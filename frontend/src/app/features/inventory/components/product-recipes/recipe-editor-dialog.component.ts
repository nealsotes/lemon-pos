import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Product } from '../../../pos/models/product.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { RecipeLine, RecipeLineRequest } from '../../../pos/models/recipe.model';
import { RecipeService } from '../../../pos/services/recipe.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { SearchInputComponent } from '../../../../shared/ui/search-input/search-input.component';

export interface RecipeEditorDialogData {
  product: Product;
  ingredients: Ingredient[];
}

interface WorkingRecipeLine {
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  displayUnit: string;
  displayQuantity: number;
}

// Maps baseUnit → { inputUnit: conversionFactor }
// factor converts FROM inputUnit TO baseUnit: baseValue = inputValue * factor
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  'kg': { 'kg': 1, 'g': 0.001 },
  'g':  { 'g': 1, 'kg': 1000 },
  'L':  { 'L': 1, 'ml': 0.001 },
  'ml': { 'ml': 1, 'L': 1000 },
};

const SMART_DEFAULTS: Record<string, string> = {
  'kg': 'g',
  'L': 'ml',
};

function compatibleUnits(baseUnit: string): string[] {
  const conversions = UNIT_CONVERSIONS[baseUnit];
  return conversions ? Object.keys(conversions) : [baseUnit];
}

function toBase(value: number, fromUnit: string, baseUnit: string): number {
  if (fromUnit === baseUnit) return value;
  return value * (UNIT_CONVERSIONS[baseUnit]?.[fromUnit] ?? 1);
}

function fromBase(value: number, baseUnit: string, toUnit: string): number {
  if (toUnit === baseUnit) return value;
  const factor = UNIT_CONVERSIONS[baseUnit]?.[toUnit] ?? 1;
  return value / factor;
}

function smartDisplayUnit(baseUnit: string, baseQuantity: number): string {
  const alt = SMART_DEFAULTS[baseUnit];
  if (!alt) return baseUnit;
  const converted = fromBase(baseQuantity, baseUnit, alt);
  return converted >= 1 ? alt : baseUnit;
}

@Component({
  selector: 'app-recipe-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    ButtonComponent,
    BadgeComponent,
    LoadingSpinnerComponent,
    SearchInputComponent
  ],
  template: `
    <div class="recipe-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="dialog-product-info">
          <div class="dialog-product-img">
            <img *ngIf="isImageUrl(data.product.image)" [src]="data.product.image" [alt]="data.product.name">
            <div *ngIf="!isImageUrl(data.product.image)" class="dialog-product-placeholder">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
          </div>
          <div class="dialog-product-text">
            <h2 class="dialog-product-name">{{ data.product.name }}</h2>
            <span class="dialog-product-cat">{{ data.product.category }} · &#8369;{{ (data.product.price || 0) | number:'1.2-2' }}</span>
          </div>
        </div>
        <button class="dialog-close-btn" (click)="onClose()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Cost Metrics -->
      <div class="dialog-metrics">
        <div class="metric-card">
          <span class="metric-label">Recipe Cost</span>
          <span class="metric-value">&#8369;{{ getRecipeCost() | number:'1.2-2' }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Selling Price</span>
          <span class="metric-value">&#8369;{{ (data.product.price || 0) | number:'1.2-2' }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Margin</span>
          <span class="metric-value"
            [class.positive]="getMargin() > 0"
            [class.negative]="getMargin() < 0">
            &#8369;{{ getMargin() | number:'1.2-2' }}
          </span>
        </div>
        <div class="metric-card">
          <span class="metric-label">Margin %</span>
          <span class="metric-value"
            [class.positive]="getMarginPercent() > 0"
            [class.negative]="getMarginPercent() < 0">
            {{ getMarginPercent() | number:'1.1-1' }}%
          </span>
        </div>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <!-- Loading -->
        <app-loading-spinner *ngIf="isLoading" message="Loading recipe..."></app-loading-spinner>

        <ng-container *ngIf="!isLoading">
          <!-- Recipe Ingredients -->
          <div class="recipe-section">
            <div class="recipe-section-header">
              <span class="recipe-section-label">
                Recipe Ingredients
                <app-badge *ngIf="workingLines.length > 0" variant="neutral">{{ workingLines.length }}</app-badge>
              </span>
              <div class="save-indicator">
                <span class="unsaved-dot" *ngIf="hasChanges" title="Unsaved changes"></span>
                <app-badge *ngIf="!hasChanges && workingLines.length > 0" variant="success">Saved</app-badge>
              </div>
            </div>

            <div class="recipe-lines" *ngIf="workingLines.length > 0">
              <div class="recipe-line" *ngFor="let line of workingLines; let i = index">
                <div class="line-ingredient">
                  <div class="line-avatar" [style.background]="getIngredientColor(line.ingredientName)">
                    {{ line.ingredientName.charAt(0).toUpperCase() }}
                  </div>
                  <div class="line-info">
                    <span class="line-name">{{ line.ingredientName }}</span>
                    <span class="line-cost">
                      &#8369;{{ getLineCost(line) | number:'1.2-2' }} cost
                      <span class="base-hint" *ngIf="line.displayUnit !== line.baseUnit">
                        · {{ getBaseQuantity(line) | number:'1.0-4' }} {{ line.baseUnit }}
                      </span>
                    </span>
                  </div>
                </div>
                <div class="line-qty">
                  <input type="number" class="line-qty-input" [(ngModel)]="line.displayQuantity"
                    step="0.01" min="0.01" placeholder="0">
                  <select class="line-unit-select" *ngIf="getCompatibleUnits(line.baseUnit).length > 1"
                    [ngModel]="line.displayUnit" (ngModelChange)="onLineUnitChange(line, $event)">
                    <option *ngFor="let u of getCompatibleUnits(line.baseUnit)" [value]="u">{{ u }}</option>
                  </select>
                  <span class="line-unit" *ngIf="getCompatibleUnits(line.baseUnit).length <= 1">{{ line.displayUnit }}</span>
                </div>
                <button class="line-remove" (click)="removeLine(i)" title="Remove">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="recipe-empty" *ngIf="workingLines.length === 0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
                <path d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p>No ingredients yet. Add from below.</p>
            </div>
          </div>

          <!-- Add Ingredient -->
          <div class="add-section" *ngIf="availableIngredients.length > 0">
            <div class="add-section-head">
              <span class="add-section-label">Add Ingredient</span>
              <app-search-input *ngIf="data.ingredients.length > 6"
                placeholder="Filter..."
                [value]="ingredientSearchTerm"
                (search)="ingredientSearchTerm = $event"
                class="add-search-input">
              </app-search-input>
            </div>
            <div class="add-card-grid">
              <button type="button"
                *ngFor="let ing of filteredAvailableIngredients"
                class="add-ing-card"
                [class.selected]="addIngredientId === ing.id"
                (click)="toggleIngredient(ing)">
                <div class="add-ing-avatar" [style.background]="getIngredientColor(ing.name)">
                  {{ ing.name.charAt(0).toUpperCase() }}
                </div>
                <span class="add-ing-name">{{ ing.name }}</span>
                <span class="add-ing-stock">{{ ing.quantity | number:'1.0-1' }} {{ ing.unit }}</span>
                <div class="add-ing-check" *ngIf="addIngredientId === ing.id">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="10" height="10">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
              </button>
            </div>

            <!-- Qty row -->
            <div class="add-qty-bar" *ngIf="addIngredientId">
              <div class="add-qty-top">
                <div class="add-qty-text">
                  <span>Qty per serving of</span>
                  <strong>{{ getSelectedIngredient()?.name }}</strong>
                </div>
                <div class="unit-pills" *ngIf="getCompatibleUnits(getSelectedIngredient()?.unit || '').length > 1">
                  <button type="button"
                    *ngFor="let u of getCompatibleUnits(getSelectedIngredient()?.unit || '')"
                    class="unit-pill"
                    [class.active]="addSelectedUnit === u"
                    (click)="addSelectedUnit = u">
                    {{ u }}
                  </button>
                </div>
              </div>
              <div class="add-qty-actions">
                <div class="qty-input-group">
                  <input type="number" class="add-qty-field"
                    [(ngModel)]="addQuantityPerUnit" [placeholder]="getSmartPlaceholder()" step="0.01"
                    (keydown.enter)="addLine()">
                  <span class="qty-suffix">{{ addSelectedUnit || getSelectedIngredient()?.unit }}</span>
                </div>
                <span class="add-conversion-hint" *ngIf="addQuantityPerUnit && addSelectedUnit && addSelectedUnit !== getSelectedIngredient()?.unit">
                  = {{ getAddBaseQuantity() | number:'1.0-4' }} {{ getSelectedIngredient()?.unit }}
                </span>
                <app-button variant="primary" size="sm" (click)="addLine()">Add</app-button>
              </div>
            </div>
          </div>

          <div class="all-used" *ngIf="availableIngredients.length === 0 && workingLines.length > 0">
            <p>All available ingredients are in the recipe.</p>
          </div>
        </ng-container>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <app-button variant="secondary" (click)="onClose()">Close</app-button>
        <app-button variant="primary" (click)="saveRecipe()" [disabled]="!hasChanges || isSaving" [loading]="isSaving">
          Save Recipe
        </app-button>
      </div>
    </div>
  `,
  styles: [`
    .recipe-dialog {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
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
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
    }

    .dialog-product-info {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .dialog-product-img {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .dialog-product-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .dialog-product-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-subtle);
      color: var(--text-muted);
      border-radius: var(--radius-sm);
    }

    .dialog-product-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .dialog-product-name {
      font-family: var(--font-display);
      font-size: 0.9375rem;
      font-weight: 700;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dialog-product-cat {
      font-size: 0.6875rem;
      color: var(--text-muted);
    }

    .dialog-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
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

    /* ---------- Metrics ---------- */
    .dialog-metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: var(--border);
      border-bottom: 1px solid var(--border);
    }

    .metric-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 10px 6px;
      background: var(--bg-surface);
    }

    .metric-label {
      font-size: 0.5rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .metric-value {
      font-family: var(--font-display);
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .metric-value.positive { color: var(--success); }
    .metric-value.negative { color: var(--danger); }

    /* ---------- Body ---------- */
    .dialog-body {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 14px 20px;
    }

    /* ---------- Recipe Section ---------- */
    .recipe-section {
      border-bottom: 1px solid var(--border);
    }

    .recipe-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
    }

    .recipe-section-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .save-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .unsaved-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--warning);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .recipe-lines {
      display: flex;
      flex-direction: column;
    }

    .recipe-line {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      transition: background var(--transition-fast);
    }

    .recipe-line:last-child {
      border-bottom: none;
    }

    .recipe-line:hover {
      background: var(--bg-subtle);
    }

    .line-ingredient {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    .line-avatar {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6875rem;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    .line-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .line-name {
      font-weight: 600;
      font-size: 0.8125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line-cost {
      font-size: 0.625rem;
      color: var(--text-muted);
    }

    .line-qty {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .line-qty-input {
      width: 72px;
      height: 28px;
      padding: 0 8px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 0.75rem;
      outline: none;
      text-align: right;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .line-qty-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .line-unit {
      font-size: 0.625rem;
      color: var(--text-muted);
      font-weight: 500;
      min-width: 20px;
    }

    .line-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .line-remove:hover {
      color: var(--danger);
      border-color: var(--danger);
      background: rgba(220, 38, 38, 0.06);
    }

    .recipe-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px;
      text-align: center;
    }

    .recipe-empty svg {
      color: var(--text-muted);
      opacity: 0.25;
    }

    .recipe-empty p {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin: 0;
    }

    /* ---------- Add Ingredient Section ---------- */
    .add-section {
      border-bottom: 1px solid var(--border);
    }

    .add-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
    }

    .add-section-label {
      font-size: 0.6875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .add-search-input {
      max-width: 180px;
    }

    .add-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 6px;
      padding: 8px 0;
      max-height: 140px;
      overflow-y: auto;
    }

    .add-ing-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 6px 4px 5px;
      background: var(--bg-subtle);
      border: 1.5px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all var(--transition-fast);
      font-family: var(--font-ui);
      text-align: center;
    }

    .add-ing-card:hover {
      border-color: var(--accent);
      background: rgba(var(--accent-rgb), 0.03);
    }

    .add-ing-card.selected {
      border-color: var(--accent);
      background: rgba(var(--accent-rgb), 0.06);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .add-ing-avatar {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      font-weight: 700;
      color: #fff;
    }

    .add-ing-name {
      font-weight: 600;
      font-size: 0.625rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      line-height: 1.3;
    }

    .add-ing-stock {
      font-size: 0.5625rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .add-ing-check {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .add-qty-bar {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 0;
      background: rgba(var(--accent-rgb), 0.03);
      border-top: 1px solid var(--border);
      animation: slideDown 150ms ease-out;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .add-qty-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .add-qty-text {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.75rem;
      color: var(--text-secondary);
      flex-wrap: wrap;
    }

    .unit-pills {
      display: flex;
      gap: 4px;
    }

    .unit-pill {
      padding: 4px 12px;
      font-size: 0.6875rem;
      font-weight: 700;
      font-family: var(--font-ui);
      background: var(--bg-subtle);
      border: 1.5px solid var(--border);
      border-radius: 100px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      text-transform: lowercase;
    }

    .unit-pill:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .unit-pill.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .add-qty-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .qty-input-group {
      display: flex;
      align-items: center;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .qty-input-group:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .add-qty-field {
      width: 80px;
      padding: 7px 10px;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: 0.8125rem;
      font-family: var(--font-ui);
      outline: none;
      text-align: right;
    }

    .qty-suffix {
      padding: 0 10px 0 4px;
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .add-conversion-hint {
      font-size: 0.6875rem;
      color: var(--accent);
      font-weight: 600;
      font-family: var(--font-display);
      white-space: nowrap;
    }

    /* ---------- Line Unit Select ---------- */
    .line-unit-select {
      height: 28px;
      padding: 0 6px;
      font-size: 0.75rem;
      font-weight: 600;
      font-family: var(--font-ui);
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-secondary);
      cursor: pointer;
      outline: none;
      min-width: 36px;
      transition: border-color var(--transition-fast);
    }

    .line-unit-select:focus {
      border-color: var(--accent);
    }

    .base-hint {
      color: var(--accent);
      font-weight: 600;
      font-size: 0.5625rem;
      opacity: 0.8;
    }

    .all-used {
      padding: 16px 0;
      text-align: center;
    }

    .all-used p {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0;
    }

    /* ---------- Footer ---------- */
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 10px 20px;
      border-top: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 640px) {
      .dialog-header {
        padding: 16px;
      }

      .dialog-metrics {
        grid-template-columns: repeat(2, 1fr);
      }

      .recipe-line {
        padding: 10px 16px;
        flex-wrap: wrap;
      }

      .line-ingredient {
        flex-basis: 100%;
      }

      .line-qty {
        margin-left: 38px;
      }

      .add-card-grid {
        padding: 10px 16px;
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      }

      .add-qty-bar {
        padding: 10px 16px;
      }

      .add-qty-actions {
        flex-wrap: wrap;
      }

      .dialog-footer {
        padding: 12px 16px;
      }

      .recipe-section-header,
      .add-section-head {
        padding: 10px 16px;
      }
    }
  `]
})
export class RecipeEditorDialogComponent implements OnInit {
  workingLines: WorkingRecipeLine[] = [];
  recipeLines: RecipeLine[] = [];
  fifoCosts: Record<string, number> = {};
  isLoading = true;
  isSaving = false;

  ingredientSearchTerm = '';
  addIngredientId = '';
  addQuantityPerUnit: number | null = null;
  addSelectedUnit = '';

  constructor(
    public dialogRef: MatDialogRef<RecipeEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RecipeEditorDialogData,
    private recipeService: RecipeService,
    private ingredientService: IngredientService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.loadRecipe();
    this.loadFifoCosts();
  }

  private loadFifoCosts(): void {
    this.ingredientService.getFifoCosts().subscribe({
      next: (costs) => this.fifoCosts = costs,
      error: () => {} // Silently fall back to ingredient.unitCost
    });
  }

  loadRecipe(): void {
    this.isLoading = true;
    this.recipeService.getRecipe(this.data.product.id).subscribe({
      next: lines => {
        this.recipeLines = lines;
        this.workingLines = lines.map(l => {
          const du = smartDisplayUnit(l.unit, l.quantityPerUnit);
          return {
            ingredientId: l.ingredientId,
            ingredientName: l.ingredientName,
            baseUnit: l.unit,
            displayUnit: du,
            displayQuantity: Math.round(fromBase(l.quantityPerUnit, l.unit, du) * 10000) / 10000
          };
        });
        this.isLoading = false;
      },
      error: err => {
        this.toast.error(err?.message || 'Failed to load recipe');
        this.isLoading = false;
      }
    });
  }

  get hasChanges(): boolean {
    if (this.recipeLines.length !== this.workingLines.length) return true;
    for (let i = 0; i < this.workingLines.length; i++) {
      const a = this.recipeLines[i];
      const b = this.workingLines[i];
      if (!a || !b || a.ingredientId !== b.ingredientId) return true;
      const baseQty = toBase(b.displayQuantity, b.displayUnit, b.baseUnit);
      if (Math.abs(a.quantityPerUnit - baseQty) > 0.0001) return true;
    }
    return false;
  }

  get availableIngredients(): Ingredient[] {
    const usedIds = new Set(this.workingLines.map(l => l.ingredientId));
    return this.data.ingredients.filter(i => !usedIds.has(i.id));
  }

  get filteredAvailableIngredients(): Ingredient[] {
    const available = this.availableIngredients;
    if (!this.ingredientSearchTerm.trim()) return available;
    const term = this.ingredientSearchTerm.toLowerCase().trim();
    return available.filter(i =>
      i.name.toLowerCase().includes(term) ||
      i.unit.toLowerCase().includes(term)
    );
  }

  toggleIngredient(ing: Ingredient): void {
    if (this.addIngredientId === ing.id) {
      this.addIngredientId = '';
      this.addQuantityPerUnit = null;
      this.addSelectedUnit = '';
    } else {
      this.addIngredientId = ing.id;
      this.addQuantityPerUnit = null;
      this.addSelectedUnit = SMART_DEFAULTS[ing.unit] || ing.unit;
    }
  }

  getSelectedIngredient(): Ingredient | undefined {
    return this.data.ingredients.find(i => i.id === this.addIngredientId);
  }

  addLine(): void {
    if (!this.addIngredientId || this.addQuantityPerUnit == null || this.addQuantityPerUnit <= 0) {
      this.toast.error('Select an ingredient and enter a positive quantity.');
      return;
    }
    const ing = this.data.ingredients.find(i => i.id === this.addIngredientId);
    if (!ing) return;
    if (this.workingLines.some(l => l.ingredientId === this.addIngredientId)) {
      this.toast.error('This ingredient is already in the recipe.');
      return;
    }
    const displayUnit = this.addSelectedUnit || ing.unit;
    this.workingLines = [
      ...this.workingLines,
      {
        ingredientId: ing.id,
        ingredientName: ing.name,
        baseUnit: ing.unit,
        displayUnit,
        displayQuantity: this.addQuantityPerUnit
      }
    ];
    this.addIngredientId = '';
    this.addQuantityPerUnit = null;
    this.addSelectedUnit = '';
  }

  removeLine(index: number): void {
    this.workingLines = this.workingLines.filter((_, i) => i !== index);
  }

  saveRecipe(): void {
    const lines: RecipeLineRequest[] = this.workingLines.map(l => ({
      ingredientId: l.ingredientId,
      quantityPerUnit: toBase(l.displayQuantity, l.displayUnit, l.baseUnit)
    }));
    this.isSaving = true;
    this.recipeService.setRecipe(this.data.product.id, { lines }).subscribe({
      next: () => {
        this.toast.success('Recipe saved successfully.');
        this.recipeLines = this.workingLines.map(l => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          quantityPerUnit: toBase(l.displayQuantity, l.displayUnit, l.baseUnit),
          unit: l.baseUnit,
          sortOrder: 0
        }));
        this.isSaving = false;
      },
      error: err => {
        this.toast.error(err?.message || 'Failed to save recipe');
        this.isSaving = false;
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  getRecipeCost(): number {
    return this.workingLines.reduce((acc, line) => {
      return acc + this.getLineCost(line);
    }, 0);
  }

  getMargin(): number {
    return (this.data.product.price || 0) - this.getRecipeCost();
  }

  getMarginPercent(): number {
    const price = this.data.product.price || 0;
    if (price === 0) return 0;
    return ((price - this.getRecipeCost()) / price) * 100;
  }

  getLineCost(line: WorkingRecipeLine): number {
    const fifoCost = this.fifoCosts[line.ingredientId];
    const ingredient = this.data.ingredients.find(i => i.id === line.ingredientId);
    const unitCost = fifoCost ?? ingredient?.unitCost ?? 0;
    const baseQty = toBase(line.displayQuantity, line.displayUnit, line.baseUnit);
    return unitCost * baseQty;
  }

  getBaseQuantity(line: WorkingRecipeLine): number {
    return toBase(line.displayQuantity, line.displayUnit, line.baseUnit);
  }

  getCompatibleUnits(baseUnit: string): string[] {
    return compatibleUnits(baseUnit);
  }

  onLineUnitChange(line: WorkingRecipeLine, newUnit: string): void {
    const baseQty = toBase(line.displayQuantity, line.displayUnit, line.baseUnit);
    line.displayUnit = newUnit;
    line.displayQuantity = Math.round(fromBase(baseQty, line.baseUnit, newUnit) * 10000) / 10000;
  }

  getSmartPlaceholder(): string {
    const unit = this.addSelectedUnit;
    if (unit === 'g') return 'e.g. 200';
    if (unit === 'ml') return 'e.g. 150';
    if (unit === 'kg') return 'e.g. 0.5';
    if (unit === 'L') return 'e.g. 0.25';
    if (unit === 'pcs') return 'e.g. 2';
    return 'e.g. 1';
  }

  getAddBaseQuantity(): number {
    const ing = this.getSelectedIngredient();
    if (!ing || !this.addQuantityPerUnit) return 0;
    return toBase(this.addQuantityPerUnit, this.addSelectedUnit || ing.unit, ing.unit);
  }

  getIngredientColor(name: string): string {
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

  isImageUrl(image: string): boolean {
    if (!image) return false;
    return image.startsWith('data:image/') || image.startsWith('http') || image.startsWith('/uploads/') || image.startsWith('uploads/') || image.startsWith('/');
  }

  getProductColor(name: string): string {
    const colors = [
      '#7C3AED', '#6366F1', '#2563EB', '#0891B2', '#059669',
      '#D97706', '#DC2626', '#DB2777', '#9333EA', '#4F46E5'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
