import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StockMovement, MovementType, MovementTypeLabels } from '../../models/stock-movement.model';
import { IngredientLot } from '../../models/ingredient-lot.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { StockMovementService } from '../../services/stock-movement.service';
import { IngredientLotService } from '../../services/ingredient-lot.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface MovementTypeFilter {
  value: MovementType | null;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-stock-movement-history',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    FormsModule,
    BadgeComponent,
    ButtonComponent,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="history-dialog">
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
              <span class="header-dot">·</span>
              {{ movements.length }} movement{{ movements.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
        <button class="dialog-close-btn" (click)="close()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Filter bar -->
      <div class="filter-bar">
        <div class="type-filters">
          <button type="button"
            *ngFor="let f of typeFilters"
            class="type-chip"
            [class.active]="selectedMovementType === f.value"
            (click)="selectType(f.value)">
            {{ f.label }}
          </button>
        </div>
        <div class="date-filters">
          <div class="date-field">
            <label>From</label>
            <input type="date" [(ngModel)]="startDate" (change)="applyFilters()">
          </div>
          <div class="date-field">
            <label>To</label>
            <input type="date" [(ngModel)]="endDate" (change)="applyFilters()">
          </div>
          <button class="clear-btn" *ngIf="startDate || endDate" (click)="clearDates()" title="Clear dates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <app-loading-spinner *ngIf="isLoading" message="Loading movements..."></app-loading-spinner>

        <ng-container *ngIf="!isLoading">
          <!-- Movement list -->
          <div class="movement-list" *ngIf="filteredMovements.length > 0">
            <div class="movement-row" *ngFor="let m of filteredMovements; let i = index">
              <div class="movement-icon" [class]="'icon-' + getTypeClass(m.movementType)">
                <svg *ngIf="m.quantity !== 0 && isIncoming(m.movementType)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
                <svg *ngIf="m.quantity !== 0 && !isIncoming(m.movementType)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
                  <path d="M12 5v14M19 12l-7 7-7-7"/>
                </svg>
                <svg *ngIf="m.quantity === 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="14" height="14">
                  <path d="M12 20V10M18 20V4M6 20v-4"/>
                </svg>
              </div>
              <div class="movement-info">
                <span class="movement-label">{{ m.quantity === 0 ? m.reason : getMovementTypeLabel(m.movementType) }}</span>
                <span class="movement-meta">
                  {{ formatDate(m.createdAt) }}
                  <span *ngIf="m.quantity !== 0 && m.reason"> · {{ m.reason }}</span>
                </span>
                <span class="movement-detail" *ngIf="m.notes">{{ m.notes }}</span>
                <span class="lot-tag" *ngIf="m.lotId && lotMap.get(m.lotId) as lot">
                  {{ lot.supplier || 'Unknown' }}<span *ngIf="lot.lotNumber"> · #{{ lot.lotNumber }}</span>
                </span>
              </div>
              <div class="movement-qty" *ngIf="m.quantity !== 0" [class.incoming]="isIncoming(m.movementType)" [class.outgoing]="!isIncoming(m.movementType)">
                {{ isIncoming(m.movementType) ? '+' : '-' }}{{ (m.quantity < 0 ? -m.quantity : m.quantity) | number:(isPiece ? '1.0-0' : '1.2-2') }}
                <span class="qty-unit">{{ ingredient?.unit }}</span>
              </div>
              <div class="movement-qty muted" *ngIf="m.quantity === 0">--</div>
              <div class="movement-cost" *ngIf="m.unitCost">
                &#8369;{{ m.unitCost | number:'1.2-2' }}
              </div>
              <div class="movement-cost muted" *ngIf="!m.unitCost">--</div>
            </div>
          </div>

          <!-- Empty state -->
          <div class="empty-state" *ngIf="filteredMovements.length === 0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <p class="empty-title">No movements found</p>
            <p class="empty-sub" *ngIf="selectedMovementType !== null || startDate || endDate">Try adjusting your filters</p>
            <p class="empty-sub" *ngIf="selectedMovementType === null && !startDate && !endDate">Stock changes will appear here</p>
          </div>
        </ng-container>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <div class="footer-summary" *ngIf="!isLoading && filteredMovements.length > 0">
          <span class="summary-item incoming">+{{ totalIncoming | number:(isPiece ? '1.0-0' : '1.2-2') }} in</span>
          <span class="summary-item outgoing">-{{ totalOutgoing | number:(isPiece ? '1.0-0' : '1.2-2') }} out</span>
          <span class="summary-item net" [class.incoming]="netChange >= 0" [class.outgoing]="netChange < 0">
            {{ netChange >= 0 ? '+' : '' }}{{ netChange | number:(isPiece ? '1.0-0' : '1.2-2') }} net
          </span>
        </div>
        <app-button variant="secondary" (click)="close()">Close</app-button>
      </div>
    </div>
  `,
  styles: [`
    .history-dialog {
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

    .header-info {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
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
      min-width: 0;
    }

    .header-text h2 {
      font-family: var(--font-display);
      font-size: 1.0625rem;
      font-weight: 700;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .header-dot {
      margin: 0 2px;
      opacity: 0.5;
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

    /* ---------- Filter Bar ---------- */
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 24px;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .type-filters {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .type-chip {
      padding: 4px 12px;
      font-size: 0.6875rem;
      font-weight: 600;
      font-family: var(--font-ui);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 100px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .type-chip:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .type-chip.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .date-filters {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .date-field {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .date-field label {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .date-field input {
      padding: 5px 8px;
      font-size: 0.75rem;
      font-family: var(--font-ui);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .date-field input:focus {
      border-color: var(--accent);
    }

    .clear-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .clear-btn:hover {
      color: var(--danger);
      border-color: var(--danger);
    }

    /* ---------- Body ---------- */
    .dialog-body {
      flex: 1;
      overflow-y: auto;
      min-height: 200px;
    }

    /* ---------- Movement List ---------- */
    .movement-list {
      display: flex;
      flex-direction: column;
    }

    .movement-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--border);
      transition: background var(--transition-fast);
    }

    .movement-row:last-child {
      border-bottom: none;
    }

    .movement-row:hover {
      background: var(--bg-subtle);
    }

    .movement-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .icon-purchase {
      background: rgba(22, 163, 74, 0.1);
      color: var(--success);
    }

    .icon-sale {
      background: rgba(217, 119, 6, 0.1);
      color: var(--warning);
    }

    .icon-adjustment {
      background: rgba(99, 102, 241, 0.1);
      color: var(--info, #6366f1);
    }

    .icon-waste {
      background: rgba(220, 38, 38, 0.1);
      color: var(--danger);
    }

    .icon-return {
      background: rgba(37, 99, 235, 0.1);
      color: #2563eb;
    }

    .movement-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }

    .movement-label {
      font-weight: 600;
      font-size: 0.8125rem;
    }

    .movement-meta {
      font-size: 0.6875rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lot-tag {
      display: inline-block;
      font-size: 0.5625rem;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
      font-weight: 500;
      margin-top: 2px;
    }

    .movement-detail {
      font-size: 0.6875rem;
      color: var(--text-secondary);
      font-style: italic;
      margin-top: 1px;
    }

    .movement-qty {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.875rem;
      flex-shrink: 0;
      text-align: right;
      min-width: 80px;
    }

    .movement-qty.incoming {
      color: var(--success);
    }

    .movement-qty.outgoing {
      color: var(--danger);
    }

    .qty-unit {
      font-size: 0.6875rem;
      font-weight: 500;
      color: var(--text-muted);
      margin-left: 2px;
    }

    .movement-cost {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 0.75rem;
      color: var(--text-secondary);
      flex-shrink: 0;
      text-align: right;
      min-width: 64px;
    }

    .movement-cost.muted {
      color: var(--text-muted);
      opacity: 0.5;
    }

    .movement-notes {
      color: var(--text-muted);
      opacity: 0.5;
      flex-shrink: 0;
    }

    /* ---------- Empty State ---------- */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 48px 24px;
      text-align: center;
    }

    .empty-state svg {
      color: var(--text-muted);
      opacity: 0.2;
    }

    .empty-title {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin: 4px 0 0;
    }

    .empty-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0;
    }

    /* ---------- Footer ---------- */
    .dialog-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 24px;
      border-top: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    .footer-summary {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .summary-item {
      font-family: var(--font-display);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .summary-item.incoming {
      color: var(--success);
      background: rgba(22, 163, 74, 0.08);
    }

    .summary-item.outgoing {
      color: var(--danger);
      background: rgba(220, 38, 38, 0.08);
    }

    .summary-item.net {
      color: var(--text-secondary);
      background: var(--bg-surface);
      border: 1px solid var(--border);
    }

    .summary-item.net.incoming {
      color: var(--success);
      background: rgba(22, 163, 74, 0.08);
      border-color: transparent;
    }

    .summary-item.net.outgoing {
      color: var(--danger);
      background: rgba(220, 38, 38, 0.08);
      border-color: transparent;
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 640px) {
      .dialog-header {
        padding: 16px;
      }

      .filter-bar {
        padding: 10px 16px;
        flex-direction: column;
        align-items: flex-start;
      }

      .movement-row {
        padding: 10px 16px;
        flex-wrap: wrap;
      }

      .movement-info {
        flex-basis: calc(100% - 42px);
      }

      .movement-qty {
        margin-left: 42px;
        min-width: auto;
      }

      .movement-cost {
        min-width: auto;
      }

      .dialog-footer {
        padding: 12px 16px;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }

      .footer-summary {
        justify-content: center;
      }
    }

    @media (pointer: coarse) {
      .type-chip {
        padding: 6px 14px;
        font-size: 0.75rem;
      }

      .dialog-close-btn {
        width: 44px;
        height: 44px;
      }
    }
  `]
})
export class StockMovementHistoryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  ingredient: Ingredient | null = null;
  movements: StockMovement[] = [];
  filteredMovements: StockMovement[] = [];
  lotMap: Map<string, { supplier: string; lotNumber: string }> = new Map();
  isLoading = false;
  selectedMovementType: MovementType | null = null;
  startDate: string = '';
  endDate: string = '';
  MovementType = MovementType;

  typeFilters: MovementTypeFilter[] = [
    { value: null, label: 'All', icon: '' },
    { value: MovementType.Purchase, label: 'Purchase', icon: '' },
    { value: MovementType.Sale, label: 'Sale', icon: '' },
    { value: MovementType.Adjustment, label: 'Adjustment', icon: '' },
    { value: MovementType.Waste, label: 'Waste', icon: '' },
    { value: MovementType.Return, label: 'Return', icon: '' }
  ];

  get isPiece(): boolean {
    const u = this.ingredient?.unit;
    return u === 'pcs' || u === 'piece' || u === 'pieces';
  }

  get totalIncoming(): number {
    return this.filteredMovements
      .filter(m => this.isIncoming(m.movementType) && m.quantity !== 0)
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  }

  get totalOutgoing(): number {
    return this.filteredMovements
      .filter(m => !this.isIncoming(m.movementType) && m.quantity !== 0)
      .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
  }

  get netChange(): number {
    return this.totalIncoming - this.totalOutgoing;
  }

  constructor(
    private dialogRef: MatDialogRef<StockMovementHistoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { ingredient: Ingredient },
    private stockMovementService: StockMovementService,
    private lotService: IngredientLotService,
    private toast: ToastService
  ) {
    this.ingredient = data.ingredient;
  }

  ngOnInit(): void {
    this.loadMovements();
    this.loadLots();
  }

  private loadLots(): void {
    if (!this.ingredient) return;
    this.lotService.getLots(this.ingredient.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (lots) => {
        this.lotMap.clear();
        for (const lot of lots) {
          this.lotMap.set(lot.id, { supplier: lot.supplier || 'Unknown', lotNumber: lot.lotNumber || '' });
        }
      }
    });
  }

  loadMovements(): void {
    if (!this.ingredient) return;

    this.isLoading = true;
    const start = this.startDate ? new Date(this.startDate) : undefined;
    const end = this.endDate ? new Date(this.endDate + 'T23:59:59') : undefined;

    this.stockMovementService.getAllMovements(this.ingredient.id, start, end).pipe(takeUntil(this.destroy$)).subscribe({
      next: (movements) => {
        this.movements = movements.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.applyTypeFilter();
        this.isLoading = false;
      },
      error: (error) => {
        this.toast.error('Failed to load stock movements');
        this.isLoading = false;
      }
    });
  }

  selectType(type: MovementType | null): void {
    this.selectedMovementType = type;
    this.applyTypeFilter();
  }

  applyFilters(): void {
    this.loadMovements();
  }

  clearDates(): void {
    this.startDate = '';
    this.endDate = '';
    this.loadMovements();
  }

  private applyTypeFilter(): void {
    if (this.selectedMovementType === null) {
      this.filteredMovements = this.movements;
    } else {
      this.filteredMovements = this.movements.filter(m => m.movementType === this.selectedMovementType);
    }
  }

  isIncoming(type: MovementType): boolean {
    return type === MovementType.Purchase || type === MovementType.Return || type === MovementType.Adjustment;
  }

  getTypeClass(type: MovementType): string {
    switch (type) {
      case MovementType.Purchase: return 'purchase';
      case MovementType.Sale: return 'sale';
      case MovementType.Adjustment: return 'adjustment';
      case MovementType.Waste: return 'waste';
      case MovementType.Return: return 'return';
      default: return 'adjustment';
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getMovementTypeLabel(movementType: MovementType): string {
    return MovementTypeLabels[movementType] || 'Unknown';
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
