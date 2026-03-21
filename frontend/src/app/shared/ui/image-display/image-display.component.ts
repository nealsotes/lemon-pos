import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="image-display" [style.width.px]="size" [style.height.px]="size">
      <img
        *ngIf="isImageUrl(src) && !hasError"
        [src]="src"
        [alt]="alt"
        (error)="onImageError()"
        class="image" />
      <span
        *ngIf="!isImageUrl(src) || hasError"
        class="fallback"
        [style.font-size.px]="size * 0.5">
        {{ fallbackEmoji }}
      </span>
    </div>
  `,
  styles: [`
    .image-display {
      position: relative;
      border-radius: var(--radius-sm);
      overflow: hidden;
      flex-shrink: 0;
    }

    .image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--accent-subtle);
      border-radius: var(--radius-sm);
      line-height: 1;
    }
  `]
})
export class ImageDisplayComponent {
  @Input() src = '';
  @Input() alt = '';
  @Input() size = 40;
  @Input() fallbackEmoji = '\uD83D\uDCE6';

  hasError = false;

  isImageUrl(value: string): boolean {
    if (!value) return false;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return true;
    }
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const lower = value.toLowerCase();
    return imageExtensions.some(ext => lower.includes(ext));
  }

  onImageError(): void {
    this.hasError = true;
  }
}
