# Sticky Order Panel for POS

## Problem

The current POS page uses a sliding overlay sidebar for the cart. Every time an item is added, the sidebar slides in and covers the product grid. The user must close it to continue browsing. This adds friction to the most repeated workflow: pick item, see order, pick next item.

## Solution

Convert the POS layout to a permanent split-pane on desktop: product grid on the left, order panel on the right. The order panel switches between cart and checkout views in-place. Mobile/tablet retains the current sliding sidebar behavior.

## Layout

### Desktop (min-width: 1024px)

The `.pos-container` becomes a two-column CSS grid:

- **Left column (1fr):** Top bar, filters, scrollable product grid
- **Right column (minmax(360px, 420px)):** Order panel (cart or checkout)

Both columns scroll independently. No overlays, no sliding animations on desktop.

### Mobile / Tablet (< 1024px)

No change. Full-width product grid. Cart and checkout slide in as overlays from the right. Cart toggle button with badge remains visible.

## Component Changes

### ProductGridComponent

- Replace `isCartOpen: boolean` and `isCheckoutOpen: boolean` with `currentView: 'cart' | 'checkout'` for the desktop inline panel state
- Keep `isCartOpen` for mobile overlay toggling
- `proceedToCheckout()` sets `currentView = 'checkout'`
- New `backToCart()` sets `currentView = 'cart'`
- Hide `.cart-toggle` button on desktop via CSS (cart is always visible)
- HTML template wraps the right column in a container div that holds either cart or checkout based on `currentView`

### POSCartSidebarComponent

- New `@Input() inline = false` — distinguishes desktop inline mode from mobile overlay mode
- When `inline = true`: no overlay div rendered, no fixed positioning, no transform, renders as a normal flex child filling the right column
- When `inline = false`: current sliding overlay behavior unchanged
- CSS: `.cart-sidebar.inline` class overrides positioning to `static`, `width: 100%`, `height: 100%`, `transform: none`, `box-shadow: none`

### CheckoutSidebarComponent

- Same `@Input() inline = false` pattern
- When `inline = true`: renders in-place within the order panel, no overlay
- Adds a "Back to Cart" button in the header when inline (emits a `back` event)
- New `@Output() back = new EventEmitter<void>()`
- CSS: `.checkout-sidebar.inline` class with static positioning

## CSS Changes

### product-grid.component.css

```css
/* Desktop: split-pane layout */
@media (min-width: 1024px) {
  .pos-container {
    display: grid;
    grid-template-columns: 1fr minmax(360px, 420px);
    grid-template-rows: 1fr;
  }

  .pos-main {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .order-panel {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    height: 100%;
    overflow: hidden;
  }

  .cart-toggle {
    display: none;
  }
}
```

### pos-cart-sidebar.component.css

```css
/* Inline mode — no overlay, no fixed positioning */
.cart-sidebar.inline {
  position: static;
  width: 100%;
  height: 100%;
  transform: none;
  box-shadow: none;
  z-index: auto;
}

/* Hide overlay in inline mode */
:host(.inline) .cart-sidebar-overlay {
  display: none;
}
```

### checkout-sidebar.component.css

Same `.inline` pattern as cart sidebar.

## HTML Structure (Desktop)

```html
<div class="pos-container">
  <!-- Left: main POS area -->
  <div class="pos-main">
    <app-top-bar>...</app-top-bar>
    <div class="pos-filters">...</div>
    <div class="product-grid">...</div>
  </div>

  <!-- Right: order panel (desktop only, inline) -->
  <div class="order-panel" *ngIf="isDesktop">
    <app-pos-cart-sidebar
      *ngIf="currentView === 'cart'"
      [inline]="true"
      (checkout)="proceedToCheckout()">
    </app-pos-cart-sidebar>
    <app-checkout-sidebar
      *ngIf="currentView === 'checkout'"
      [inline]="true"
      (back)="backToCart()"
      (close)="backToCart()"
      (transactionComplete)="onTransactionComplete($event)">
    </app-checkout-sidebar>
  </div>

  <!-- Mobile overlays (unchanged) -->
  <ng-container *ngIf="!isDesktop">
    <app-pos-cart-sidebar [isOpen]="isCartOpen" (close)="closeCartSidebar()" (checkout)="proceedToCheckout()">
    </app-pos-cart-sidebar>
    <app-checkout-sidebar [isOpen]="isCheckoutOpen" (close)="closeCheckout()"
      (transactionComplete)="onTransactionComplete($event)">
    </app-checkout-sidebar>
  </ng-container>
</div>
```

## Desktop Detection

Use `BreakpointObserver` from `@angular/cdk/layout` (already available via Angular Material) to reactively track `(min-width: 1024px)`. Set `isDesktop: boolean` and update via `takeUntil(this.destroy$)` subscription. This avoids manual resize listeners and integrates with Angular's change detection.

## Behavior Flow

1. **Page load** — Cart panel visible on right. Shows empty state or items from localStorage.
2. **Add item** — Product clicked, item appears in cart. No sidebar open/close animation. Cart updates in real-time.
3. **Proceed to checkout** — `currentView` switches to `'checkout'`. Right panel shows checkout form in-place.
4. **Back to cart** — "Back" button in checkout header. Switches `currentView` back to `'cart'`.
5. **Transaction complete** — Receipt shown in panel. After dismissal, resets to empty cart view.
6. **Mobile** — All current behavior preserved. Sliding overlays, cart toggle button with badge.

## What Does NOT Change

- Cart service, cart state management, localStorage persistence
- Product grid component logic (filtering, search, pagination)
- Checkout form fields and payment flow
- Temperature selection dialog
- Receipt display
- Mobile/tablet layout and behavior
- All backend APIs
