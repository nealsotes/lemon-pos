export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string; // kg, g, L, pieces
  supplier?: string;
  expirationDate?: string; // ISO date string
  lowStockThreshold: number;
  unitCost?: number; // Cost per unit
  lastPurchaseDate?: string; // ISO date string - when last purchased
  lastPurchaseCost?: number; // Cost from last purchase
  totalCost?: number; // Computed: quantity × unitCost
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}


