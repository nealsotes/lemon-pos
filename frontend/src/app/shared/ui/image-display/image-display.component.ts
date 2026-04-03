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
      <div
        *ngIf="!isImageUrl(src) || hasError"
        class="fallback">
        <svg [attr.width]="size * 0.4" [attr.height]="size * 0.4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      </div>
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
      background-color: var(--bg-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
    }
  `]
})
export class ImageDisplayComponent {
  @Input() src = '';
  @Input() alt = '';
  @Input() size = 40;

  hasError = false;

  isImageUrl(value: string): boolean {
    if (!value) return false;
    if (value.startsWith('data:image/') || value.startsWith('http') || value.startsWith('/uploads/') || value.startsWith('uploads/') || value.startsWith('/')) {
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
