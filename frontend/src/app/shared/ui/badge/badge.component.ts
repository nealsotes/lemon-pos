import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="ui-badge" [ngClass]="'badge-' + variant">
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    .ui-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }

    .badge-success {
      background-color: rgba(22, 163, 74, 0.1);
      color: var(--success);
    }

    .badge-warning {
      background-color: rgba(217, 119, 6, 0.1);
      color: var(--warning);
    }

    .badge-danger {
      background-color: rgba(220, 38, 38, 0.1);
      color: var(--danger);
    }

    .badge-neutral {
      background-color: var(--bg-subtle);
      color: var(--text-secondary);
    }

    .badge-info {
      background-color: rgba(99, 102, 241, 0.1);
      color: var(--info);
    }
  `]
})
export class BadgeComponent {
  @Input() variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
}
