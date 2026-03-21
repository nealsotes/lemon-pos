import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmDialogService, ConfirmDialogState } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-backdrop" *ngIf="state.active" (click)="onCancel()">
      <div class="dialog-card" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h3 class="dialog-title">{{ state.title }}</h3>
        </div>
        <div class="dialog-body">
          <p class="dialog-message">{{ state.message }}</p>
        </div>
        <div class="dialog-footer">
          <button
            type="button"
            class="btn-cancel"
            (click)="onCancel()">
            {{ state.cancelLabel }}
          </button>
          <button
            type="button"
            class="btn-confirm"
            [ngClass]="'btn-confirm-' + state.variant"
            (click)="onConfirm()">
            {{ state.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      animation: fadeIn 0.15s ease-out;
    }

    .dialog-card {
      background-color: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 400px;
      margin: var(--spacing-md);
      animation: scaleIn 0.15s ease-out;
    }

    .dialog-header {
      padding: var(--spacing-md) var(--spacing-md) 0;
    }

    .dialog-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0;
    }

    .dialog-body {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .dialog-message {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 0;
      line-height: 1.5;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
    }

    .btn-cancel,
    .btn-confirm {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      padding: 6px 16px;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color var(--transition-fast), border-color var(--transition-fast);
    }

    .btn-cancel {
      background-color: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-cancel:hover {
      background-color: var(--bg-subtle);
      border-color: var(--border-strong);
    }

    .btn-confirm-primary {
      background-color: var(--accent);
      color: var(--text-inverse);
      border: 1px solid var(--accent);
    }

    .btn-confirm-primary:hover {
      background-color: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .btn-confirm-danger {
      background-color: var(--danger);
      color: var(--text-inverse);
      border: 1px solid var(--danger);
    }

    .btn-confirm-danger:hover {
      background-color: #B91C1C;
      border-color: #B91C1C;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `]
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  state: ConfirmDialogState = {
    active: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'primary',
    resolve: null
  };

  private destroy$ = new Subject<void>();

  constructor(private confirmService: ConfirmDialogService) {}

  ngOnInit(): void {
    this.confirmService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => this.state = state);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onConfirm(): void {
    this.confirmService.close(true);
  }

  onCancel(): void {
    this.confirmService.close(false);
  }
}
