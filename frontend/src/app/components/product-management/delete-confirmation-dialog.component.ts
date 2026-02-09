import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface DeleteConfirmationData {
  productName: string;
  productId: string;
}

export interface DeleteConfirmationResult {
  confirmed: boolean;
  loading?: boolean;
}

@Component({
  selector: 'app-delete-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="delete-dialog">
      <div class="dialog-header">
        <div class="icon-wrapper">
          <mat-icon class="warning-icon">warning_amber</mat-icon>
        </div>
        <h2 mat-dialog-title>Confirm Deletion</h2>
      </div>
      
      <div mat-dialog-content class="dialog-content">
        <p class="message">Are you sure you want to delete this product?</p>
        <div class="product-name-box">
          <span class="product-name">{{ data.productName }}</span>
        </div>
        <p class="warning-text">
          <mat-icon class="info-icon">info</mat-icon>
          This action cannot be undone. All associated data will be permanently removed.
        </p>
      </div>
      
      <div mat-dialog-actions class="dialog-actions">
        <button mat-stroked-button mat-dialog-close [disabled]="isDeleting" class="cancel-btn">
          Cancel
        </button>
        <button mat-raised-button color="warn" (click)="confirmDelete()" [disabled]="isDeleting" class="delete-btn">
          <mat-spinner *ngIf="isDeleting" diameter="18" class="spinner"></mat-spinner>
          <span *ngIf="!isDeleting">Delete</span>
          <span *ngIf="isDeleting">Deleting...</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .delete-dialog {
      min-width: 400px;
      max-width: 480px;
      padding: 24px;
    }
    
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #fef2f2;
      flex-shrink: 0;
    }
    
    .warning-icon {
      color: #dc2626;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }
    
    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      letter-spacing: -0.02em;
    }
    
    .dialog-content {
      margin: 0 0 32px 0;
      padding: 0;
    }
    
    .message {
      margin: 0 0 16px 0;
      color: #374151;
      font-size: 15px;
      line-height: 1.6;
      font-weight: 400;
    }
    
    .product-name-box {
      margin: 0 0 20px 0;
      padding: 12px 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      border-left: 3px solid #3b82f6;
    }
    
    .product-name {
      color: #111827;
      font-size: 16px;
      font-weight: 600;
      display: block;
    }
    
    .warning-text {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      color: #991b1b;
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
    }
    
    .info-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #dc2626;
      flex-shrink: 0;
      margin-top: 1px;
    }
    
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin: 0;
      padding: 0;
    }
    
    .cancel-btn {
      color: #6b7280;
      min-width: 100px;
      border-color: #d1d5db;
      font-weight: 500;
    }
    
    .cancel-btn:hover:not(:disabled) {
      background: #f9fafb;
      border-color: #9ca3af;
      color: #374151;
    }
    
    .delete-btn {
      min-width: 110px;
      background: #dc2626;
      color: white;
      font-weight: 500;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }
    
    .delete-btn:hover:not(:disabled) {
      background: #b91c1c;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    
    .delete-btn:disabled {
      background: #d1d5db;
      color: #9ca3af;
      cursor: not-allowed;
      box-shadow: none;
    }
    
    .spinner {
      display: inline-block;
      margin-right: 8px;
      vertical-align: middle;
    }
    
    /* Responsive */
    @media (max-width: 480px) {
      .delete-dialog {
        min-width: 100%;
        margin: 16px;
      }
      
      .dialog-header {
        gap: 12px;
      }
      
      .icon-wrapper {
        width: 40px;
        height: 40px;
      }
      
      .warning-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
      
      h2 {
        font-size: 18px;
      }
      
      .dialog-actions {
        flex-direction: column-reverse;
      }
      
      .cancel-btn,
      .delete-btn {
        width: 100%;
      }
    }
  `]
})
export class DeleteConfirmationDialogComponent {
  isDeleting = false;

  constructor(
    public dialogRef: MatDialogRef<DeleteConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeleteConfirmationData
  ) {}

  confirmDelete(): void {
    this.isDeleting = true;
    this.dialogRef.close(true);
  }
}

