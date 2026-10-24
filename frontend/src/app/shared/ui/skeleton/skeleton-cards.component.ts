import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from './skeleton.component';

/**
 * Skeleton placeholder for card grids (product grids, recipe selector).
 * Boxes mirror the card silhouette: media block + title + detail lines.
 */
@Component({
  selector: 'app-skeleton-cards',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <div class="skeleton-card-grid">
      <div class="skeleton-card" *ngFor="let c of cards">
        <app-skeleton height="96px" radius="var(--radius-lg)"></app-skeleton>
        <div class="lines">
          <app-skeleton width="80%" height="12px" radius="var(--radius-sm)"></app-skeleton>
          <app-skeleton width="40%" height="12px" radius="var(--radius-sm)"></app-skeleton>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .skeleton-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--spacing-md);
    }

    .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .lines {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `]
})
export class SkeletonCardsComponent implements OnChanges {
  @Input() count = 8;

  cards: number[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['count']) {
      this.cards = Array.from({ length: Math.max(this.count, 1) }, (_, i) => i);
    }
  }
}