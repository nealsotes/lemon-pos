import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IngredientLotService } from '../../services/ingredient-lot.service';
import { IngredientLot } from '../../models/ingredient-lot.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-ingredient-lots-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    ButtonComponent,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="lots-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <div class="header-info">
          <div class="header-avatar" [style.background]="getColor(ingredient?.name || '')">
            {{ (ingredient?.name || '?').charAt(0).toUpperCase() }}
          </div>
          <div class="header-text">
            <h2>{{ ingredient?.name }}</h2>
            <span class="header-sub">
              {{ ingredient?.quantity | number:(isPiece ? '1.0-0' : '1.2-2') }} {{ ingredient?.unit }} on hand
              <span class="header-dot">&middot;</span>
              {{ lots.length }} active lot{{ lots.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
        <button class="dialog-close-btn" (click)="close()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <app-loading-spinner *ngIf="isLoading" message="Loading lots..."></app-loading-spinner>

        <ng-container *ngIf="!isLoading">
          <!-- Lot list -->
          <div class="lot-list" *ngIf="lots.length > 0">
            <div class="lot-row" *ngFor="let lot of lots; let i = index">
              <div class="lot-bar" [class.expiring-soon]="isExpiringSoon(lot)" [class.expired]="isExpired(lot)"></div>
              <div class="lot-info">
                <div class="lot-header-row">
                  <span class="lot-supplier">{{ lot.supplier || 'Unknown Supplier' }}</span>
                  <span class="lot-expiry-badge" *ngIf="lot.expirationDate"
                    [class.danger]="isExpired(lot)"
                    [class.warning]="isExpiringSoon(lot) && !isExpired(lot)"
                    [class.good]="!isExpiringSoon(lot) && !isExpired(lot)">
                    {{ isExpired(lot) ? 'Expired' : formatExpiry(lot.expirationDate) }}
                  </span>
                </div>
                <span class="lot-meta">
                  {{ lot.lotNumber ? 'Lot #' + lot.lotNumber + ' · ' : '' }}Received {{ formatDate(lot.receivedAt) }}
                </span>
              </div>
              <div class="lot-qty">
                <span class="lot-remaining">{{ lot.remainingQuantity | number:(isPiece ? '1.0-0' : '1.2-2') }} {{ ingredient?.unit }}</span>
                <span class="lot-initial">of {{ lot.initialQuantity | number:(isPiece ? '1.0-0' : '1.2-2') }}</span>
              </div>
              <div class="lot-cost">
                <span class="lot-unit-cost">&#8369;{{ lot.unitCost | number:'1.2-2' }}</span>
                <span class="lot-cost-label">/{{ ingredient?.unit }}</span>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div class="empty-state" *ngIf="lots.length === 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <p class="empty-title">No lots found</p>
            <p class="empty-sub">Use the +/- buttons to record a purchase</p>
          </div>
        </ng-container>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <div class="footer-summary" *ngIf="!isLoading && lots.length > 0">
          <span class="summary-item">Avg cost: <strong>&#8369;{{ weightedAvgCost | number:'1.2-2' }}/{{ ingredient?.unit }}</strong></span>
          <span class="summary-item">Total value: <strong>&#8369;{{ totalValue | number:'1.2-2' }}</strong></span>
        </div>
        <app-button variant="secondary" (click)="close()">Close</app-button>
      </div>
    </div>
  `,
  styles: [`
    .lots-dialog {
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

    .header-info { display: flex; align-items: center; gap: 14px; min-width: 0; }

    .header-avatar {
      width: 42px; height: 42px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; font-weight: 700; color: #fff; flex-shrink: 0;
    }

    .header-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .header-text h2 { font-family: var(--font-display); font-size: 1.0625rem; font-weight: 700; margin: 0; }
    .header-sub { font-size: 0.75rem; color: var(--text-muted); }
    .header-dot { margin: 0 2px; }

    .dialog-close-btn {
      width: 32px; height: 32px; border: none; background: transparent;
      border-radius: var(--radius-sm); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-secondary); transition: background var(--transition-fast);
    }
    .dialog-close-btn:hover { background: var(--bg-subtle); }

    .dialog-body { flex: 1; overflow-y: auto; min-height: 0; }

    /* Lot rows */
    .lot-list { padding: 4px 0; }

    .lot-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 20px; border-bottom: 1px solid var(--border);
      transition: background var(--transition-fast);
    }
    .lot-row:last-child { border-bottom: none; }
    .lot-row:hover { background: var(--bg-subtle); }

    .lot-bar {
      flex-shrink: 0; width: 5px; height: 40px; border-radius: 3px;
      background: var(--success);
    }
    .lot-bar.expiring-soon { background: var(--warning); }
    .lot-bar.expired { background: var(--danger); }

    .lot-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .lot-header-row { display: flex; align-items: center; gap: 6px; }
    .lot-supplier { font-weight: 600; font-size: 0.8125rem; color: var(--text-primary); }

    .lot-expiry-badge {
      font-size: 0.625rem; padding: 1px 6px; border-radius: 3px;
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .lot-expiry-badge.good { background: rgba(22, 163, 74, 0.1); color: var(--success); }
    .lot-expiry-badge.warning { background: rgba(217, 119, 6, 0.1); color: var(--warning); }
    .lot-expiry-badge.danger { background: rgba(220, 38, 38, 0.1); color: var(--danger); }

    .lot-meta { font-size: 0.6875rem; color: var(--text-muted); }

    .lot-qty { text-align: right; flex-shrink: 0; min-width: 80px; }
    .lot-remaining { display: block; font-weight: 700; font-size: 0.8125rem; color: var(--text-primary); }
    .lot-initial { display: block; font-size: 0.6875rem; color: var(--text-muted); }

    .lot-cost { text-align: right; flex-shrink: 0; min-width: 80px; }
    .lot-unit-cost { font-weight: 600; font-size: 0.8125rem; color: var(--text-primary); }
    .lot-cost-label { font-size: 0.6875rem; color: var(--text-muted); }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 6px; padding: 48px 24px; text-align: center;
    }
    .empty-state svg { color: var(--text-muted); }
    .empty-title { font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin: 0; }
    .empty-sub { font-size: 0.75rem; color: var(--text-muted); margin: 0; }

    /* Footer */
    .dialog-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 24px; border-top: 1px solid var(--border);
    }

    .footer-summary { display: flex; gap: 16px; font-size: 0.75rem; color: var(--text-muted); }
    .footer-summary strong { color: var(--text-primary); }

    @media (max-width: 600px) {
      .lot-row { flex-wrap: wrap; gap: 8px; }
      .lot-qty, .lot-cost { min-width: auto; }
      .footer-summary { flex-direction: column; gap: 4px; }
    }
  `]
})
export class IngredientLotsDialogComponent implements OnInit {
  ingredient: Ingredient | null = null;
  lots: IngredientLot[] = [];
  isLoading = false;

  constructor(
    private dialogRef: MatDialogRef<IngredientLotsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { ingredient: Ingredient },
    private lotService: IngredientLotService,
    private toast: ToastService
  ) {
    this.ingredient = data.ingredient;
  }

  ngOnInit(): void {
    this.loadLots();
  }

  get isPiece(): boolean {
    const u = this.ingredient?.unit;
    return u === 'pcs' || u === 'piece' || u === 'pieces';
  }

  get weightedAvgCost(): number {
    const totalQty = this.lots.reduce((sum, l) => sum + l.remainingQuantity, 0);
    if (totalQty === 0) return 0;
    const totalValue = this.lots.reduce((sum, l) => sum + l.remainingQuantity * l.unitCost, 0);
    return totalValue / totalQty;
  }

  get totalValue(): number {
    return this.lots.reduce((sum, l) => sum + l.remainingQuantity * l.unitCost, 0);
  }

  loadLots(): void {
    if (!this.ingredient) return;
    this.isLoading = true;
    this.lotService.getLots(this.ingredient.id).subscribe({
      next: (lots) => {
        this.lots = lots;
        this.isLoading = false;
      },
      error: () => {
        this.toast.error('Failed to load lots');
        this.isLoading = false;
      }
    });
  }

  isExpired(lot: IngredientLot): boolean {
    if (!lot.expirationDate) return false;
    return new Date(lot.expirationDate) < new Date();
  }

  isExpiringSoon(lot: IngredientLot): boolean {
    if (!lot.expirationDate) return false;
    const exp = new Date(lot.expirationDate);
    const now = new Date();
    const daysLeft = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 14 && daysLeft >= 0;
  }

  formatExpiry(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
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

  close(): void {
    this.dialogRef.close();
  }
}
