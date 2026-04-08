import { AddOn } from '../../checkout/models/cart-item.model';

export interface Product {
  id: string;
  name: string;
  price: number;
  hotPrice?: number;
  coldPrice?: number;
  category: string;
  stock: number;
  lowQuantityThreshold?: number;
  image: string;
  isActive?: boolean;
  hasHotCold?: boolean;
  hasAddOns?: boolean;
  addOns?: AddOn[];
}




