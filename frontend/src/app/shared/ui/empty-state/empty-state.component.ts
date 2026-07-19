import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
      </div>
      <span *ngIf="eyebrow" class="empty-eyebrow">{{ eyebrow }}</span>
      <span *ngIf="title" class="empty-title">{{ title }}</span>
      <span *ngIf="message" class="empty-message">{{ message }}</span>
      <button
        *ngIf="actionLabel"
        type="button"
        class="btn btn-primary"
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
      gap: 10px;
      padding: var(--spacing-2xl);
      text-align: center;
    }

    .empty-icon {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      background: var(--bg-surface);
      border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
      border-radius: 50%;
      box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--accent) 40%, transparent);
      margin-bottom: 2px;
    }

    .empty-icon svg {
      width: 24px;
      height: 24px;
    }

    .empty-eyebrow {
      font-family: var(--font-display);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .empty-title {
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text-primary);
    }

    .empty-message {
      font-size: 13px;
      color: var(--text-secondary);
      max-width: 320px;
      line-height: 1.5;
    }

    .empty-state .btn {
      margin-top: 4px;
    }
  `]
})
export class EmptyStateComponent {
  /** Retained for backward-compatibility; the icon is now a consistent stroked SVG, never an emoji. */
  @Input() icon = '';
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel = '';

  @Output() action = new EventEmitter<void>();
}
