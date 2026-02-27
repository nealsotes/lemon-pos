import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../../pos/models/product.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { RecipeLine, RecipeLineRequest } from '../../../pos/models/recipe.model';
import { ProductService } from '../../../pos/services/product.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { RecipeService } from '../../../pos/services/recipe.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-product-recipes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent
  ],
  templateUrl: './product-recipes.component.html',
  styleUrls: ['./product-recipes.component.css']
})
export class ProductRecipesComponent implements OnInit {
  @Input() showHeader = true;

  products: Product[] = [];
  ingredients: Ingredient[] = [];
  selectedProductId: string = '';
  selectedProduct: Product | null = null;
  recipeLines: RecipeLine[] = [];
  workingLines: { ingredientId: string; ingredientName: string; unit: string; quantityPerUnit: number }[] = [];
  isLoadingProducts = true;
  isLoadingIngredients = true;
  isLoadingRecipe = false;
  isSaving = false;

  addIngredientId = '';
  addQuantityPerUnit: number | null = null;

  displayedColumns: string[] = ['ingredientName', 'unit', 'quantityPerUnit', 'actions'];

  constructor(
    private productService: ProductService,
    private ingredientService: IngredientService,
    private recipeService: RecipeService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.productService.getProducts().subscribe(products => {
      this.products = products || [];
      this.isLoadingProducts = false;
    });
    this.ingredientService.getAllIngredients().subscribe({
      next: ingredients => {
        this.ingredients = ingredients || [];
        this.isLoadingIngredients = false;
      },
      error: () => this.isLoadingIngredients = false
    });
  }

  onProductChange(): void {
    this.selectedProductId = this.selectedProductId || '';
    this.selectedProduct = this.products.find(p => p.id === this.selectedProductId) || null;
    this.workingLines = [];
    if (!this.selectedProductId) {
      return;
    }
    this.isLoadingRecipe = true;
    this.recipeService.getRecipe(this.selectedProductId).subscribe({
      next: lines => {
        this.recipeLines = lines;
        this.workingLines = lines.map(l => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          unit: l.unit,
          quantityPerUnit: l.quantityPerUnit
        }));
        this.isLoadingRecipe = false;
      },
      error: err => {
        this.snackBar.open(err?.message || 'Failed to load recipe', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        this.isLoadingRecipe = false;
      }
    });
  }

  addLine(): void {
    if (!this.addIngredientId || this.addQuantityPerUnit == null || this.addQuantityPerUnit <= 0) {
      this.snackBar.open('Select an ingredient and enter a positive quantity per unit.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    const ing = this.ingredients.find(i => i.id === this.addIngredientId);
    if (!ing) return;
    if (this.workingLines.some(l => l.ingredientId === this.addIngredientId)) {
      this.snackBar.open('This ingredient is already in the recipe.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    this.workingLines = [
      ...this.workingLines,
      {
        ingredientId: ing.id,
        ingredientName: ing.name,
        unit: ing.unit,
        quantityPerUnit: this.addQuantityPerUnit
      }
    ];
    this.addIngredientId = '';
    this.addQuantityPerUnit = null;
  }

  removeLine(index: number): void {
    this.workingLines = this.workingLines.filter((_, i) => i !== index);
  }

  saveRecipe(): void {
    if (!this.selectedProductId) {
      this.snackBar.open('Select a product first.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }
    const lines: RecipeLineRequest[] = this.workingLines.map(l => ({
      ingredientId: l.ingredientId,
      quantityPerUnit: l.quantityPerUnit
    }));
    this.isSaving = true;
    this.recipeService.setRecipe(this.selectedProductId, { lines }).subscribe({
      next: () => {
        this.snackBar.open('Recipe saved successfully.', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.recipeLines = this.workingLines.map(l => ({
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          quantityPerUnit: l.quantityPerUnit,
          unit: l.unit,
          sortOrder: 0
        }));
        this.isSaving = false;
      },
      error: err => {
        this.snackBar.open(err?.message || 'Failed to save recipe', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isSaving = false;
      }
    });
  }

  get hasChanges(): boolean {
    if (this.recipeLines.length !== this.workingLines.length) return true;
    for (let i = 0; i < this.workingLines.length; i++) {
      const a = this.recipeLines[i];
      const b = this.workingLines[i];
      if (!a || !b || a.ingredientId !== b.ingredientId || a.quantityPerUnit !== b.quantityPerUnit) return true;
    }
    return false;
  }
}
