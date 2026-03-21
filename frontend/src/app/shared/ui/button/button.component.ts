import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [class]="classes">
      <span class="spinner" *ngIf="loading"></span>
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
      transition: background-color var(--transition-fast), border-color var(--transition-fast);
      white-space: nowrap;
    }

    button:active:not(:disabled) {
      opacity: 0.9;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Sizes */
    .btn-sm {
      height: 28px;
      padding: 4px 12px;
      font-size: 12px;
    }

    .btn-md {
      height: 32px;
      padding: 6px 16px;
      font-size: 13px;
    }

    .btn-lg {
      height: 36px;
      padding: 8px 20px;
      font-size: 14px;
    }

    /* Variants */
    .btn-primary {
      background-color: var(--accent);
      color: var(--text-inverse);
      border-color: var(--accent);
    }

    .btn-primary:hover:not(:disabled) {
      background-color: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .btn-secondary {
      background-color: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: var(--bg-subtle);
      border-color: var(--border-strong);
    }

    .btn-ghost {
      background: transparent;
      color: var(--text-secondary);
      border: none;
    }

    .btn-ghost:hover:not(:disabled) {
      background-color: var(--bg-subtle);
      color: var(--text-primary);
    }

    .btn-danger {
      background-color: var(--danger);
      color: var(--text-inverse);
      border-color: var(--danger);
    }

    .btn-danger:hover:not(:disabled) {
      background-color: #B91C1C;
      border-color: #B91C1C;
    }

    /* Spinner */
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() type: 'button' | 'submit' = 'button';

  get classes(): string {
    return `btn-${this.variant} btn-${this.size}`;
  }
}
