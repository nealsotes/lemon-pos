import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Ingredient } from '../../models/ingredient.model';
import { IngredientService } from '../../services/ingredient.service';
import { DeleteConfirmationDialogComponent, DeleteConfirmationData } from '../product-management/delete-confirmation-dialog.component';
import { StockMovementHistoryComponent } from './stock-movement-history.component';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatChipsModule,
    MatDialogModule
  ],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.css']
})
export class InventoryComponent implements OnInit {
  ingredients: Ingredient[] = [];
  filteredIngredients: Ingredient[] = [];
  ingredientForm: FormGroup;
  editingIngredient: Ingredient | null = null;
  isLoading = true;
  showForm = false;
  
  searchTerm: string = '';
  
  displayedColumns: string[] = ['name', 'quantity', 'unit', 'supplier', 'expirationDate', 'lowStockThreshold', 'status', 'actions'];
  
  units = ['kg', 'g', 'L', 'ml', 'pcs', 'pack', 'bottle', 'can'];
  
  get isPieceUnit(): boolean {
    const unit = this.ingredientForm.get('unit')?.value;
    return unit === 'pcs' || unit === 'piece' || unit === 'pieces';
  }

  get totalCost(): number {
    const quantity = parseFloat(this.ingredientForm.get('quantity')?.value || '0');
    const unitCost = parseFloat(this.ingredientForm.get('unitCost')?.value || '0');
    return quantity * unitCost;
  }

  calculateTotalCost(ingredient: Ingredient): number {
    return (ingredient.unitCost || 0) * ingredient.quantity;
  }

  constructor(
    private fb: FormBuilder,
    private ingredientService: IngredientService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.ingredientForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      quantity: ['', [Validators.required, Validators.min(0)]],
      unit: ['', Validators.required],
      supplier: [''],
      expirationDate: [''],
      lowStockThreshold: ['', [Validators.required, Validators.min(0)]],
      unitCost: ['', [Validators.min(0)]],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.loadIngredients();
  }

