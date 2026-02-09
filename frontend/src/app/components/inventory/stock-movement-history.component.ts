import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule } from '@angular/forms';
import { StockMovementService } from '../../services/stock-movement.service';
import { StockMovement, MovementType, MovementTypeLabels } from '../../models/stock-movement.model';
import { Ingredient } from '../../models/ingredient.model';

@Component({
  selector: 'app-stock-movement-history',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule
  ],
  template: `
    <div class="movement-history-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>Stock Movement History</h2>
        <button mat-icon-button (click)="close()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div mat-dialog-content class="dialog-content">
        <div class="ingredient-info" *ngIf="ingredient">
          <h3>{{ ingredient.name }}</h3>
          <p>Current Quantity: {{ ingredient.quantity }} {{ ingredient.unit }}</p>
        </div>

        <div class="filters-section">
          <mat-form-field appearance="outline">
            <mat-label>Movement Type</mat-label>
            <mat-select [(ngModel)]="selectedMovementType" (selectionChange)="loadMovements()">
              <mat-option [value]="null">All Types</mat-option>
              <mat-option [value]="MovementType.Purchase">Purchase</mat-option>
              <mat-option [value]="MovementType.Sale">Sale</mat-option>
              <mat-option [value]="MovementType.Adjustment">Adjustment</mat-option>
              <mat-option [value]="MovementType.Waste">Waste</mat-option>
              <mat-option [value]="MovementType.Return">Return</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Start Date</mat-label>
            <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate" (dateChange)="loadMovements()">
            <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>End Date</mat-label>
            <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate" (dateChange)="loadMovements()">
            <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
            <mat-datepicker #endPicker></mat-datepicker>
          </mat-form-field>
        </div>

        <div class="table-container" *ngIf="!isLoading">
          <table mat-table [dataSource]="movements" class="movements-table">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let movement">{{ formatDate(movement.createdAt) }}</td>
            </ng-container>

            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let movement">
                <span class="movement-type" [class]="'type-' + movement.movementType">
                  {{ getMovementTypeLabel(movement.movementType) }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="quantity">
              <th mat-header-cell *matHeaderCellDef>Quantity</th>
              <td mat-cell *matCellDef="let movement">
                <span [class.negative]="movement.movementType === MovementType.Sale || movement.movementType === MovementType.Waste">
                  {{ movement.movementType === MovementType.Sale || movement.movementType === MovementType.Waste ? '-' : '+' }}{{ movement.quantity }}
                </span>
              </td>
            </ng-container>

            <ng-container matColumnDef="unitCost">
              <th mat-header-cell *matHeaderCellDef>Unit Cost</th>
              <td mat-cell *matCellDef="let movement">
                {{ movement.unitCost ? ('₱' + (movement.unitCost | number:'1.2-2')) : '-' }}
              </td>
            </ng-container>

            <ng-container matColumnDef="reason">
              <th mat-header-cell *matHeaderCellDef>Reason</th>
              <td mat-cell *matCellDef="let movement">{{ movement.reason || '-' }}</td>
            </ng-container>

            <ng-container matColumnDef="notes">
              <th mat-header-cell *matHeaderCellDef>Notes</th>
              <td mat-cell *matCellDef="let movement">{{ movement.notes || '-' }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>

          <div class="empty-state" *ngIf="movements.length === 0">
            <p>No stock movements found</p>
          </div>
        </div>

        <div class="loading" *ngIf="isLoading">
          <p>Loading movements...</p>
        </div>
      </div>

      <div mat-dialog-actions class="dialog-actions">
        <button mat-button (click)="close()">Close</button>
      </div>
    </div>
  `,
  styles: [`
    .movement-history-dialog {
      min-width: 800px;
      max-width: 1200px;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    .dialog-header h2 {
      margin: 0;
    }

    .close-btn {
      color: #666;
    }

    .dialog-content {
      padding: 24px;
      max-height: 600px;
      overflow-y: auto;
    }

    .ingredient-info {
      margin-bottom: 20px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .ingredient-info h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
    }

    .ingredient-info p {
      margin: 0;
      color: #666;
    }

    .filters-section {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .filters-section mat-form-field {
      flex: 1;
      min-width: 150px;
    }

    .table-container {
      margin-top: 20px;
    }

    .movements-table {
      width: 100%;
    }

    .movement-type {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .type-0 { background: #e3f2fd; color: #1976d2; }
    .type-1 { background: var(--surface-color)3e0; color: #f57c00; }
    .type-2 { background: #f3e5f5; color: #7b1fa2; }
    .type-3 { background: #ffebee; color: #c62828; }
    .type-4 { background: #e8f5e9; color: #2e7d32; }

    .negative {
      color: #c62828;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      justify-content: flex-end;
    }
  `]
})
export class StockMovementHistoryComponent implements OnInit {
  ingredient: Ingredient | null = null;
  movements: StockMovement[] = [];
  displayedColumns: string[] = ['date', 'type', 'quantity', 'unitCost', 'reason', 'notes'];
  isLoading = false;
  selectedMovementType: MovementType | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  MovementType = MovementType;
  MovementTypeLabels = MovementTypeLabels;

  constructor(
    private dialogRef: MatDialogRef<StockMovementHistoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { ingredient: Ingredient },
    private stockMovementService: StockMovementService
  ) {
    this.ingredient = data.ingredient;
  }

  ngOnInit(): void {
    this.loadMovements();
  }

  loadMovements(): void {
    if (!this.ingredient) return;

    this.isLoading = true;
    const start = this.startDate ? new Date(this.startDate) : undefined;
    const end = this.endDate ? new Date(this.endDate) : undefined;

    this.stockMovementService.getMovementsByIngredient(this.ingredient.id).subscribe({
      next: (movements) => {
        let filtered = movements;

        if (this.selectedMovementType !== null) {
          filtered = filtered.filter(m => m.movementType === this.selectedMovementType);
        }

        if (start) {
          filtered = filtered.filter(m => new Date(m.createdAt) >= start);
        }

        if (end) {
          filtered = filtered.filter(m => new Date(m.createdAt) <= end);
        }

        this.movements = filtered;
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
      }
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getMovementTypeLabel(movementType: number): string {
    return MovementTypeLabels[movementType as MovementType] || 'Unknown';
  }

  close(): void {
    this.dialogRef.close();
  }
}





