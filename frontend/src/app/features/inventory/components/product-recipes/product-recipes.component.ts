import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Product } from '../../../pos/models/product.model';
import { Ingredient } from '../../../pos/models/ingredient.model';
import { ProductService } from '../../../pos/services/product.service';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { RecipeService } from '../../../pos/services/recipe.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { SearchInputComponent } from '../../../../shared/ui/search-input/search-input.component';
import { RecipeEditorDialogComponent } from './recipe-editor-dialog.component';

@Component({
  selector: 'app-product-recipes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopBarComponent,
    ButtonComponent,
    LoadingSpinnerComponent,
    SearchInputComponent,
    MatDialogModule
  ],
  templateUrl: './product-recipes.component.html',
  styleUrls: ['./product-recipes.component.css']
})
export class ProductRecipesComponent implements OnInit {
  @Input() showHeader = true;

  products: Product[] = [];
  ingredients: Ingredient[] = [];
  isLoadingProducts = true;
  isLoadingIngredients = true;

  productSearchTerm: string = '';
  productRecipeCounts: Record<string, number> = {};

  constructor(
    private productService: ProductService,
    private ingredientService: IngredientService,
    private recipeService: RecipeService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.productService.getProducts().subscribe(products => {
      this.products = products || [];
      this.isLoadingProducts = false;
      this.loadRecipeCounts();
    });
    this.ingredientService.getAllIngredients().subscribe({
      next: ingredients => {
        this.ingredients = ingredients || [];
        this.isLoadingIngredients = false;
      },
      error: () => this.isLoadingIngredients = false
    });
  }

  loadRecipeCounts(): void {
    for (const product of this.products) {
      this.recipeService.getRecipe(product.id).subscribe({
        next: lines => {
          this.productRecipeCounts[product.id] = lines.length;
        },
        error: () => {
          this.productRecipeCounts[product.id] = 0;
        }
      });
    }
  }

  get filteredProducts(): Product[] {
    if (!this.productSearchTerm.trim()) return this.products;
    const term = this.productSearchTerm.toLowerCase().trim();
    return this.products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term)
    );
  }

  openRecipeDialog(product: Product): void {
    const dialogRef = this.dialog.open(RecipeEditorDialogComponent, {
      width: '680px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: {
        product,
        ingredients: this.ingredients
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(() => {
      // Refresh recipe count for this product
      this.recipeService.getRecipe(product.id).subscribe({
        next: lines => {
          this.productRecipeCounts[product.id] = lines.length;
        }
      });
    });
  }

  getProductColor(name: string): string {
    const colors = [
      '#7C3AED', '#6366F1', '#2563EB', '#0891B2', '#059669',
      '#D97706', '#DC2626', '#DB2777', '#9333EA', '#4F46E5'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
