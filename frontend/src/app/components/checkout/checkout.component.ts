import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CartService } from '../../services/cart.service';
import { TransactionService } from '../../services/transaction.service';
import { CartItem } from '../../models/cart-item.model';
import { ReceiptComponent } from '../receipt/receipt.component';
import { CashPaymentDialogComponent } from './cash-payment-dialog.component';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  cartItems: CartItem[] = [];
  customerInfo = {
    name: '',
    email: '',
    phone: '',
    discountType: 'none' as 'senior' | 'pwd' | 'none'
  };
  paymentMethod = 'cash';
  notes = '';
  subtotal = 0;
  tax = 0;
  total = 0;
  discount = 0;
  amountReceived = 0;
  
  // Quick amount buttons for cash payment
  quickAmounts = [100, 200, 500, 1000, 1500, 2000];

  constructor(
    private cartService: CartService,
    private transactionService: TransactionService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.cartService.getCartItems().subscribe(items => {
      this.cartItems = items;
      this.calculateTotals();
    });
  }

  private calculateTotals(): void {
    // Calculate subtotal (sum of item prices before discount)
    this.subtotal = this.cartItems.reduce((sum: number, item) => {
      return sum + (item.price * item.quantity);
    }, 0);
    
    // Calculate total discount
    this.discount = this.cartItems.reduce((sum: number, item) => {
      return sum + (item.discount?.amount || 0);
    }, 0);
    
    // Subtotal after discount
    const subtotalAfterDiscount = this.subtotal - this.discount;
    
    // Calculate VAT (12% of subtotal after discount, since prices are stored without VAT)
    const vatRate = 0.12;
    this.tax = subtotalAfterDiscount * vatRate;
    
    // Total is subtotal after discount plus VAT
    this.total = subtotalAfterDiscount + this.tax;
  }

  getDiscountTotal(): number {
    return this.discount;
  }

  onAmountReceivedChange(): void {
    // Calculate change when amount received changes
  }

  setQuickAmount(amount: number): void {
    this.amountReceived = amount;
  }

  getChange(): number {
    if (this.amountReceived > 0 && this.total > 0) {
      return Math.max(0, this.amountReceived - this.total);
    }
    return 0;
  }

  processTransaction(): void {
    if (!this.paymentMethod) {
      this.snackBar.open('Please select a payment method', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    if (this.cartItems.length === 0) {
      this.snackBar.open('Cart is empty', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Handle cash payment with amount received
    if (this.paymentMethod === 'cash') {
      // Validate amount received
      if (!this.amountReceived || this.amountReceived < this.total) {
        this.snackBar.open(`Amount received must be at least ₱${this.total.toFixed(2)}`, 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        return;
      }
      const change = this.getChange();
      this.processPayment(this.amountReceived, change);
    } else {
      this.processPayment();
    }
  }

  private handleCashPayment(): void {
    // Ensure totals are calculated
    this.calculateTotals();
    
    const dialogRef = this.dialog.open(CashPaymentDialogComponent, {
      width: '450px',
      data: { 
        total: this.total,
        subtotal: this.subtotal,
        discount: this.discount,
        tax: this.tax
      },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.processPayment(result.amountReceived, result.change);
      }
    });
  }

  private processPayment(amountReceived: number = 0, change: number = 0): void {
    // Default service type and fee if not set
    const serviceType: 'dineIn' | 'takeOut' = 'dineIn';
    const serviceFee = 0;
    
    this.transactionService.createTransaction(
      this.cartItems,
      this.paymentMethod,
      this.customerInfo,
      serviceType,
      serviceFee
    ).subscribe({
      next: (result) => {
        this.cartService.clearCart();
        
        // Show receipt dialog
        this.showReceipt(result, amountReceived, change);
      },
      error: (error) => {
        // Extract error message from various possible locations
        let errorMessage = 'Transaction failed. Please try again.';
        if (error?.error) {
          if (typeof error.error === 'string') {
            errorMessage = error.error;
          } else if (error.error.message) {
            errorMessage = error.error.message;
          } else if (error.error.errors && Array.isArray(error.error.errors)) {
            errorMessage = error.error.errors.join(', ');
          }
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        this.snackBar.open(errorMessage, 'Close', {
          duration: 7000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  private showReceipt(transaction: any, amountReceived: number = 0, change: number = 0): void {
    const dialogRef = this.dialog.open(ReceiptComponent, {
      width: '500px',
      data: {
        transaction: transaction,
        amountReceived: amountReceived,
        change: change
      },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(() => {
      // Navigate back to POS after receipt is closed
      window.history.back();
    });
  }
}
