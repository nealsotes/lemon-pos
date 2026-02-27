export interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  quantityPerUnit: number;
  unit: string;
  sortOrder?: number;
}

export interface RecipeLineRequest {
  ingredientId: string;
  quantityPerUnit: number;
}

export interface RecipeUpdateRequest {
  lines: RecipeLineRequest[];
}
