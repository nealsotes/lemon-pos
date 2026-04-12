import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
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
    @Input() inline = false;
    @Output() close = new EventEmitter<void>();
    @Output() checkout = new EventEmitter<void>();

    @ViewChild('renameInputEl') renameInputEl?: ElementRef<HTMLInputElement>;

    cartItems: CartItem[] = [];
    openOrders: OpenOrder[] = [];
    openOrderName = '';
    isOpenOrderActive = false;
    total = 0;
    ticketModalMode: 'park' | 'rename' | null = null;
    ticketModalOrder: OpenOrder | null = null;
    editingName = '';
    readonly ticketNameSuggestions = ['Table 1', 'Table 2', 'Take-out', 'Dine-in'];
    private destroy$ = new Subject<void>();

    get totalQuantity(): number {
        return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
    }

    get activeOpenOrderId(): number | null {
        return this.cartService.getActiveOpenOrderId();
    }

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

    loadOpenOrder(order: OpenOrder): void {
        this.cartService.loadOpenOrder(order.id);
    }

    removeOpenOrder(order: OpenOrder, event: Event): void {
        event.stopPropagation();
        if (this.ticketModalOrder?.id === order.id) {
            this.closeTicketModal();
        }
        this.cartService.removeOpenOrder(order.id);
    }

    openParkModal(): void {
        if (this.cartItems.length === 0) return;
        this.ticketModalMode = 'park';
        this.ticketModalOrder = null;
        this.editingName = '';
        this.focusTicketInput();
    }

    openRenameModal(order: OpenOrder, event: Event): void {
        event.stopPropagation();
        this.ticketModalMode = 'rename';
        this.ticketModalOrder = order;
        this.editingName = order.name || '';
        this.focusTicketInput();
    }

    closeTicketModal(): void {
        this.ticketModalMode = null;
        this.ticketModalOrder = null;
        this.editingName = '';
    }

    confirmTicketModal(): void {
        const next = this.editingName.trim();
        if (this.ticketModalMode === 'park') {
            if (this.cartItems.length === 0) {
                this.closeTicketModal();
                return;
            }
            this.cartService.saveOpenOrder(next);
        } else if (this.ticketModalMode === 'rename' && this.ticketModalOrder) {
            if (next && next !== this.ticketModalOrder.name) {
                this.cartService.renameOpenOrder(this.ticketModalOrder.id, next);
            }
        }
        this.closeTicketModal();
    }

    applySuggestion(name: string): void {
        this.editingName = name;
        this.renameInputEl?.nativeElement.focus();
    }

    private focusTicketInput(): void {
        // Focus the input once Angular has rendered the modal
        setTimeout(() => {
            const input = this.renameInputEl?.nativeElement;
            if (input) {
                input.focus();
                input.select();
            }
        }, 0);
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
            image.startsWith('uploads/') ||
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
