export interface AddOn {
  name: string;
  price: number;
  quantity?: number; // Defaults to 1 if not specified
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  basePrice?: number;
  quantity: number;
  total: number;
  image: string;
  category: string;
  stock: number;
  temperature?: 'hot' | 'cold' | null;
  addOns?: AddOn[];
  discount?: {
    type: 'senior' | 'pwd' | 'manual';
    percentage: number;
    amount: number;
  };
}




