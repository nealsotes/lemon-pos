import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-cash-payment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <div class="cash-payment-dialog">
      <h2 mat-dialog-title>Cash Payment</h2>
      
      <mat-dialog-content>
        <div class="payment-info">
          <!-- Order Breakdown - Always visible -->
          <div class="breakdown-section" style="display: block !important; visibility: visible !important;">
            <div class="breakdown-row">
              <span class="label">Subtotal:</span>
              <span class="value">₱{{ getSubtotal() | number:'1.2-2' }}</span>
            </div>
            
            <div class="breakdown-row" *ngIf="getDiscount() > 0">
              <span class="label">Discount:</span>
              <span class="value discount">-₱{{ getDiscount() | number:'1.2-2' }}</span>
            </div>
            
            <div class="breakdown-row">
              <span class="label">VAT (12%):</span>
              <span class="value">₱{{ getTax() | number:'1.2-2' }}</span>
            </div>
            
            <div class="breakdown-row total-row">
              <span class="label">Total Amount:</span>
              <span class="amount">₱{{ getTotal() | number:'1.2-2' }}</span>
            </div>
          </div>
          
          <div class="amount-received">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Amount Received</mat-label>
              <input 
                matInput 
                type="number" 
                [(ngModel)]="amountReceived"
                (input)="calculateChange()"
                placeholder="Enter amount received"
                min="{{ data.total }}"
                step="0.01"
                autofocus
              >
              <span matPrefix>₱&nbsp;</span>
            </mat-form-field>
          </div>
          
          <div class="change-amount" *ngIf="change >= 0">
            <span class="label">Change:</span>
            <span class="amount change">₱{{ change | number:'1.2-2' }}</span>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-button (click)="cancel()">Cancel</button>
        <button 
          mat-raised-button 
          color="primary" 
          (click)="confirm()"
          [disabled]="amountReceived < data.total"
        >
          Confirm Payment
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .cash-payment-dialog {
      padding: 20px;
      min-width: 400px;
    }
    
    .payment-info {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .breakdown-section {
      display: flex !important;
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
    }
    
    .breakdown-row .value {
      font-weight: 500;
      color: #495057;
    }
    
    .breakdown-row .value.discount {
      color: #dc3545;
    }
    
    .total-amount, .change-amount {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
    }
    
    .label {
      font-weight: 500;
      color: #495057;
    }
    
    .amount {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0d6efd;
    }
    
    .change {
      color: #198754;
    }
    
    .full-width {
      width: 100%;
    }
    
    .amount-received {
      margin: 10px 0;
    }
  `]
})
export class CashPaymentDialogComponent {
  amountReceived: number = 0;
  change: number = 0;

  constructor(
    public dialogRef: MatDialogRef<CashPaymentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { 
      total: number;
      subtotal?: number;
      discount?: number;
      tax?: number;
    }
  ) {
    // Ensure all values have defaults
    this.data.subtotal = this.data.subtotal ?? 0;
    this.data.discount = this.data.discount ?? 0;
    this.data.tax = this.data.tax ?? 0;
    this.data.total = this.data.total ?? 0;
    
    this.amountReceived = this.data.total;
    this.calculateChange();
  }

  calculateChange(): void {
    this.change = this.amountReceived - this.data.total;
  }

  confirm(): void {
    if (this.amountReceived >= this.data.total) {
      this.dialogRef.close({
        amountReceived: this.amountReceived,
        change: this.change
      });
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  // Helper methods to ensure values are always available
  getSubtotal(): number {
    return this.data.subtotal ?? 0;
  }

  getDiscount(): number {
    return this.data.discount ?? 0;
  }

  getTax(): number {
    return this.data.tax ?? 0;
  }

  getTotal(): number {
    return this.data.total ?? 0;
  }
} 



