import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Product } from '../../models/product.model';

@Component({
    selector: 'app-product-card',
    standalone: true,
    imports: [CommonModule, DecimalPipe],
    templateUrl: './product-card.component.html',
    styleUrls: ['./product-card.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
    @Input() product!: Product;
    @Output() addToCart = new EventEmitter<Product>();

    onAddToCart(): void {
        if (this.product.stock > 0) {
            this.addToCart.emit(this.product);
        }
    }

    isLowStock(): boolean {
        const threshold = this.product.lowQuantityThreshold ?? 10;
        return this.product.stock > 0 && this.product.stock <= threshold;
    }

    isOutOfStock(): boolean {
        return this.product.stock === 0;
    }

    isImageUrl(image: string | undefined): boolean {
        if (!image) return false;
        return image.startsWith('data:image/') ||
            image.startsWith('http') ||
            image.startsWith('/uploads/') ||
            image.startsWith('/');
    }

    onImageError(event: any): void {
        const img = event.target;
        img.style.display = 'none';
        const placeholder = img.parentElement?.querySelector('.image-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
        }
    }
}
