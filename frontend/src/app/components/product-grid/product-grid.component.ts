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
import { POSCartSidebarComponent } from '../cart/pos-cart-sidebar.component';
import { ProductCardComponent } from './product-card.component';
import { ProductFiltersComponent } from './product-filters.component';
import { POSHeaderComponent } from './pos-header.component';
import { TemperatureSelectDialogComponent, TemperatureDialogResult } from './temperature-select-dialog.component';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-product-grid',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CheckoutSidebarComponent,
    POSCartSidebarComponent,
    ProductCardComponent,
    ProductFiltersComponent,
    POSHeaderComponent
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
  isOnline = true;

  // Performance optimization properties
  private destroy$ = new Subject<void>();
  private readonly ITEMS_PER_PAGE = 20;
  private readonly VISIBLE_ITEMS = 12;
  currentPage = 1;
  totalPages = 1;
  paginatedProducts: Product[] = [];

  // Cart sidebar properties
  isCartOpen = false;
  cartItemCount = 0;

  // Checkout sidebar properties
  isCheckoutOpen = false;

  constructor(
    private productService: ProductService,
    private cartService: CartService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
    this.loadCart();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        this.cartItemCount = items.reduce((total, item) => total + item.quantity, 0);
        this.cdr.markForCheck();
      });
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

  onSearch(term: string): void {
    this.searchTerm = term;
    this.filterProducts();
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

  filterByCategory(category: string): void {
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

  clearCart(): void {
    this.cartService.clearCart();
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  proceedToCheckout(): void {
    if (this.cartItemCount === 0) {
      return;
    }

    // Open checkout sidebar instead of navigating
    this.isCheckoutOpen = true;
    this.isCartOpen = false; // Close cart sidebar when opening checkout
    requestAnimationFrame(() => this.cdr.markForCheck());
  }

  saveOpenOrder(): void {
    // Moved to POSCartSidebarComponent
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


  trackByProduct(index: number, product: Product): string {
    return product.id;
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




