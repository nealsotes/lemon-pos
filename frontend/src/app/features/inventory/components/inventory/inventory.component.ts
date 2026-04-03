import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { StockMovementHistoryComponent } from './stock-movement-history.component';
import { IngredientEditorDialogComponent } from './ingredient-editor-dialog.component';
import { StockAdjustmentDialogComponent, StockAdjustmentResult } from './stock-adjustment-dialog.component';
import { IngredientLotsDialogComponent } from './ingredient-lots-dialog.component';
import { ProductRecipesComponent } from '../product-recipes/product-recipes.component';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { DataTableComponent, TableColumn } from '../../../../shared/ui/data-table/data-table.component';
import { CellDefDirective } from '../../../../shared/ui/data-table/cell-def.directive';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { SearchInputComponent } from '../../../../shared/ui/search-input/search-input.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent,
    ProductRecipesComponent,
    FormsModule,
    MatDialogModule,
    LoadingSpinnerComponent,
    DataTableComponent,
    CellDefDirective,
    BadgeComponent,
    ButtonComponent,
    SearchInputComponent
  ],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.css']
})
export class InventoryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  ingredients: Ingredient[] = [];
  filteredIngredients: Ingredient[] = [];
  isLoading = true;

  activeTab: 'ingredients' | 'recipes' = 'ingredients';
  searchTerm: string = '';

  tableColumns: TableColumn[] = [
    { key: 'name', label: 'Ingredient', cellTemplate: 'ingredient' },
    { key: 'quantity', label: 'On Hand', cellTemplate: 'onHand' },
    { key: 'unitCost', label: 'Unit Cost', cellTemplate: 'unitCost' },
    { key: 'totalValue', label: 'Total Value', cellTemplate: 'totalValue' },
    { key: 'supplier', label: 'Supplier', cellTemplate: 'supplier' },
    { key: 'expirationDate', label: 'Expiration', cellTemplate: 'expiration' },
    { key: 'status', label: 'Status', cellTemplate: 'status' },
    { key: 'actions', label: '', cellTemplate: 'actions', width: '100px', align: 'right' as const }
  ];

  calculateTotalCost(ingredient: Ingredient): number {
    return (ingredient.unitCost || 0) * ingredient.quantity;
  }

  constructor(
    private ingredientService: IngredientService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadIngredients();
  }

  loadIngredients(): void {
    this.isLoading = true;
    this.ingredientService.getAllIngredients().pipe(takeUntil(this.destroy$)).subscribe({
      next: (ingredients) => {
        this.ingredients = ingredients;
        this.filteredIngredients = ingredients;
        this.isLoading = false;
      },
      error: (error) => {
        this.toast.error('Error loading ingredients: ' + error.message);
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
    this.openIngredientDialog(null);
  }

  openEditForm(ingredient: Ingredient): void {
    this.openIngredientDialog(ingredient);
  }

  private openIngredientDialog(ingredient: Ingredient | null): void {
    const dialogRef = this.dialog.open(IngredientEditorDialogComponent, {
      width: '620px',
      maxWidth: '95vw',
      data: { ingredient },
      disableClose: false
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(formValue => {
      if (!formValue) return;
      this.saveIngredient(formValue, ingredient);
    });
  }

  private saveIngredient(formValue: any, editingIngredient: Ingredient | null): void {
    const isPiece = formValue.unit === 'pcs' || formValue.unit === 'piece' || formValue.unit === 'pieces';

    if (editingIngredient) {
      const updateData: any = {
        name: formValue.name,
        quantity: isPiece ? parseInt(formValue.quantity) : parseFloat(formValue.quantity),
        unit: formValue.unit,
        supplier: formValue.supplier && formValue.supplier.trim() ? formValue.supplier.trim() : null,
        expirationDate: formValue.expirationDate ? new Date(formValue.expirationDate + 'T00:00:00').toISOString() : null,
        lowStockThreshold: isPiece ? parseInt(formValue.lowStockThreshold) : parseFloat(formValue.lowStockThreshold),
        unitCost: formValue.unitCost ? parseFloat(formValue.unitCost) : null,
        isActive: formValue.isActive !== false
      };

      this.ingredientService.updateIngredient(editingIngredient.id, updateData).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.toast.success('Ingredient updated successfully');
          this.loadIngredients();
        },
        error: (error) => {
          const errorMessage = error.error?.message || error.message || 'Unknown error';
          this.toast.error('Error updating ingredient: ' + errorMessage);
        }
      });
    } else {
      const createData: any = {
        name: formValue.name,
        quantity: isPiece ? parseInt(formValue.quantity) : parseFloat(formValue.quantity),
        unit: formValue.unit,
        supplier: formValue.supplier && formValue.supplier.trim() ? formValue.supplier.trim() : null,
        expirationDate: formValue.expirationDate ? new Date(formValue.expirationDate + 'T00:00:00').toISOString() : null,
        lowStockThreshold: isPiece ? parseInt(formValue.lowStockThreshold) : parseFloat(formValue.lowStockThreshold),
        unitCost: formValue.unitCost ? parseFloat(formValue.unitCost) : null,
        isActive: formValue.isActive !== false
      };

      this.ingredientService.createIngredient(createData).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.toast.success('Ingredient added successfully');
          this.loadIngredients();
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
          this.toast.error('Error adding ingredient: ' + errorMessage);
        }
      });
    }
  }

  async deleteIngredient(ingredient: Ingredient): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete Ingredient',
      message: `Are you sure you want to delete "${ingredient.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      this.ingredientService.deleteIngredient(ingredient.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.toast.success('Ingredient deleted successfully');
          this.loadIngredients();
        },
        error: (error) => {
          this.toast.error('Error deleting ingredient: ' + error.message);
        }
      });
    }
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
    return new Date(dateString).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getDaysUntilExpiry(ingredient: Ingredient): number {
    if (!ingredient.expirationDate) return 999;
    const expDate = new Date(ingredient.expirationDate);
    const today = new Date();
    return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  getStockLevel(ingredient: Ingredient): number {
    if (ingredient.lowStockThreshold <= 0) return 100;
    const ratio = ingredient.quantity / (ingredient.lowStockThreshold * 3);
    return Math.min(Math.max(ratio * 100, 0), 100);
  }

  getIngredientColor(name: string): string {
    const colors = [
      '#7C3AED', '#6366F1', '#2563EB', '#0891B2', '#059669',
      '#D97706', '#DC2626', '#DB2777', '#7C3AED', '#4F46E5'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  adjustQuantity(ingredient: Ingredient, defaultAdjustment?: number): void {
    const dialogRef = this.dialog.open(StockAdjustmentDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data: { ingredient, defaultAdjustment }
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((result: StockAdjustmentResult | undefined) => {
      if (!result) return;

      this.ingredientService.adjustQuantity(
        ingredient.id,
        result.adjustment,
        result.movementType,
        result.reason,
        result.notes || undefined,
        result.supplier,
        result.unitCost,
        result.expirationDate,
        result.lotNumber
      ).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.toast.success(`${result.reason}: ${Math.abs(result.adjustment)} ${ingredient.unit}`);
          this.loadIngredients();
        },
        error: (error) => {
          let errorMessage = 'Unknown error';
          if (error.error?.message) {
            errorMessage = error.error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          this.toast.error('Error adjusting quantity: ' + errorMessage);
        }
      });
    });
  }

  viewStockHistory(ingredient: Ingredient): void {
    this.dialog.open(StockMovementHistoryComponent, {
      width: '900px',
      maxWidth: '95vw',
      data: { ingredient },
      disableClose: false
    });
  }

  viewLots(ingredient: Ingredient): void {
    this.dialog.open(IngredientLotsDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      data: { ingredient },
      disableClose: false
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