  loadIngredients(): void {
    this.isLoading = true;
    this.ingredientService.getAllIngredients().subscribe({
      next: (ingredients) => {
        this.ingredients = ingredients;
        this.filteredIngredients = ingredients;
        this.isLoading = false;
      },
      error: (error) => {
        this.snackBar.open('Error loading ingredients: ' + error.message, 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        this.isLoading = false;
      }
    });
  }

  applyFilter(): void {
    const search = this.searchTerm.toLowerCase().trim();
    this.filteredIngredients = this.ingredients.filter(ingredient =>
      ingredient.name.toLowerCase().includes(search) ||
      (ingredient.supplier && ingredient.supplier.toLowerCase().includes(search)) ||
      ingredient.unit.toLowerCase().includes(search)
    );
  }

  openAddForm(): void {
    this.editingIngredient = null;
    this.ingredientForm.reset({
      name: '',
      quantity: '',
      unit: '',
      supplier: '',
      expirationDate: '',
      lowStockThreshold: '',
      unitCost: '',
      isActive: true
    });
    this.showForm = true;
    this.setupQuantityValidation();
  }

  openEditForm(ingredient: Ingredient): void {
    this.editingIngredient = ingredient;
    this.ingredientForm.patchValue({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      supplier: ingredient.supplier || '',
      expirationDate: ingredient.expirationDate ? ingredient.expirationDate.split('T')[0] : '',
      lowStockThreshold: ingredient.lowStockThreshold,
      unitCost: ingredient.unitCost || '',
      isActive: ingredient.isActive
    });
    this.showForm = true;
    this.setupQuantityValidation();
  }
  
  setupQuantityValidation(): void {
    // Watch for unit changes and update quantity validation
    this.ingredientForm.get('unit')?.valueChanges.subscribe(unit => {
      const quantityControl = this.ingredientForm.get('quantity');
      if (quantityControl) {
        if (unit === 'pcs' || unit === 'piece' || unit === 'pieces') {
          // For pieces, require whole numbers
          quantityControl.setValidators([
            Validators.required,
            Validators.min(0),
            (control) => {
              const value = control.value;
              if (value !== null && value !== '' && value % 1 !== 0) {
                return { wholeNumber: true };
              }
              return null;
            }
          ]);
        } else {
          // For other units, allow decimals
          quantityControl.setValidators([Validators.required, Validators.min(0)]);
        }
        quantityControl.updateValueAndValidity();
      }
      
      // Also validate threshold
      const thresholdControl = this.ingredientForm.get('lowStockThreshold');
      if (thresholdControl) {
        if (unit === 'pcs' || unit === 'piece' || unit === 'pieces') {
          thresholdControl.setValidators([
            Validators.required,
            Validators.min(0),
            (control) => {
              const value = control.value;
              if (value !== null && value !== '' && value % 1 !== 0) {
                return { wholeNumber: true };
              }
              return null;
            }
          ]);
        } else {
          thresholdControl.setValidators([Validators.required, Validators.min(0)]);
        }
        thresholdControl.updateValueAndValidity();
      }
    });
  }

  cancelEdit(): void {
    this.showForm = false;
    this.editingIngredient = null;
    this.ingredientForm.reset();
  }

  saveIngredient(): void {
    if (this.ingredientForm.invalid) {
      this.snackBar.open('Please fill in all required fields correctly', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const formValue = this.ingredientForm.value;
    const isPiece = formValue.unit === 'pcs' || formValue.unit === 'piece' || formValue.unit === 'pieces';
    
    const ingredientData: any = {
      name: formValue.name,
      quantity: isPiece ? parseInt(formValue.quantity) : parseFloat(formValue.quantity),
      unit: formValue.unit,
      supplier: formValue.supplier && formValue.supplier.trim() ? formValue.supplier.trim() : null,
      expirationDate: formValue.expirationDate ? new Date(formValue.expirationDate + 'T00:00:00').toISOString() : null,
      lowStockThreshold: isPiece ? parseInt(formValue.lowStockThreshold) : parseFloat(formValue.lowStockThreshold),
      isActive: formValue.isActive !== false
    };
    
    // Only include id for updates
    if (this.editingIngredient) {
      ingredientData.id = this.editingIngredient.id;
    }

    if (this.editingIngredient) {
      // For update, send only the fields that can be updated
      const updateData: any = {
        name: formValue.name,
        quantity: parseFloat(formValue.quantity),
        unit: formValue.unit,
        supplier: formValue.supplier && formValue.supplier.trim() ? formValue.supplier.trim() : null,
        expirationDate: formValue.expirationDate ? new Date(formValue.expirationDate + 'T00:00:00').toISOString() : null,
        lowStockThreshold: parseFloat(formValue.lowStockThreshold),
        unitCost: formValue.unitCost ? parseFloat(formValue.unitCost) : null,
        isActive: formValue.isActive !== false
      };
      
      this.ingredientService.updateIngredient(this.editingIngredient.id, updateData).subscribe({
        next: () => {
          this.snackBar.open('Ingredient updated successfully', 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadIngredients();
          this.cancelEdit();
        },
        error: (error) => {
          const errorMessage = error.error?.message || error.message || 'Unknown error';
          this.snackBar.open('Error updating ingredient: ' + errorMessage, 'Close', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      });
    } else {
      // For create, don't send id, createdAt, updatedAt
      const createData: any = {
        name: formValue.name,
        quantity: parseFloat(formValue.quantity),
        unit: formValue.unit,
        supplier: formValue.supplier && formValue.supplier.trim() ? formValue.supplier.trim() : null,
        expirationDate: formValue.expirationDate ? new Date(formValue.expirationDate + 'T00:00:00').toISOString() : null,
        lowStockThreshold: parseFloat(formValue.lowStockThreshold),
        unitCost: formValue.unitCost ? parseFloat(formValue.unitCost) : null,
        isActive: formValue.isActive !== false
      };
      
      this.ingredientService.createIngredient(createData).subscribe({
        next: () => {
          this.snackBar.open('Ingredient added successfully', 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.loadIngredients();
          this.cancelEdit();
        },
        error: (error) => {
          let errorMessage = 'Unknown error';
          if (error.error?.errors && Array.isArray(error.error.errors)) {
            errorMessage = error.error.errors.join(', ');
          } else if (error.error?.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          this.snackBar.open('Error adding ingredient: ' + errorMessage, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      });
    }
  }

  deleteIngredient(ingredient: Ingredient): void {
    const dialogData: DeleteConfirmationData = {
      productName: ingredient.name,
      productId: ingredient.id
    };

    const dialogRef = this.dialog.open(DeleteConfirmationDialogComponent, {
      width: '400px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.ingredientService.deleteIngredient(ingredient.id).subscribe({
          next: () => {
            this.snackBar.open('Ingredient deleted successfully', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadIngredients();
          },
          error: (error) => {
            this.snackBar.open('Error deleting ingredient: ' + error.message, 'Close', {
              duration: 3000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    });
  }

  isLowStock(ingredient: Ingredient): boolean {
    return ingredient.quantity <= ingredient.lowStockThreshold;
  }

  isExpired(ingredient: Ingredient): boolean {
    if (!ingredient.expirationDate) return false;
    return new Date(ingredient.expirationDate) < new Date();
  }

  isExpiringSoon(ingredient: Ingredient, days: number = 7): boolean {
    if (!ingredient.expirationDate) return false;
    const expirationDate = new Date(ingredient.expirationDate);
    const today = new Date();
    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration > 0 && daysUntilExpiration <= days;
  }

  getLowStockCount(): number {
    return this.ingredients.filter(i => this.isLowStock(i)).length;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  }

  adjustQuantity(ingredient: Ingredient, adjustment: number): void {
    const newQuantity = ingredient.quantity + adjustment;
    if (newQuantity < 0) {
      this.snackBar.open('Cannot reduce quantity below 0', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    this.ingredientService.adjustQuantity(ingredient.id, adjustment).subscribe({
      next: () => {
        this.snackBar.open(`Quantity ${adjustment >= 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment)}`, 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.loadIngredients();
      },
      error: (error) => {
        let errorMessage = 'Unknown error';
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        this.snackBar.open('Error adjusting quantity: ' + errorMessage, 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  openAdjustQuantityDialog(ingredient: Ingredient): void {
    // Simple prompt for now - could be enhanced with a proper dialog component
    const adjustment = prompt(`Adjust quantity for "${ingredient.name}"\nCurrent: ${ingredient.quantity} ${ingredient.unit}\n\nEnter adjustment amount (negative to reduce, positive to add):`);
    
    if (adjustment !== null && adjustment !== '') {
      const adjustmentValue = parseFloat(adjustment);
      if (isNaN(adjustmentValue)) {
        this.snackBar.open('Please enter a valid number', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        return;
      }
      this.adjustQuantity(ingredient, adjustmentValue);
    }
  }

  viewStockHistory(ingredient: Ingredient): void {
    this.dialog.open(StockMovementHistoryComponent, {
      width: '900px',
      maxWidth: '95vw',
      data: { ingredient },
      disableClose: false
    });
  }
}


