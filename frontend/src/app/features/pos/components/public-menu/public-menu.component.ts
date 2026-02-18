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

  getImageUrl(image: string): string {
    if (!image) return '/assets/default-product.png';
    if (image.startsWith('http://') || image.startsWith('https://')) {
      return image;
    }
    return `/api/${image}`;
  }
}





