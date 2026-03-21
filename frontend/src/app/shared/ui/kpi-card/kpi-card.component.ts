import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-card">
      <span class="kpi-label">{{ label }}</span>
      <span class="kpi-value">{{ value }}</span>
      <span
        *ngIf="trend"
        class="kpi-trend"
        [ngClass]="{
          'trend-up': trendDirection === 'up',
          'trend-down': trendDirection === 'down',
          'trend-neutral': trendDirection === 'neutral'
        }">
        {{ trend }}
      </span>
    </div>
  `,
  styles: [`
    .kpi-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background-color: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
    }

    .kpi-label {
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .kpi-value {
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.2;
    }

    .kpi-trend {
      font-size: 12px;
      font-weight: 500;
    }

    .trend-up {
      color: var(--success);
    }

    .trend-down {
      color: var(--danger);
    }

    .trend-neutral {
      color: var(--text-muted);
    }
  `]
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() trend = '';
  @Input() trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
}
