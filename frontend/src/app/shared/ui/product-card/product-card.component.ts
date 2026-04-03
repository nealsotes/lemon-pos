import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageDisplayComponent } from '../image-display/image-display.component';
import { BadgeComponent } from '../badge/badge.component';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, ImageDisplayComponent, BadgeComponent],
  template: `
    <div class="product-card" [class.out-of-stock]="!inStock">
      <app-image-display
        [src]="image"
        [alt]="name"
        [size]="60">
      </app-image-display>
      <div class="product-info">
        <span class="product-name">{{ name }}</span>
        <span class="product-price">{{ currencySymbol }}{{ price | number:'1.2-2' }}</span>
        <div class="product-meta">
          <app-badge *ngIf="!inStock" variant="danger">Out of stock</app-badge>
          <app-badge *ngIf="inStock && lowStock" variant="warning">Low stock</app-badge>
          <app-badge *ngIf="category && inStock && !lowStock" variant="neutral">{{ category }}</app-badge>
        </div>
      </div>
      <button
        type="button"
        class="add-btn"
        [disabled]="!inStock"
        (click)="onAddToCart($event)"
        aria-label="Add to cart">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
  `,
  styles: [`
    .product-card {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      background-color: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      position: relative;
      transition: background-color var(--transition-fast);
      max-height: 120px;
    }

    .product-card:hover {
      background-color: var(--bg-subtle);
    }

    .product-card.out-of-stock {
      opacity: 0.5;
    }

    .product-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
      padding-right: 28px;
    }

    .product-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.3;
    }

    .product-price {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent);
    }

    .product-meta {
      display: flex;
      gap: 4px;
      margin-top: 2px;
    }

    .add-btn {
      position: absolute;
      top: var(--spacing-sm);
      right: var(--spacing-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background-color: var(--accent);
      color: var(--text-inverse);
      cursor: pointer;
      transition: background-color var(--transition-fast);
      flex-shrink: 0;
    }

    .add-btn:hover:not(:disabled) {
      background-color: var(--accent-hover);
    }

    .add-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  `]
})
export class ProductCardComponent {
  @Input() name = '';
  @Input() price = 0;
  @Input() image = '';
  @Input() category = '';
  @Input() inStock = true;
  @Input() lowStock = false;
  @Input() currencySymbol = '\u20B1';

  @Output() addToCart = new EventEmitter<void>();

  onAddToCart(event: Event): void {
    event.stopPropagation();
    this.addToCart.emit();
  }
}
