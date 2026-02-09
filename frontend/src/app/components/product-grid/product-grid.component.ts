import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, TrackByFunction } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Product } from '../../models/product.model';
import { CartItem } from '../../models/cart-item.model';
import { OpenOrder } from '../../models/open-order.model';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { CheckoutSidebarComponent } from '../checkout/checkout-sidebar.component';
import { TemperatureSelectDialogComponent, TemperatureDialogResult } from './temperature-select-dialog.component';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

@Component({
  selector: 'app-product-grid',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CheckoutSidebarComponent
  ],
  templateUrl: './product-grid.component.html',
  styleUrls: ['./product-grid.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductGridComponent implements OnInit, OnDestroy {
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory: string = 'all';
  filteredProducts: Product[] = [];
  isLoading = true;
  searchTerm = '';

  // Performance optimization properties
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();
  private readonly ITEMS_PER_PAGE = 20;
  private readonly VISIBLE_ITEMS = 12;
  currentPage = 1;
  totalPages = 1;
  paginatedProducts: Product[] = [];

  // Memoized product states for performance
  private productStateCache = new Map<string, { isLowStock: boolean; isOutOfStock: boolean; isImageUrl: boolean }>();

  // Cart sidebar properties
  isCartOpen = false;
  cartItems: CartItem[] = [];
  openOrders: OpenOrder[] = [];
  openOrderName = '';
  isOpenOrderActive = false;
  cartItemCount = 0;
  subtotal = 0;
  tax = 0;
  total = 0;

  // Checkout sidebar properties
  isCheckoutOpen = false;

  constructor(
    private productService: ProductService,
    private cartService: CartService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.loadProducts();
    this.loadCategories();
    this.loadCart();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm;
      this.filterProducts();
    });
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    // Subscribe to product updates - this will automatically update when products change
    this.productService.getProducts().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (products) => {
        this.products = products || [];
        // Clear and rebuild product state cache
        this.productStateCache.clear();
        this.products.forEach(p => this.updateProductStateCache(p));
        this.filterProducts();
        this.isLoading = false;
        if (this.categories.length === 0 && this.products.length > 0) {
          this.generateCategoriesFromProducts();
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.products = [];
        this.filterProducts();
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadCategories(): void {
    this.productService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories || [];
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.categories = [];
        this.cdr.markForCheck();
      }
    });
  }

  private loadCart(): void {
    this.cartService.getCartItems().pipe(
      takeUntil(this.destroy$)
    ).subscribe(items => {
      // Use requestAnimationFrame to batch updates and reduce lag
      requestAnimationFrame(() => {
        this.cartItems = items;
        // Calculate count directly from items array to ensure it updates when cart is cleared
        this.cartItemCount = items.reduce((total, item) => total + item.quantity, 0);
        this.subtotal = this.cartService.getCartTotal();
        this.total = this.subtotal;
        this.tax = 0;
        this.isOpenOrderActive = this.cartService.getActiveOpenOrderId() !== null;
        this.cdr.markForCheck();
      });
    });

    this.cartService.getOpenOrders().pipe(
      takeUntil(this.destroy$)
    ).subscribe(openOrders => {
      this.openOrders = openOrders;
      this.isOpenOrderActive = this.cartService.getActiveOpenOrderId() !== null;
      this.cdr.markForCheck();
    });
  }

  filterProducts(): void {
    // Filter out inactive products (only show active products in POS)
    let filtered = this.products.filter(product => product.isActive !== false);

    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === this.selectedCategory);
    }

    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search)
      );
    }

    this.filteredProducts = filtered;
    this.updatePagination();
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredProducts.length / this.ITEMS_PER_PAGE);
    this.currentPage = 1; // Reset to first page when filtering
    this.updatePaginatedProducts();
  }

  private updatePaginatedProducts(): void {
    const startIndex = (this.currentPage - 1) * this.ITEMS_PER_PAGE;
    const endIndex = startIndex + this.ITEMS_PER_PAGE;
    this.paginatedProducts = this.filteredProducts.slice(startIndex, endIndex);
    this.cdr.markForCheck();
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchSubject.next(target.value);
  }

  loadMoreProducts(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedProducts();
    }
  }

  hasMoreProducts(): boolean {
    return this.currentPage < this.totalPages;
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.filterProducts();
    this.cdr.markForCheck();
  }

  addToCart(product: Product): void {
    if (product.stock <= 0) {
      return;
    }

    // Check if product is a beverage (needs temperature selection)
    // Show temperature dialog if it's a beverage category OR has hot/cold prices set
    const categoryLower = product.category?.toLowerCase() || '';
    const isBeverageCategory = categoryLower === 'beverages' ||
      categoryLower === 'beverage' ||
      categoryLower === 'coffee' ||
      categoryLower === 'non coffee' ||
      categoryLower === 'drinks' ||
      categoryLower === 'drink' ||
      categoryLower === 'tea' ||
      categoryLower === 'juice' ||
      categoryLower === 'smoothie' ||
      categoryLower === 'shake';

    const hasTemperaturePrices = (product.hotPrice !== undefined && product.hotPrice !== null) ||
      (product.coldPrice !== undefined && product.coldPrice !== null);

    const isBeverage = isBeverageCategory || hasTemperaturePrices;

    if (isBeverage) {
      // Show temperature selection dialog
      const dialogRef = this.dialog.open(TemperatureSelectDialogComponent, {
        width: '400px',
        data: { product: product }
      });

      dialogRef.afterClosed().subscribe((result: TemperatureDialogResult | undefined) => {
        if (result !== undefined && result !== null) {
          // User selected a temperature and potentially add-ons
          this.cartService.addToCart(product, 1, result.temperature, result.addOns);
          this.openCartSidebar();
          this.showAddToCartFeedback(product);
        }
      });
    } else {
      // Non-beverage products don't need temperature selection
      this.cartService.addToCart(product, 1, null);
      this.openCartSidebar();
      this.showAddToCartFeedback(product);
    }
  }

  private showAddToCartFeedback(product: Product): void {
    // You can implement a toast notification here
  }

  // Cart sidebar methods
  toggleCartSidebar(): void {
    this.isCartOpen = !this.isCartOpen;
    // Use requestAnimationFrame for smoother UI updates
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  openCartSidebar(): void {
    this.isCartOpen = true;
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  closeCartSidebar(): void {
    this.isCartOpen = false;
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  // Cart item management
  increaseQuantity(item: CartItem): void {
    if (item.quantity < item.stock) {
      this.cartService.updateQuantity(item.productId, item.quantity + 1);
      // Use requestAnimationFrame for smoother UI updates
      requestAnimationFrame(() => this.cdr.markForCheck());
    }
  }

  decreaseQuantity(item: CartItem): void {
    if (item.quantity > 1) {
      this.cartService.updateQuantity(item.productId, item.quantity - 1);
      requestAnimationFrame(() => this.cdr.markForCheck());
    }
  }

  removeFromCart(item: CartItem): void {
    this.cartService.removeFromCart(item.productId);
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  clearCart(): void {
    this.cartService.clearCart();
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  proceedToCheckout(): void {
    if (this.cartItems.length === 0) {
      return;
    }

    // Open checkout sidebar instead of navigating
    this.isCheckoutOpen = true;
    this.isCartOpen = false; // Close cart sidebar when opening checkout
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  saveOpenOrder(): void {
    if (this.cartItems.length === 0) {
      return;
    }
    this.cartService.saveOpenOrder(this.openOrderName);
    this.openOrderName = '';
    this.isCartOpen = false;
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  closeCheckout(): void {
    this.isCheckoutOpen = false;
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  onTransactionComplete(event: any): void {
    // Reload cart data to update counts and totals
    this.loadCart();

    // Force refresh products from server to update stock quantities immediately
    // This clears cache and fetches fresh data from the API
    this.isLoading = true;
    this.cdr.markForCheck();

    this.productService.forceRefresh().subscribe({
      next: (products) => {
        // Products are already updated via BehaviorSubject, but ensure UI updates
        this.products = products || [];
        // Clear and rebuild product state cache
        this.productStateCache.clear();
        this.products.forEach(p => this.updateProductStateCache(p));
        this.filterProducts();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });

    // Don't close checkout sidebar immediately - receipt sidebar is embedded in it
    // The receipt sidebar will close both sidebars when user closes it
    // Keep checkout sidebar open so receipt sidebar can be displayed
  }

  trackByItem(index: number, item: CartItem): string {
    // Include temperature and add-ons in the key to ensure items with same product
    // but different temperatures/add-ons are treated as separate items
    const addOnsKey = item.addOns ? item.addOns.map(a => a.name).sort().join(',') : '';
    const temperatureKey = item.temperature || 'none';
    return `${item.productId}-${temperatureKey}-${addOnsKey}`;
  }

  isLowStock(product: Product): boolean {
    if (!product?.id) return false;
    const cacheKey = product.id;
    if (!this.productStateCache.has(cacheKey)) {
      this.updateProductStateCache(product);
    }
    return this.productStateCache.get(cacheKey)?.isLowStock ?? false;
  }

  isOutOfStock(product: Product): boolean {
    if (!product?.id) return false;
    const cacheKey = product.id;
    if (!this.productStateCache.has(cacheKey)) {
      this.updateProductStateCache(product);
    }
    return this.productStateCache.get(cacheKey)?.isOutOfStock ?? false;
  }

  private updateProductStateCache(product: Product): void {
    if (!product?.id) return;
    const threshold = product.lowQuantityThreshold ?? 10;
    this.productStateCache.set(product.id, {
      isLowStock: product.stock > 0 && product.stock <= threshold,
      isOutOfStock: product.stock === 0,
      isImageUrl: this.checkIsImageUrl(product.image)
    });
  }

  private checkIsImageUrl(image: string | undefined): boolean {
    if (!image) return false;
    return image.startsWith('data:image/') ||
      image.startsWith('http') ||
      image.startsWith('/uploads/') ||
      image.startsWith('/');
  }

  trackByProduct(index: number, product: Product): string {
    return product.id;
  }

  onImageError(event: any): void {
    // Handle image loading errors
    const img = event.target;
    img.style.display = 'none';
    const placeholder = img.parentElement?.querySelector('.image-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  }


  isImageUrl(image: string | undefined): boolean {
    if (!image) return false;
    // Check for data URLs, full URLs, or relative paths (starting with /)
    return image.startsWith('data:image/') ||
      image.startsWith('http') ||
      image.startsWith('/uploads/') ||
      image.startsWith('/');
  }

  getProductImageUrl(product: Product): string | undefined {
    if (!product?.id) return undefined;
    const cacheKey = product.id;
    if (!this.productStateCache.has(cacheKey)) {
      this.updateProductStateCache(product);
    }
    const cached = this.productStateCache.get(cacheKey);
    return cached?.isImageUrl ? product.image : undefined;
  }

  refreshData(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.productService.refreshData();
    this.loadProducts();
    this.loadCategories();
  }

  private generateCategoriesFromProducts(): void {
    const uniqueCategories = [...new Set(this.products.map(p => p.category).filter(c => c && c.trim() !== ''))];
    this.categories = uniqueCategories;
    this.cdr.markForCheck();
  }
}

