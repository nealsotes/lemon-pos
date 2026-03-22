import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Product } from '../../../pos/models/product.model';
import { ProductService } from '../../../pos/services/product.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { SearchInputComponent } from '../../../../shared/ui/search-input/search-input.component';
import { ChipGroupComponent } from '../../../../shared/ui/chip-group/chip-group.component';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    SearchInputComponent,
    ChipGroupComponent,
    EmptyStateComponent,
    ReactiveFormsModule,
    FormsModule
  ],
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  categories: string[] = [];
  productForm: FormGroup;
  editingProduct: Product | null = null;
  isLoading = true;
  showForm = false;

  // Filter and search properties
  searchTerm: string = '';
  selectedCategory: string = '';
  sortBy: string = 'name';

  // Category input toggle
  useCustomCategory: boolean = false;

  displayedColumns: string[] = ['image', 'name', 'category', 'price', 'stock', 'actions'];

  // Image upload properties
  imageType: 'emoji' | 'file' = 'emoji';
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  isDragOver = false;
  isProcessingImage = false;

  productEmojis = [
    '☕', '🥪', '🥐', '🍵', '🧁', '💧', '🥗', '🧃',
    '🍔', '🍕', '🌭', '🥙', '🌮', '🍤', '🍗', '🥘',
    '🍜', '🍝', '🍲', '🥣', '🍿', '🧀', '🥓', '🥖',
    '🍞', '🥯', '🥨', '🍪', '🎂', '🍰', '🧁', '🍫',
    '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵',
    '🥤', '🧋', '🍷', '🍺', '🍻', '🥂', '🍾', '🍸'
  ];

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private toast: ToastService,
    private confirmService: ConfirmDialogService
  ) {
    this.productForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      price: ['', [Validators.required, Validators.min(0.01)]],
      hotPrice: ['', [Validators.min(0.01)]], // Required for beverages (handled dynamically)
      coldPrice: ['', [Validators.min(0.01)]], // Required for beverages (handled dynamically)
      category: ['', Validators.required],
      stock: ['', [Validators.required, Validators.min(0)]],
      lowQuantityThreshold: [10, [Validators.required, Validators.min(0)]],
      image: ['📦', Validators.required],
      isActive: [true]
    });

    // Watch category changes to update validation
    this.productForm.get('category')?.valueChanges.subscribe(category => {
      const isBeverage = this.isBeverageCategory(category);
      const hotPriceControl = this.productForm.get('hotPrice');
      const coldPriceControl = this.productForm.get('coldPrice');
      const priceControl = this.productForm.get('price');

      // Base price is always required for all categories
      priceControl?.setValidators([Validators.required, Validators.min(0.01)]);

      if (isBeverage) {
        // For beverages: hot/cold prices are optional
        hotPriceControl?.setValidators([Validators.min(0.01)]);
        coldPriceControl?.setValidators([Validators.min(0.01)]);
      } else {
        // For non-beverages: clear hot/cold prices
        hotPriceControl?.clearValidators();
        coldPriceControl?.clearValidators();
        hotPriceControl?.setValue('');
        coldPriceControl?.setValue('');
      }
      hotPriceControl?.updateValueAndValidity();
      coldPriceControl?.updateValueAndValidity();
      priceControl?.updateValueAndValidity();
    });
  }

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
    this.showForm = true;
    this.resetForm();
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

  trackByProduct(index: number, product: Product): string {
    return product.id;
  }

  getStockStatus(stock: number, threshold?: number): string {
    const lowThreshold = threshold ?? 10; // Default to 10 if not set
    if (stock === 0) return 'low';
    if (stock <= lowThreshold) return 'medium';
    return 'high';
  }

  getStockPercentage(stock: number): number {
    // Assuming max stock is 100 for percentage calculation
    const maxStock = 100;
    return Math.min((stock / maxStock) * 100, 100);
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.productForm.reset({
      name: '',
      category: '',
      price: '',
      hotPrice: '',
      coldPrice: '',
      stock: '',
      lowQuantityThreshold: 10,
      image: '📦',
      isActive: true
    });
    this.editingProduct = null;
    this.imageType = 'emoji';
    this.selectedFile = null;
    this.imagePreview = null;
    this.isDragOver = false;
    this.useCustomCategory = false;
  }

  editProduct(product: Product): void {
    this.editingProduct = product;

    // Determine image type based on the product image
    if (this.isImageUrl(product.image)) {
      this.imageType = 'file';
      this.imagePreview = product.image;
      this.selectedFile = null; // We don't have the original file for editing
    } else {
      this.imageType = 'emoji';
      this.selectedFile = null;
      this.imagePreview = null;
    }

    // Prices are stored without VAT, so use them directly
    const isBeverage = this.isBeverageCategory(product.category);
    const formValues: any = {
      name: product.name,
      price: product.price, // Always populate base price
      category: product.category,
      stock: product.stock,
      lowQuantityThreshold: product.lowQuantityThreshold ?? 10,
      image: product.image,
      isActive: product.isActive ?? true
    };

    if (isBeverage) {
      // For beverages: populate hot/cold prices if they exist
      formValues.hotPrice = product.hotPrice ?? '';
      formValues.coldPrice = product.coldPrice ?? '';
    } else {
      // For non-beverages: clear hot/cold prices
      formValues.hotPrice = '';
      formValues.coldPrice = '';
    }

    this.productForm.patchValue(formValues);
    this.showForm = true;
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

  saveProduct(): void {
    if (this.productForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    const formValue = this.productForm.value;
    const isBeverage = this.isBeverageCategory(formValue.category);

    // Base price is always required and comes from the form
    const basePrice = parseFloat(formValue.price) || 0;

    // Hot and cold prices are optional for beverages
    let hotPrice: number | undefined = undefined;
    let coldPrice: number | undefined = undefined;

    if (isBeverage) {
      // For beverages: use hot and cold prices if provided
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
      price: basePrice, // Store price without VAT
      hotPrice: hotPrice, // Store hot price without VAT (for beverages)
      coldPrice: coldPrice, // Store cold price without VAT (for beverages)
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

    if (this.editingProduct) {
      // Update existing product
      this.productService.updateProduct(this.editingProduct.id, productData).subscribe({
        next: () => {
          this.toast.success('Product updated successfully');
          this.resetForm();
          this.showForm = false;
          this.loadProducts();
        },
        error: () => {
          this.toast.error('Error updating product');
        }
      });
    } else {
      // Create new product
      this.productService.addProduct(productData).subscribe({
        next: () => {
          this.toast.success('Product added successfully');
          this.resetForm();
          this.showForm = false;
          this.loadProducts();
        },
        error: () => {
          this.toast.error('Error adding product');
        }
      });
    }
  }

  private markFormGroupTouched(): void {
    Object.keys(this.productForm.controls).forEach(key => {
      const control = this.productForm.get(key);
      control?.markAsTouched();
    });
  }

  formatPrice(price: number): string {
    if (price === undefined || price === null || isNaN(price)) return '₱0.00';
    return `₱${price.toFixed(2)}`;
  }

  isBeverageCategory(category: string | null | undefined): boolean {
    if (!category) return false;
    const categoryLower = category.toLowerCase();
    // Check if category is any beverage-related category
    return categoryLower === 'beverages' ||
      categoryLower === 'beverage' ||
      categoryLower === 'coffee' ||
      categoryLower === 'non coffee' ||
      categoryLower === 'drinks' ||
      categoryLower === 'drink' ||
      categoryLower === 'tea' ||
      categoryLower === 'juice' ||
      categoryLower === 'smoothie' ||
      categoryLower === 'shake';
  }

  getStockStatusClass(stock: number): string {
    if (stock === 0) return 'out-of-stock';
    if (stock <= 5) return 'low-stock';
    return 'in-stock';
  }

  getStockStatusText(stock: number): string {
    if (stock === 0) return 'Out of Stock';
    if (stock <= 5) return 'Low Stock';
    return 'In Stock';
  }

  selectEmoji(emoji: string): void {
    this.productForm.patchValue({ image: emoji });
  }

  // Image upload methods
  onImageTypeChange(): void {
    if (this.imageType === 'emoji') {
      this.selectedFile = null;
      this.imagePreview = null;
      this.productForm.patchValue({ image: '📦' });
    } else {
      this.productForm.patchValue({ image: '' });
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.handleFileSelection(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelection(files[0]);
    }
  }

  private handleFileSelection(file: File): void {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.toast.error('Please select an image file');
      return;
    }

    // Validate file size (10MB limit for mobile images)
    if (file.size > 10 * 1024 * 1024) {
      this.toast.info('File size must be less than 10MB. Large images will be automatically compressed.');
    }

    // Compress and resize image if it's large
    this.isProcessingImage = true;
    this.compressAndResizeImage(file).then(compressedFile => {
      this.selectedFile = compressedFile;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
        this.productForm.patchValue({ image: e.target.result });
        this.isProcessingImage = false;
      };
      reader.readAsDataURL(compressedFile);
    }).catch(error => {
      this.isProcessingImage = false;
      this.toast.error('Error processing image. Please try again.');
    });
  }

  private async compressAndResizeImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions (max 800x800 for product images)
        const maxWidth = 800;
        const maxHeight = 800;
        let { width, height } = img;

        // Resize if image is larger than max dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw and compress image
        ctx?.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob((blob) => {
          if (blob) {
            // Create new file with compressed data
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });

            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        }, 'image/jpeg', 0.8); // 80% quality
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  removeFile(): void {
    this.selectedFile = null;
    this.imagePreview = null;
    this.productForm.patchValue({ image: '' });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isImageUrl(image: string): boolean {
    if (!image) return false;
    return image.startsWith('data:image/') ||
      image.startsWith('http') ||
      image.startsWith('/uploads/') ||
      image.startsWith('uploads/') ||
      image.startsWith('/');
  }

  toggleCategoryInput(): void {
    this.useCustomCategory = !this.useCustomCategory;
    // Clear category value when toggling to avoid confusion
    if (this.useCustomCategory) {
      this.productForm.patchValue({ category: '' });
    }
  }


  refreshData(): void {
    this.isLoading = true;
    this.productService.refreshData();
    this.loadProducts();
    this.loadCategories();
  }
}




