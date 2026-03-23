import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Product } from '../../../pos/models/product.model';
import { ProductService } from '../../../pos/services/product.service';
import { ProductEditorDialogComponent } from './product-editor-dialog.component';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { KpiStripComponent, KpiItem } from '../../../../shared/ui/kpi-strip/kpi-strip.component';
import { FilterBarComponent } from '../../../../shared/ui/filter-bar/filter-bar.component';
import { DataTableComponent, TableColumn } from '../../../../shared/ui/data-table/data-table.component';
import { CellDefDirective } from '../../../../shared/ui/data-table/cell-def.directive';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ImageDisplayComponent } from '../../../../shared/ui/image-display/image-display.component';
import { StockIndicatorComponent } from '../../../../shared/ui/stock-indicator/stock-indicator.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    KpiStripComponent,
    FilterBarComponent,
    DataTableComponent,
    CellDefDirective,
    BadgeComponent,
    ImageDisplayComponent,
    StockIndicatorComponent,
    LoadingSpinnerComponent,
    ButtonComponent,
    MatDialogModule
  ],
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  categories: string[] = [];
  isLoading = true;

  // Filter and search properties
  searchTerm: string = '';
  selectedCategory: string = '';
  sortBy: string = 'name';

  // Table columns definition
  tableColumns: TableColumn[] = [
    { key: 'name', label: 'Product', cellTemplate: 'product' },
    { key: 'category', label: 'Category', cellTemplate: 'category' },
    { key: 'price', label: 'Price', cellTemplate: 'price' },
    { key: 'stock', label: 'Stock', cellTemplate: 'stock' },
    { key: 'isActive', label: 'Status', cellTemplate: 'status' },
    { key: 'actions', label: '', cellTemplate: 'actions', width: '100px', align: 'right' as const }
  ];

  // Sort options for filter bar
  sortOptions = [
    { value: 'name', label: 'Sort by Name' },
    { value: 'price', label: 'Sort by Price' },
    { value: 'stock', label: 'Sort by Stock' }
  ];

  constructor(
    private productService: ProductService,
    private toast: ToastService,
    private confirmService: ConfirmDialogService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
  }

  private loadProducts(): void {
    this.productService.getProducts().subscribe(products => {
      this.products = products;
      this.filteredProducts = products;
      this.isLoading = false;
    });
  }

  private loadCategories(): void {
    this.productService.getCategories().subscribe(categories => {
      this.categories = categories;
    });
  }

  // KPI items getter
  get kpiItems(): KpiItem[] {
    return [
      {
        label: 'Total Products',
        value: this.products.length,
        trend: `${this.getActiveProductsCount()} active items`,
        trendDirection: 'neutral' as const
      },
      {
        label: 'Inventory Value',
        value: this.formatPrice(this.getTotalProductsValue()),
        trend: 'Total stock value',
        trendDirection: 'neutral' as const
      },
      {
        label: 'Low Stock',
        value: this.getLowStockCount(),
        trend: 'items below threshold',
        trendDirection: this.getLowStockCount() > 0 ? 'down' as const : 'neutral' as const
      },
      {
        label: 'Out of Stock',
        value: this.getOutOfStockCount(),
        trend: 'require immediate restock',
        trendDirection: this.getOutOfStockCount() > 0 ? 'down' as const : 'neutral' as const
      }
    ];
  }

  // KPI Calculations
  getTotalProductsValue(): number {
    return this.products.reduce((acc, p) => acc + (p.price * (p.stock || 0)), 0);
  }

  getLowStockCount(): number {
    return this.products.filter(p => (p.stock || 0) <= (p.lowQuantityThreshold ?? 10) && (p.stock || 0) > 0).length;
  }

  getOutOfStockCount(): number {
    return this.products.filter(p => (p.stock || 0) === 0).length;
  }

  getActiveProductsCount(): number {
    return this.products.filter(p => p.isActive !== false).length;
  }

  getAveragePrice(): number {
    if (this.products.length === 0) return 0;
    return this.products.reduce((acc, p) => acc + p.price, 0) / this.products.length;
  }

  openAddProductDialog(): void {
    this.openProductDialog(null);
  }

  // Filter handler methods
  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.filterProducts();
  }

  onSortChange(value: string): void {
    this.sortBy = value;
    this.filterProducts();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.filterProducts();
  }

  filterProducts(): void {
    let filtered = [...this.products];

    // Filter by search term
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchLower) ||
        product.category.toLowerCase().includes(searchLower)
      );
    }

    // Filter by category
    if (this.selectedCategory) {
      filtered = filtered.filter(product => product.category === this.selectedCategory);
    }

    // Sort products
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price':
          return a.price - b.price;
        case 'stock':
          return a.stock - b.stock;
        case 'createdAt':
          // Since createdAt doesn't exist in Product model, sort by name as fallback
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    this.filteredProducts = filtered;
  }

  editProduct(product: Product): void {
    this.openProductDialog(product);
  }

  private openProductDialog(product: Product | null): void {
    const dialogRef = this.dialog.open(ProductEditorDialogComponent, {
      width: '660px',
      maxWidth: '95vw',
      data: { product, categories: this.categories },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(formValue => {
      if (!formValue) return;
      this.saveProduct(formValue, product);
    });
  }

  async deleteProduct(product: Product): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Delete Product',
      message: `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      this.productService.deleteProduct(product.id).subscribe({
        next: () => {
          this.toast.success('Product deleted successfully');
          this.loadProducts();
        },
        error: () => {
          this.toast.error('Error deleting product');
        }
      });
    }
  }

  private saveProduct(formValue: any, existingProduct: Product | null): void {
    const isBeverage = this.isBeverageCategory(formValue.category);
    const basePrice = parseFloat(formValue.price) || 0;

    let hotPrice: number | undefined = undefined;
    let coldPrice: number | undefined = undefined;

    if (isBeverage) {
      const hotPriceValue = formValue.hotPrice ? parseFloat(formValue.hotPrice) : null;
      const coldPriceValue = formValue.coldPrice ? parseFloat(formValue.coldPrice) : null;

      if (hotPriceValue !== null && !isNaN(hotPriceValue) && hotPriceValue > 0) {
        hotPrice = hotPriceValue;
      }
      if (coldPriceValue !== null && !isNaN(coldPriceValue) && coldPriceValue > 0) {
        coldPrice = coldPriceValue;
      }
    }

    const productData = {
      name: formValue.name,
      price: basePrice,
      hotPrice: hotPrice,
      coldPrice: coldPrice,
      category: formValue.category,
      stock: parseInt(formValue.stock),
      lowQuantityThreshold: typeof formValue.lowQuantityThreshold === 'number'
        ? formValue.lowQuantityThreshold
        : (formValue.lowQuantityThreshold !== null && formValue.lowQuantityThreshold !== undefined && formValue.lowQuantityThreshold !== '' && !isNaN(Number(formValue.lowQuantityThreshold)))
          ? Number(formValue.lowQuantityThreshold)
          : 10,
      image: formValue.image,
      isActive: formValue.isActive === true || (formValue.isActive !== false && formValue.isActive !== 'false')
    };

    if (existingProduct) {
      this.productService.updateProduct(existingProduct.id, productData).subscribe({
        next: () => {
          this.toast.success('Product updated successfully');
          this.loadProducts();
          this.loadCategories();
        },
        error: () => {
          this.toast.error('Error updating product');
        }
      });
    } else {
      this.productService.addProduct(productData).subscribe({
        next: () => {
          this.toast.success('Product added successfully');
          this.loadProducts();
          this.loadCategories();
        },
        error: () => {
          this.toast.error('Error adding product');
        }
      });
    }
  }

  formatPrice(price: number): string {
    if (price === undefined || price === null || isNaN(price)) return '₱0.00';
    return `₱${price.toFixed(2)}`;
  }

  private isBeverageCategory(category: string | null | undefined): boolean {
    if (!category) return false;
    const lower = category.toLowerCase();
    return ['beverages', 'beverage', 'coffee', 'non coffee', 'drinks', 'drink', 'tea', 'juice', 'smoothie', 'shake'].includes(lower);
  }

  refreshData(): void {
    this.isLoading = true;
    this.productService.refreshData();
    this.loadProducts();
    this.loadCategories();
  }
}
