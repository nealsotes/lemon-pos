export enum MovementType {
  Purchase = 0,
  Sale = 1,
  Adjustment = 2,
  Waste = 3,
  Return = 4
}

export interface StockMovement {
  id: string;
  ingredientId: string;
  movementType: MovementType;
  quantity: number;
  unitCost?: number;
  reason?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string; // ISO date string
}

export const MovementTypeLabels: Record<MovementType, string> = {
  [MovementType.Purchase]: 'Purchase',
  [MovementType.Sale]: 'Sale',
  [MovementType.Adjustment]: 'Adjustment',
  [MovementType.Waste]: 'Waste',
  [MovementType.Return]: 'Return'
};





