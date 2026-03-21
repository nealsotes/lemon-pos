import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state">
      <span class="empty-icon">{{ icon }}</span>
      <span *ngIf="title" class="empty-title">{{ title }}</span>
      <span *ngIf="message" class="empty-message">{{ message }}</span>
      <button
        *ngIf="actionLabel"
        type="button"
        class="empty-action"
        (click)="action.emit()">
        {{ actionLabel }}
      </button>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: var(--spacing-2xl);
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      line-height: 1;
    }

    .empty-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .empty-message {
      font-size: 13px;
      color: var(--text-secondary);
      max-width: 320px;
    }

    .empty-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      padding: 6px 16px;
      border: none;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      background: transparent;
      color: var(--accent);
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    .empty-action:hover {
      background-color: var(--accent-subtle);
    }
  `]
})
export class EmptyStateComponent {
  @Input() icon = '\uD83D\uDCE6';
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel = '';

  @Output() action = new EventEmitter<void>();
}
