import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastService, Toast } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of toasts"
        class="toast"
        [class.toast-visible]="toast.visible"
        [class.toast-hidden]="!toast.visible"
        [ngClass]="'toast-' + toast.type">
        <div class="toast-bar"></div>
        <span class="toast-message">{{ toast.message }}</span>
        <button
          type="button"
          class="toast-close"
          (click)="dismiss(toast.id)"
          aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: var(--spacing-md);
      right: var(--spacing-md);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      max-width: 360px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      background-color: var(--bg-surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      padding: 12px 16px;
      overflow: hidden;
      position: relative;
      transform: translateX(100%);
      opacity: 0;
      transition: transform var(--transition-normal), opacity var(--transition-normal);
    }

    .toast-visible {
      transform: translateX(0);
      opacity: 1;
    }

    .toast-hidden {
      transform: translateX(100%);
      opacity: 0;
    }

    .toast-bar {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
    }

    .toast-success .toast-bar {
      background-color: var(--success);
    }

    .toast-error .toast-bar {
      background-color: var(--danger);
    }

    .toast-info .toast-bar {
      background-color: var(--info);
    }

    .toast-message {
      flex: 1;
      font-size: 13px;
      color: var(--text-primary);
      padding-left: 4px;
    }

    .toast-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .toast-close:hover {
      background-color: var(--bg-subtle);
      color: var(--text-primary);
    }
  `]
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private destroy$ = new Subject<void>();

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.toastService.toasts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(toasts => this.toasts = toasts);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
