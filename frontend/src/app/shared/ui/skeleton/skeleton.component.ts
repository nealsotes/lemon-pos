import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Primitive shimmer block used to compose all skeleton states.
 * Matches the app's neutral surfaces — never introduces color.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="skeleton"
      [class.skeleton--circle]="shape === 'circle'"
      [style.width]="width"
      [style.height]="height"
      [style.border-radius]="radius">
    </div>
  `,
  styles: [`
    .skeleton {
      display: block;
      background: linear-gradient(
        100deg,
        var(--bg-subtle) 40%,
        #ECECEC 50%,
        var(--bg-subtle) 60%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }

    .skeleton--circle {
      flex: none;
    }

    @keyframes shimmer {
      to { background-position: -200% 0; }
    }
  `]
})
export class SkeletonComponent {
  @Input() width = '100%';
  @Input() height = '12px';
  /** 'rect' | 'circle' */
  @Input() shape: 'rect' | 'circle' = 'rect';
  @Input() radius = 'var(--radius-sm)';
}