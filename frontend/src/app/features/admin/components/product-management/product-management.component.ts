import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { environment } from '../../../../../environments/environment.prod';
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
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
export class ProductManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  products: Product[] = [];
  filteredProducts: Product[] = [];
  categories: string[] = [];
  isLoading = true;
  isExporting = false;
  selectedProducts: Product[] = [];

  // Filter and search properties
  searchTerm: string = '';
  selectedCategory: string = '';
  sortBy: string = 'name';

  // Table columns definition
  tableColumns: TableColumn[] = [
    { key: 'name', label: 'Product', cellTemplate: 'product', sortable: true },
    { key: 'category', label: 'Category', cellTemplate: 'category', sortable: true },
    { key: 'price', label: 'Price', cellTemplate: 'price', sortable: true },
    { key: 'stock', label: 'Stock', cellTemplate: 'stock', sortable: true },
    { key: 'isActive', label: 'Status', cellTemplate: 'status', sortable: true },
    { key: 'actions', label: '', cellTemplate: 'actions', width: '100px', align: 'right' as const }
  ];

  columnSortKey = '';
  columnSortDirection: 'asc' | 'desc' = 'asc';

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
    private dialog: MatDialog,
    private http: HttpClient
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
    this.productService.getProducts().pipe(takeUntil(this.destroy$)).subscribe(products => {
      this.products = products;
      this.filteredProducts = products;
      this.isLoading = false;
    });
  }

  private loadCategories(): void {
    this.productService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(categories => {
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
    this.columnSortKey = '';
    this.filterProducts();
  }

  onColumnSort(event: { key: string; direction: 'asc' | 'desc' }): void {
    this.columnSortKey = event.key;
    this.columnSortDirection = event.direction;
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

    // Sort products — column header sort takes priority over dropdown
    if (this.columnSortKey) {
      const key = this.columnSortKey;
      const dir = this.columnSortDirection === 'asc' ? 1 : -1;
      filtered.sort((a: any, b: any) => {
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        if (typeof valA === 'boolean' && typeof valB === 'boolean') {
          return (valA === valB ? 0 : valA ? -1 : 1) * dir;
        }
        return String(valA || '').localeCompare(String(valB || '')) * dir;
      });
    } else {
      filtered.sort((a, b) => {
        switch (this.sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'price':
            return a.price - b.price;
          case 'stock':
            return a.stock - b.stock;
          default:
            return 0;
        }
      });
    }

    this.filteredProducts = filtered;
  }

  editProduct(product: Product): void {
    this.openProductDialog(product);
  }

  private openProductDialog(product: Product | null): void {
    const dialogRef = this.dialog.open(ProductEditorDialogComponent, {
      width: '660px',
      maxWidth: '95vw',
      data: { product, categories: this.categories, allProducts: this.products },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(formValue => {
      if (!formValue) return;
      this.saveProduct(formValue, product);
    });
  }

  onSelectionChange(selected: Product[]): void {
    this.selectedProducts = selected;
  }

  async deleteSelectedProducts(): Promise<void> {
    const count = this.selectedProducts.length;
    if (count === 0) return;

    const confirmed = await this.confirmService.confirm({
      title: 'Delete Products',
      message: `Are you sure you want to delete ${count} product${count > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: `Delete ${count} Product${count > 1 ? 's' : ''}`,
      cancelLabel: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      const ids = this.selectedProducts.map(p => p.id);
      this.productService.deleteProductsBulk(ids).subscribe({
        next: () => {
          this.toast.success(`${count} product${count > 1 ? 's' : ''} deleted successfully`);
          this.selectedProducts = [];
          this.loadProducts();
        },
        error: () => {
          this.toast.error('Error deleting products');
        }
      });
    }
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
    const basePrice = parseFloat(formValue.price) || 0;
    const hasHotCold = formValue.hasHotCold === true;
    const hasAddOns = formValue.hasAddOns === true;

    let hotPrice: number | undefined = undefined;
    let coldPrice: number | undefined = undefined;

    if (hasHotCold) {
      const hotPriceValue = formValue.hotPrice ? parseFloat(formValue.hotPrice) : null;
      const coldPriceValue = formValue.coldPrice ? parseFloat(formValue.coldPrice) : null;

      if (hotPriceValue !== null && !isNaN(hotPriceValue) && hotPriceValue > 0) {
        hotPrice = hotPriceValue;
      }
      if (coldPriceValue !== null && !isNaN(coldPriceValue) && coldPriceValue > 0) {
        coldPrice = coldPriceValue;
      }
    }

    // Build add-ons array from form
    const addOns = hasAddOns && formValue.addOns?.length > 0
      ? formValue.addOns
          .filter((a: any) => a.name && a.price > 0)
          .map((a: any) => ({ name: a.name, price: parseFloat(a.price) || 0 }))
      : [];

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
      isActive: formValue.isActive === true || (formValue.isActive !== false && formValue.isActive !== 'false'),
      hasHotCold: hasHotCold,
      hasAddOns: hasAddOns,
      addOns: addOns
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

  exportProducts(): void {
    if (this.isExporting) return;
    this.isExporting = true;

    this.http.get(`${environment.apiUrl}/products/export?format=xlsx`, { responseType: 'blob', observe: 'response' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const blob = response.body;
          if (!blob) {
            this.toast.error('Export returned no content.');
            this.isExporting = false;
            return;
          }
          const fallbackName = `products_${new Date().toISOString().split('T')[0]}.xlsx`;
          const filename = this.extractFilename(response.headers.get('content-disposition')) ?? fallbackName;
          this.triggerDownload(blob, filename);
          this.toast.success('Products export ready.');
          this.isExporting = false;
        },
        error: () => {
          this.toast.error('Export failed. Please try again.');
          this.isExporting = false;
        }
      });
  }

  private extractFilename(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
    return match ? decodeURIComponent(match[1].replace(/"/g, '')) : null;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
