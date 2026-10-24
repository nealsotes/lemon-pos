import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from './skeleton.component';

/**
 * Skeleton placeholder for `app-kpi-strip` — same auto-fit grid and card
 * silhouette (label line + big value line) as `app-kpi-card`.
 */
@Component({
  selector: 'app-skeleton-kpis',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <div class="kpi-strip">
      <div class="skeleton-kpi" *ngFor="let k of kpis">
        <app-skeleton width="40%" height="9px" radius="var(--radius-sm)"></app-skeleton>
        <app-skeleton width="60%" height="18px" radius="var(--radius-sm)"></app-skeleton>
      </div>
    </div>
  `,
  styles: [`
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .skeleton-kpi {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
    }
  `]
})
export class SkeletonKpisComponent implements OnChanges {
  @Input() count = 4;

  kpis: number[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['count']) {
      this.kpis = Array.from({ length: Math.max(this.count, 1) }, (_, i) => i);
    }
  }
}