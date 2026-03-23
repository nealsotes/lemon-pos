import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stock-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stock-indicator">
      <span class="stock-num" [class]="'stock-' + status">{{ stock }}</span>
      <div class="stock-bar">
        <div class="stock-bar-fill" [class]="status" [style.width.%]="percentage"></div>
      </div>
    </div>
  `,
  styles: [`
    .stock-indicator {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 80px;
    }

    .stock-num {
      font-weight: 600;
      font-size: 0.75rem;
    }

    .stock-num.stock-low {
      color: var(--error, var(--danger));
    }

    .stock-num.stock-medium {
      color: var(--warning);
    }

    .stock-num.stock-high {
      color: var(--text-primary);
    }

    .stock-bar {
      width: 100%;
      height: 3px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }

    .stock-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 200ms ease-out;
    }

    .stock-bar-fill.high {
      background: var(--success);
    }

    .stock-bar-fill.medium {
      background: var(--warning);
    }

    .stock-bar-fill.low {
      background: var(--error, var(--danger));
    }
  `]
})
export class StockIndicatorComponent {
  @Input() stock = 0;
  @Input() threshold = 10;
  @Input() maxStock = 100;

  get percentage(): number {
    return Math.min((this.stock / this.maxStock) * 100, 100);
  }

  get status(): 'high' | 'medium' | 'low' {
    if (this.stock === 0) return 'low';
    if (this.stock <= this.threshold) return 'medium';
    return 'high';
  }
}
