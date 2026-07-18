import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { Product } from '../../models/product.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-menu.component.html',
  styleUrls: ['./public-menu.component.css']
})
export class PublicMenuComponent implements OnInit, OnDestroy {
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory: string | null = null;
  searchQuery: string = '';
  filteredProducts: Product[] = [];
  loading = true;
  
  private destroy$ = new Subject<void>();

  constructor(
    private productService: ProductService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadProducts(): void {
    this.productService.getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(products => {
        // Only show active products
        this.products = products.filter(p => p.isActive !== false && p.stock > 0);
        this.applyFilters();
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private loadCategories(): void {
    this.productService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe(categories => {
        this.categories = categories;
        this.cdr.markForCheck();
      });
  }

  selectCategory(category: string | null): void {
    this.selectedCategory = category;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.products];

    // Filter by category
    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
    }

    this.filteredProducts = filtered;
    this.cdr.markForCheck();
  }

  getPrice(product: Product): number {
    return product.price;
  }

  hasHotPrice(product: Product): boolean {
    return product.hotPrice !== undefined && product.hotPrice !== null;
  }

  hasColdPrice(product: Product): boolean {
    return product.coldPrice !== undefined && product.coldPrice !== null;
  }

  // Inline placeholder — avoids depending on an asset file that may not exist.
  readonly placeholderImage =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
    );

  getImageUrl(image: string): string {
    // The backend already normalizes real photos to a ready-to-use URL
    // (a data: URL, an /api/products/image/... path, or a full http URL).
    // Use it as-is; emoji or empty values fall back to the placeholder.
    if (!image) return this.placeholderImage;
    if (image.startsWith('data:') ||
        image.startsWith('http://') ||
        image.startsWith('https://') ||
        image.startsWith('/')) {
      return image;
    }
    return this.placeholderImage;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.src !== this.placeholderImage) {
      img.src = this.placeholderImage;
    }
  }
}





