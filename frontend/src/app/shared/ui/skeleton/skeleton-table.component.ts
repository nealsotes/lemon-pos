import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from './skeleton.component';

/** Deterministic per-cell line widths so skeletons look like real rows, not bars. */
const WIDTH_PATTERN = [64, 82, 46, 74, 58, 88, 38, 70, 54, 78];

/**
 * Skeleton placeholder for `app-data-table` — same wrapper, header band
 * and row rhythm so the swap from skeleton to data reads as one surface.
 */
@Component({
  selector: 'app-skeleton-table',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <div class="table-wrapper">
      <div class="head-row">
        <div class="head-cell" *ngFor="let c of colsArr">
          <app-skeleton width="46%" height="10px" radius="var(--radius-sm)"></app-skeleton>
        </div>
      </div>
      <div
        class="body-row"
        *ngFor="let r of rowsArr; let rIdx = index"
        [class.zebra]="rIdx % 2 === 1">
        <div
          class="body-cell"
          *ngFor="let c of colsArr; let cIdx = index">
          <app-skeleton
            [width]="widthFor(rIdx, cIdx)"
            height="12px"
            radius="var(--radius-sm)">
          </app-skeleton>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .table-wrapper {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--bg-surface);
    }

    .head-row {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: var(--spacing-md);
      padding: 12px 16px;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
    }

    .body-row {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: var(--spacing-md);
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }

    .body-row:last-child {
      border-bottom: none;
    }

    .body-cell {
      display: flex;
      align-items: center;
      min-height: 18px;
    }
  `]
})
export class SkeletonTableComponent {
  @Input() rows = 8;
  @Input() cols = 5;

  get rowsArr(): number[] { return Array.from({ length: this.rows }, (_, i) => i); }
  get colsArr(): number[] { return Array.from({ length: this.cols }, (_, i) => i); }

  widthFor(rowIdx: number, colIdx: number): string {
    const pct =
      WIDTH_PATTERN[(rowIdx * 3 + colIdx * 2) % WIDTH_PATTERN.length] + colIdx * 6;
    return Math.min(pct, 92) + '%';
  }
}