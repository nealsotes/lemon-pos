import { CartItem } from './cart-item.model';

export interface OpenOrder {
  id: number;
  name: string;
  items: CartItem[];
  createdAt: string;
}

