import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Transaction } from '../../models/transaction.model';
import { ThermalPrinterService } from '../../services/thermal-printer.service';

@Component({
  selector: 'app-receipt',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './receipt.component.html',
  styleUrls: ['./receipt.component.css']
})
export class ReceiptComponent implements OnInit {
  transaction: any = null;
  showPrintButton = true;
  isPrinting = false;
  printError: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private thermalPrinter: ThermalPrinterService
  ) {}

  ngOnInit(): void {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.transaction = navigation.extras.state['transaction'];
    } else {
      this.transaction = this.getMockTransaction();
    }
  }

  private getMockTransaction(): any {
    return {
      id: 1,
      timestamp: new Date().toISOString(),
      items: [
        { productId: '1', name: 'Sample Product', price: 10.00, quantity: 2 }
      ],
      total: 22.40,
      paymentMethod: 'cash',
      customerInfo: { name: 'Sample Customer', email: '', phone: '', discountType: 'none' },
      status: 'completed',
      notes: '',
      amountReceived: 25.00,
      change: 2.60
    };
  }

  formatPrice(price: number): string {
    if (price === undefined || price === null || isNaN(price)) return '₱0.00';
    return `₱${price.toFixed(2)}`;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getReceiptNumber(): string | number {
    if (!this.transaction) return 'N/A';
    // Prefer daily receipt number if available
    const receiptNumber = this.transaction.receiptNumber || this.transaction.ReceiptNumber;
    if (receiptNumber !== undefined && receiptNumber !== null) {
      return receiptNumber;
    }
    // Fallback to transaction ID
    return this.transaction.id || this.transaction.Id || 'N/A';
  }

  getPaymentMethodDisplay(paymentMethod: string): string {
    if (!paymentMethod) return 'Cash';
    const method = paymentMethod.toLowerCase();
    switch (method) {
      case 'cash':
        return 'Cash';
      case 'card':
        return 'Card';
      case 'mobile':
        return 'Mobile Payment';
      default:
        return paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
    }
  }

  getSubtotal(): number {
    if (!this.transaction?.items) return 0;
    return this.transaction.items.reduce((sum: number, item: any) => {
      return sum + (item.price * item.quantity);
    }, 0);
  }

  getDiscountTotal(): number {
    if (!this.transaction?.items) return 0;
    return this.transaction.items.reduce((sum: number, item: any) => {
      const itemTotal = item.price * item.quantity;
      const discountedTotal = item.discount ? (itemTotal - item.discount.amount) : itemTotal;
      return sum + (itemTotal - discountedTotal);
    }, 0);
  }

  getVATAmount(): number {
    const subtotal = this.getSubtotal();
    const discount = this.getDiscountTotal();
    const subtotalAfterDiscount = subtotal - discount;
    const vatRate = 0.12; // 12% VAT in Philippines
    return subtotalAfterDiscount * vatRate;
  }

  getTemperature(item: any): string | null {
    if (!item) return null;
    const temp = item.temperature;
    if (!temp && temp !== 0) return null;
    
    // Handle number enum (0=None, 1=Hot, 2=Cold)
    if (typeof temp === 'number') {
      if (temp === 1) return 'hot';
      if (temp === 2) return 'cold';
      return null;
    }
    
    // Handle string
    if (typeof temp === 'string') {
      const lowerTemp = temp.toLowerCase();
      if (lowerTemp === 'hot' || lowerTemp === '1') return 'hot';
      if (lowerTemp === 'cold' || lowerTemp === 'iced' || lowerTemp === '2') return 'cold';
      if (lowerTemp === 'none' || lowerTemp === '0' || lowerTemp === '') return null;
      return lowerTemp;
    }
    
    return null;
  }

  isHot(item: any): boolean {
    const temp = this.getTemperature(item);
    return temp === 'hot';
  }

  isCold(item: any): boolean {
    const temp = this.getTemperature(item);
    return temp === 'cold' || temp === 'iced';
  }

  printReceipt(): void {
    // Use thermal printer instead of browser print dialog
    this.printThermalReceipt(true);
  }

  async printThermalReceipt(openDrawer: boolean = true): Promise<void> {
    this.isPrinting = true;
    this.printError = null;

    try {
      await this.thermalPrinter.printReceipt(this.transaction, openDrawer);
      // Show success message briefly
      this.printError = null;
    } catch (error: any) {
      this.printError = error.message || 'Failed to print to thermal printer';
      
      // Show error message to user
      alert(this.printError + '\n\nPlease ensure:\n1. Backend server is running\n2. Printer is configured on the server\n3. Printer is connected and has paper\n\nOr configure QZ Tray/Bluetooth in Printer Settings');
    } finally {
      this.isPrinting = false;
    }
  }

  async openDrawer(): Promise<void> {
    try {
      await this.thermalPrinter.openCashDrawer();
    } catch (error: any) {
      alert(error.message || 'Failed to open cash drawer');
    }
  }

  goBackToPOS(): void {
    this.router.navigate(['/pos']);
  }

  goToReports(): void {
    this.router.navigate(['/reports']);
  }
}
