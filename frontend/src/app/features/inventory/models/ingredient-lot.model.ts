export interface IngredientLot {
  id: string;
  ingredientId: string;
  supplier?: string;
  unitCost: number;
  initialQuantity: number;
  remainingQuantity: number;
  expirationDate?: string;
  receivedAt: string;
  lotNumber?: string;
  notes?: string;
  isActive: boolean;
}

export interface IngredientLotDto {
  supplier?: string;
  unitCost: number;
  quantity: number;
  expirationDate?: string;
  lotNumber?: string;
  notes?: string;
}

export interface IngredientLotUpdateDto {
  supplier?: string;
  expirationDate?: string;
  lotNumber?: string;
  notes?: string;
}
