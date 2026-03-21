import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../../pos/models/product.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { RecipeLine, RecipeLineRequest } from '../../../pos/models/recipe.model';
import { ProductService } from '../../../pos/services/product.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { RecipeService } from '../../../pos/services/recipe.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ToastService } from '../../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-product-recipes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopBarComponent
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
    private toast: ToastService
  ) { }

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
        this.toast.error(err?.message || 'Failed to load recipe');
        this.isLoadingRecipe = false;
      }
    });
  }

  addLine(): void {
    if (!this.addIngredientId || this.addQuantityPerUnit == null || this.addQuantityPerUnit <= 0) {
      this.toast.error('Select an ingredient and enter a positive quantity per unit.');
      return;
    }
    const ing = this.ingredients.find(i => i.id === this.addIngredientId);
    if (!ing) return;
    if (this.workingLines.some(l => l.ingredientId === this.addIngredientId)) {
      this.toast.error('This ingredient is already in the recipe.');
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
      this.toast.error('Select a product first.');
      return;
    }
    const lines: RecipeLineRequest[] = this.workingLines.map(l => ({
      ingredientId: l.ingredientId,
      quantityPerUnit: l.quantityPerUnit
    }));
    this.isSaving = true;
    this.recipeService.setRecipe(this.selectedProductId, { lines }).subscribe({
      next: () => {
        this.toast.success('Recipe saved successfully.');
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
        this.toast.error(err?.message || 'Failed to save recipe');
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

  getRecipeCost(): number {
    return this.workingLines.reduce((acc, line) => {
      const ingredient = this.ingredients.find(i => i.id === line.ingredientId);
      return acc + (ingredient?.unitCost || 0) * line.quantityPerUnit;
    }, 0);
  }

  getLineCost(line: { ingredientId: string; quantityPerUnit: number }): number {
    const ingredient = this.ingredients.find(i => i.id === line.ingredientId);
    return (ingredient?.unitCost || 0) * line.quantityPerUnit;
  }
}
