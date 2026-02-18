import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../services/cart.service';
import { CartItem } from '../../models/cart-item.model';
import { OpenOrder } from '../../models/open-order.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'app-pos-cart-sidebar',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './pos-cart-sidebar.component.html',
    styleUrls: ['./pos-cart-sidebar.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class POSCartSidebarComponent implements OnInit, OnDestroy {
    @Input() isOpen = false;
    @Output() close = new EventEmitter<void>();
    @Output() checkout = new EventEmitter<void>();

    cartItems: CartItem[] = [];
    openOrders: OpenOrder[] = [];
    openOrderName = '';
    isOpenOrderActive = false;
    total = 0;
    private destroy$ = new Subject<void>();

    constructor(
        private cartService: CartService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.cartService.getCartItems().pipe(
            takeUntil(this.destroy$)
        ).subscribe(items => {
            this.cartItems = items;
            this.total = this.cartService.getCartTotal();
            this.isOpenOrderActive = this.cartService.getActiveOpenOrderId() !== null;
            this.cdr.markForCheck();
        });

        this.cartService.getOpenOrders().pipe(
            takeUntil(this.destroy$)
        ).subscribe(openOrders => {
            this.openOrders = openOrders;
            this.isOpenOrderActive = this.cartService.getActiveOpenOrderId() !== null;
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    closeSidebar(): void {
        this.close.emit();
    }

    increaseQuantity(item: CartItem): void {
        if (item.quantity < item.stock) {
            this.cartService.updateQuantity(item.productId, item.quantity + 1);
        }
    }

    decreaseQuantity(item: CartItem): void {
        if (item.quantity > 1) {
            this.cartService.updateQuantity(item.productId, item.quantity - 1);
        }
    }

    removeFromCart(item: CartItem): void {
        this.cartService.removeFromCart(item.productId);
    }

    clearCart(): void {
        this.cartService.clearCart();
    }

    saveOpenOrder(): void {
        if (this.cartItems.length === 0) return;
        this.cartService.saveOpenOrder(this.openOrderName);
        this.openOrderName = '';
        this.closeSidebar();
    }

    proceedToCheckout(): void {
        if (this.cartItems.length > 0) {
            this.checkout.emit();
        }
    }

    trackByItem(index: number, item: CartItem): string {
        const addOnsKey = item.addOns ? item.addOns.map(a => a.name).sort().join(',') : '';
        const temperatureKey = item.temperature || 'none';
        return `${item.productId}-${temperatureKey}-${addOnsKey}`;
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
