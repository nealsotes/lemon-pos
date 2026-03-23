import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Product } from '../../../pos/models/product.model';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

export interface ProductEditorDialogData {
  product: Product | null;
  categories: string[];
}

@Component({
  selector: 'app-product-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    ButtonComponent
  ],
  template: `
    <div class="product-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <h2>{{ data.product ? 'Edit Product' : 'Add New Product' }}</h2>
        <button class="dialog-close-btn" (click)="onClose()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <form [formGroup]="productForm" (ngSubmit)="save()">
          <!-- Row 1: Name + Category -->
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label for="name">Product Name *</label>
              <input type="text" id="name" formControlName="name" class="form-control"
                placeholder="Enter product name">
              <div class="error-message"
                *ngIf="productForm.get('name')?.invalid && productForm.get('name')?.touched">
                <span *ngIf="productForm.get('name')?.errors?.['required']">Product name is required</span>
                <span *ngIf="productForm.get('name')?.errors?.['minlength']">Minimum 2 characters</span>
              </div>
            </div>

            <div class="form-group">
              <label for="category">Category *</label>
              <div class="category-input-wrapper">
                <input *ngIf="useCustomCategory" type="text" id="customCategory" formControlName="category"
                  class="form-control" placeholder="Enter new category name" list="categoryOptions">
                <datalist id="categoryOptions">
                  <option *ngFor="let cat of data.categories" [value]="cat">
                </datalist>
                <select *ngIf="!useCustomCategory" id="category" formControlName="category" class="form-control form-select">
                  <option value="">Select a category</option>
                  <option *ngFor="let cat of data.categories" [value]="cat">{{ cat }}</option>
                </select>
                <button type="button" class="category-toggle-btn" (click)="toggleCategoryInput()"
                  [title]="useCustomCategory ? 'Select from existing categories' : 'Add new category'">
                  <svg *ngIf="!useCustomCategory" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <svg *ngIf="useCustomCategory" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
              <div class="error-message"
                *ngIf="productForm.get('category')?.invalid && productForm.get('category')?.touched">
                <span *ngIf="productForm.get('category')?.errors?.['required']">Category is required</span>
              </div>
            </div>
          </div>

          <!-- Row 2: Price + Stock + Low Stock Alert -->
          <div class="form-grid form-grid-3">
            <div class="form-group">
              <label for="price">Price *</label>
              <input type="number" id="price" formControlName="price" class="form-control" placeholder="0.00" step="0.01" min="0.01">
              <div class="error-message" *ngIf="productForm.get('price')?.invalid && productForm.get('price')?.touched">
                <span *ngIf="productForm.get('price')?.errors?.['required']">Price is required</span>
                <span *ngIf="productForm.get('price')?.errors?.['min']">Price must be greater than 0</span>
              </div>
            </div>

            <div class="form-group">
              <label for="stock">Quantity *</label>
              <input type="number" id="stock" formControlName="stock" class="form-control" placeholder="0" min="0">
              <div class="error-message" *ngIf="productForm.get('stock')?.invalid && productForm.get('stock')?.touched">
                <span *ngIf="productForm.get('stock')?.errors?.['required']">Stock quantity is required</span>
                <span *ngIf="productForm.get('stock')?.errors?.['min']">Must be 0 or greater</span>
              </div>
            </div>

            <div class="form-group">
              <label for="lowQuantityThreshold">Low Stock Alert</label>
              <input type="number" id="lowQuantityThreshold" formControlName="lowQuantityThreshold" class="form-control"
                placeholder="10" min="0">
            </div>
          </div>

          <!-- Beverage hot/cold prices (conditional) -->
          <div *ngIf="isBeverageCategory(productForm.get('category')?.value)" class="form-grid form-grid-2">
            <div class="form-group">
              <label for="hotPrice">Hot Price</label>
              <input type="number" id="hotPrice" formControlName="hotPrice" class="form-control" placeholder="0.00" step="0.01" min="0.01">
            </div>
            <div class="form-group">
              <label for="coldPrice">Iced Price</label>
              <input type="number" id="coldPrice" formControlName="coldPrice" class="form-control" placeholder="0.00" step="0.01" min="0.01">
            </div>
          </div>

          <!-- Image -->
          <div class="image-upload-section">
            <div class="image-type-selector">
              <label class="image-type-option">
                <input type="radio" name="imageType" value="emoji" [(ngModel)]="imageType"
                  [ngModelOptions]="{standalone: true}" (change)="onImageTypeChange()" class="image-type-radio">
                <span class="image-type-label">Emoji Icon</span>
              </label>
              <label class="image-type-option">
                <input type="radio" name="imageType" value="file" [(ngModel)]="imageType"
                  [ngModelOptions]="{standalone: true}" (change)="onImageTypeChange()" class="image-type-radio">
                <span class="image-type-label">Upload Image</span>
              </label>
            </div>

            <!-- Emoji Selector -->
            <div *ngIf="imageType === 'emoji'" class="emoji-selector">
              <div class="emoji-grid">
                <button type="button" *ngFor="let emoji of productEmojis" class="emoji-btn"
                  [class.selected]="productForm.get('image')?.value === emoji" (click)="selectEmoji(emoji)"
                  [title]="emoji">
                  {{ emoji }}
                </button>
              </div>
            </div>

            <!-- File Upload -->
            <div *ngIf="imageType === 'file'" class="file-upload-section">
              <div class="file-upload-area" (click)="fileInput.click()" (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)" (drop)="onDrop($event)" [class.dragover]="isDragOver"
                [class.has-file]="selectedFile" [class.processing]="isProcessingImage">
                <div class="upload-content">
                  <svg *ngIf="!selectedFile && !isProcessingImage" class="upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <div *ngIf="!selectedFile && !isProcessingImage" class="upload-text">
                    <p class="upload-title">Click to upload or drag and drop</p>
                    <p class="upload-subtitle">PNG, JPG, JPEG up to 10MB (auto-compressed)</p>
                  </div>
                  <div *ngIf="isProcessingImage" class="upload-text">
                    <p class="upload-title">Processing image...</p>
                    <p class="upload-subtitle">Compressing and resizing</p>
                  </div>
                  <div *ngIf="selectedFile" class="file-preview">
                    <img [src]="imagePreview" alt="Preview" class="preview-image">
                    <div class="file-info">
                      <p class="file-name">{{ selectedFile.name }}</p>
                      <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
                    </div>
                  </div>
                </div>
              </div>
              <input #fileInput type="file" accept="image/*" (change)="onFileSelected($event)" style="display: none;">
              <div class="upload-actions" *ngIf="selectedFile">
                <app-button variant="secondary" size="sm" (click)="removeFile()">Remove</app-button>
              </div>
            </div>
          </div>

          <!-- Active Toggle -->
          <div class="form-group active-toggle">
            <label>
              <input type="checkbox" formControlName="isActive" class="form-checkbox">
              <span>Active Product</span>
            </label>
          </div>
        </form>
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <app-button variant="secondary" (click)="onClose()">Cancel</app-button>
        <app-button variant="primary" (click)="save()" [disabled]="productForm.invalid">
          {{ data.product ? 'Update' : 'Add' }} Product
        </app-button>
      </div>
    </div>
  `,
  styles: [`
    .product-dialog {
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      font-family: var(--font-ui);
      color: var(--text-primary);
      background: var(--bg-surface);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
    }

    /* ---------- Header ---------- */
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
    }

    .dialog-header h2 {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      margin: 0;
    }

    .dialog-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .dialog-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-primary);
      background: var(--bg-subtle);
    }

    /* ---------- Body ---------- */
    .dialog-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      min-height: 0;
    }

    /* ---------- Form ---------- */
    .form-grid {
      display: grid;
      gap: 10px;
    }

    .form-grid-2 {
      grid-template-columns: 1fr 1fr;
    }

    .form-grid-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .form-group label {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .form-control {
      padding: 0 12px;
      height: 34px;
      line-height: 34px;
      background: var(--bg-subtle, var(--background-secondary));
      border: 1px solid var(--border, var(--border-color));
      border-radius: 5px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: var(--font-ui);
      outline: none;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      width: 100%;
      box-sizing: border-box;
    }

    .form-control:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
    }

    .form-control::placeholder {
      color: var(--text-muted);
    }

    /* ---------- Select Dropdown Fix ---------- */
    .form-select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-color: var(--bg-subtle, var(--background-secondary));
      padding: 0 32px 0 12px;
      height: 34px;
      line-height: 34px;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .form-select option {
      font-family: var(--font-ui);
      font-size: 0.875rem;
      padding: 8px;
    }

    /* ---------- Category Toggle ---------- */
    .category-input-wrapper {
      display: flex;
      gap: 8px;
    }

    .category-input-wrapper .form-control {
      flex: 1;
      min-width: 0;
    }

    .category-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      flex-shrink: 0;
      background: var(--bg-subtle, var(--background-secondary));
      border: 1px solid var(--border, var(--border-color));
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: color var(--transition-fast), border-color var(--transition-fast);
    }

    .category-toggle-btn:hover {
      color: var(--accent, var(--primary-color));
      border-color: var(--accent, var(--primary-color));
    }

    .category-toggle-btn svg {
      width: 18px;
      height: 18px;
    }

    .error-message {
      font-size: 0.625rem;
      color: var(--danger, var(--error));
      font-weight: 500;
    }

    /* ---------- Image Upload ---------- */
    .image-upload-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      background: var(--bg-subtle, var(--background-secondary));
      border: 1px dashed var(--border, var(--border-color));
      border-radius: 6px;
      margin-top: 10px;
    }

    .image-type-selector {
      display: flex;
      gap: 12px;
    }

    .image-type-option {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
      max-height: 72px;
      overflow-y: auto;
      padding: 4px;
      background: var(--bg-surface, var(--surface-color));
      border: 1px solid var(--border, var(--border-color));
      border-radius: 6px;
    }

    .emoji-btn {
      font-size: 1rem;
      padding: 3px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast);
    }

    .emoji-btn:hover {
      background: var(--bg-subtle, var(--background-secondary));
    }

    .emoji-btn.selected {
      background: rgba(var(--accent-rgb), 0.1);
      border-color: var(--accent, var(--primary-color));
    }

    .file-upload-area {
      padding: 12px;
      border: 2px dashed var(--border, var(--border-color));
      border-radius: 6px;
      text-align: center;
      cursor: pointer;
      transition: border-color var(--transition-fast);
    }

    .file-upload-area:hover,
    .file-upload-area.dragover {
      border-color: var(--accent, var(--primary-color));
    }

    .upload-icon {
      width: 28px;
      height: 28px;
      margin-bottom: 6px;
      color: var(--text-muted);
    }

    .upload-title {
      font-size: 0.8125rem;
      font-weight: 600;
      margin: 0;
    }

    .upload-subtitle {
      font-size: 0.6875rem;
      color: var(--text-muted);
      margin: 4px 0 0;
    }

    .preview-image {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: 6px;
      margin: 0 auto 6px;
      border: 1px solid var(--border, var(--border-color));
    }

    .file-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .file-info { text-align: center; }
    .file-name { font-size: 0.8125rem; font-weight: 600; margin: 0; }
    .file-size { font-size: 0.6875rem; color: var(--text-muted); margin: 2px 0 0; }

    .upload-actions {
      display: flex;
      justify-content: center;
      margin-top: 6px;
    }

    /* ---------- Active Toggle ---------- */
    .active-toggle {
      margin-top: 8px;
    }

    .active-toggle label {
      display: flex;
      align-items: center;
      text-transform: none;
      letter-spacing: normal;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .form-checkbox {
      margin-right: 8px;
    }

    /* ---------- Footer ---------- */
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 10px 20px;
      border-top: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    /* ---------- Responsive ---------- */
    @media (max-width: 640px) {
      .dialog-header { padding: 14px 16px; }
      .dialog-body { padding: 16px; }
      .form-grid-2 { grid-template-columns: 1fr; }
      .form-grid-3 { grid-template-columns: 1fr; }
      .dialog-footer { padding: 10px 16px; }
      .emoji-grid { grid-template-columns: repeat(6, 1fr); }
    }

    @media (pointer: coarse) {
      .form-control {
        min-height: 40px;
        font-size: 0.9375rem;
      }

      .form-select {
        padding-right: 36px;
      }

      .dialog-close-btn {
        width: 44px;
        height: 44px;
      }

      .category-toggle-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .emoji-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .form-checkbox {
        width: 20px;
        height: 20px;
      }

      .image-type-option {
        padding: 10px 14px;
        min-height: 44px;
      }
    }
  `]
})
export class ProductEditorDialogComponent implements OnInit, OnDestroy {
  productForm: FormGroup;
  useCustomCategory = false;
  imageType: 'emoji' | 'file' = 'emoji';
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  isDragOver = false;
  isProcessingImage = false;

