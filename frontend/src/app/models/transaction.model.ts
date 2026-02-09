export interface AddOn {
  name: string;
  price: number;
  quantity?: number; // Defaults to 1 if not specified
}

export interface TransactionItem {
  productId: string;
  name: string;
  category?: string; // Added to preserve historical product category
  price: number;
  basePrice?: number;
  quantity: number;
  temperature?: 'hot' | 'cold' | null;
  addOns?: AddOn[];
  discount?: {
    type: 'senior' | 'pwd' | 'manual';
    percentage: number;
    amount: number;
  };
}

export interface CustomerInfo {
  name: string;
  phone?: string;
  email?: string;
  discountType: 'senior' | 'pwd' | 'manual' | 'none';
  discountId?: string; // For ID number validation
}

export interface Transaction {
  id: number;
  timestamp: string;
  items: TransactionItem[];
  total: number;
  paymentMethod: string;
  serviceType?: 'dineIn' | 'takeOut';
  serviceFee?: number;
  customerInfo: CustomerInfo;
  status: 'completed' | 'pending';
  notes?: string;
  amountReceived?: number;
  change?: number;
}