  private destroy$ = new Subject<void>();

  productEmojis = [
    '☕', '🥪', '🥐', '🍵', '🧁', '💧', '🥗', '🧃',
    '🍔', '🍕', '🌭', '🥙', '🌮', '🍤', '🍗', '🥘',
    '🍜', '🍝', '🍲', '🥣', '🍿', '🧀', '🥓', '🥖',
    '🍞', '🥯', '🥨', '🍪', '🎂', '🍰', '🧁', '🍫',
    '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵',
    '🥤', '🧋', '🍷', '🍺', '🍻', '🥂', '🍾', '🍸'
  ];

  constructor(
    public dialogRef: MatDialogRef<ProductEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProductEditorDialogData,
    private fb: FormBuilder
  ) {
    this.productForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      price: ['', [Validators.required, Validators.min(0.01)]],
      hotPrice: ['', [Validators.min(0.01)]],
      coldPrice: ['', [Validators.min(0.01)]],
      category: ['', Validators.required],
      stock: ['', [Validators.required, Validators.min(0)]],
      lowQuantityThreshold: [10, [Validators.required, Validators.min(0)]],
      image: ['📦', Validators.required],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    // Watch category changes for beverage price fields
    this.productForm.get('category')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(category => {
        const isBeverage = this.isBeverageCategory(category);
        const hotPriceControl = this.productForm.get('hotPrice');
        const coldPriceControl = this.productForm.get('coldPrice');

        if (isBeverage) {
          hotPriceControl?.setValidators([Validators.min(0.01)]);
          coldPriceControl?.setValidators([Validators.min(0.01)]);
        } else {
          hotPriceControl?.clearValidators();
          coldPriceControl?.clearValidators();
          hotPriceControl?.setValue('');
          coldPriceControl?.setValue('');
        }
        hotPriceControl?.updateValueAndValidity();
        coldPriceControl?.updateValueAndValidity();
      });

    // Populate form if editing
    if (this.data.product) {
      const product = this.data.product;
      const isBeverage = this.isBeverageCategory(product.category);

      if (this.isImageUrl(product.image)) {
        this.imageType = 'file';
        this.imagePreview = product.image;
      } else {
        this.imageType = 'emoji';
      }

      this.productForm.patchValue({
        name: product.name,
        price: product.price,
        category: product.category,
        stock: product.stock,
        lowQuantityThreshold: product.lowQuantityThreshold ?? 10,
        image: product.image,
        isActive: product.isActive ?? true,
        hotPrice: isBeverage ? (product.hotPrice ?? '') : '',
        coldPrice: isBeverage ? (product.coldPrice ?? '') : ''
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isBeverageCategory(category: string | null | undefined): boolean {
    if (!category) return false;
    const lower = category.toLowerCase();
    return ['beverages', 'beverage', 'coffee', 'non coffee', 'drinks', 'drink', 'tea', 'juice', 'smoothie', 'shake'].includes(lower);
  }

  toggleCategoryInput(): void {
    this.useCustomCategory = !this.useCustomCategory;
    if (this.useCustomCategory) {
      this.productForm.patchValue({ category: '' });
    }
  }

  selectEmoji(emoji: string): void {
    this.productForm.patchValue({ image: emoji });
  }

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
    if (file) this.handleFileSelection(file);
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
    if (files && files.length > 0) this.handleFileSelection(files[0]);
  }

  private handleFileSelection(file: File): void {
    if (!file.type.startsWith('image/')) return;

    this.isProcessingImage = true;
    this.compressAndResizeImage(file).then(compressedFile => {
      this.selectedFile = compressedFile;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
        this.productForm.patchValue({ image: e.target.result });
        this.isProcessingImage = false;
      };
      reader.readAsDataURL(compressedFile);
    }).catch(() => {
      this.isProcessingImage = false;
    });
  }

  private async compressAndResizeImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const maxWidth = 800;
        const maxHeight = 800;
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          } else {
            reject(new Error('Failed to compress image'));
          }
        }, 'image/jpeg', 0.8);
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
    return image.startsWith('data:image/') || image.startsWith('http') || image.startsWith('/uploads/') || image.startsWith('uploads/') || image.startsWith('/');
  }

  save(): void {
    if (this.productForm.invalid) {
      Object.keys(this.productForm.controls).forEach(key => {
        this.productForm.get(key)?.markAsTouched();
      });
      return;
    }
    this.dialogRef.close(this.productForm.value);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
