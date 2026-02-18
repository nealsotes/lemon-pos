import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThermalPrinterService } from '../../services/thermal-printer.service';
import { QrCodeGeneratorComponent } from '../qr-code-generator/qr-code-generator.component';

@Component({
  selector: 'app-printer-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, QrCodeGeneratorComponent],
  templateUrl: './printer-settings.component.html',
  styleUrls: ['./printer-settings.component.css']
})
export class PrinterSettingsComponent implements OnInit {
  printers: string[] = [];
  selectedPrinter: string | null = null;
  isLoading = false;
  qzTrayStatus: 'checking' | 'connected' | 'disconnected' = 'checking';
  qzTrayVersion: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isBluetoothAvailable = false;

  constructor(public thermalPrinter: ThermalPrinterService) {}

  async ngOnInit(): Promise<void> {
    this.selectedPrinter = this.thermalPrinter.getPrinter();
    this.isBluetoothAvailable = this.thermalPrinter.isBluetoothAvailable();
    
    // Check if Bluetooth is already connected
    if (this.isBluetoothAvailable && this.thermalPrinter.isBluetoothConnected()) {
      this.qzTrayStatus = 'connected';
      this.qzTrayVersion = await this.thermalPrinter.getQZTrayVersion();
      return;
    }
    
    // Don't check QZ Tray on Android if Bluetooth not available
    // (Android doesn't support QZ Tray anyway)
    const isAndroid = this.thermalPrinter.isAndroid();
    if (!isAndroid) {
      await this.checkQZTrayStatus();
      if (this.qzTrayStatus === 'connected') {
        await this.loadPrinters();
      }
    } else {
      // On Android without Bluetooth, just show disconnected state
      this.qzTrayStatus = 'disconnected';
    }
  }

  async checkQZTrayStatus(): Promise<void> {
    this.qzTrayStatus = 'checking';
    this.errorMessage = null;

    try {
      const isRunning = await this.thermalPrinter.isQZTrayRunning();
      
      if (isRunning) {
        this.qzTrayStatus = 'connected';
        this.qzTrayVersion = await this.thermalPrinter.getQZTrayVersion();
      } else {
        this.qzTrayStatus = 'disconnected';
        this.errorMessage = 'QZ Tray is not running. Please install and start QZ Tray.';
      }
    } catch (error) {
      this.qzTrayStatus = 'disconnected';
      this.errorMessage = 'Failed to connect to QZ Tray. Please ensure it is installed and running.';
    }
  }

  async loadPrinters(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      this.printers = await this.thermalPrinter.getPrinters();
      
      if (this.printers.length === 0) {
        this.errorMessage = 'No printers found. Please connect a printer and try again.';
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to load printers';
    } finally {
      this.isLoading = false;
    }
  }

  selectPrinter(printerName: string): void {
    this.selectedPrinter = printerName;
    this.thermalPrinter.setPrinter(printerName);
    this.successMessage = `Printer "${printerName}" selected successfully!`;
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      this.successMessage = null;
    }, 3000);
  }

  async testPrint(): Promise<void> {
    if (!this.selectedPrinter) {
      this.errorMessage = 'Please select a printer first';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const testTransaction = {
        id: 'TEST-' + Date.now(),
        timestamp: new Date().toISOString(),
        items: [
          { name: 'Test Item 1', quantity: 2, price: 10.00 },
          { name: 'Test Item 2', quantity: 1, price: 25.50 }
        ],
        total: 45.50,
        paymentMethod: 'cash',
        customerInfo: { name: 'Test Customer', discountType: 'none' },
        status: 'completed',
        notes: 'This is a test receipt',
        amountReceived: 50.00,
        change: 4.50
      };

      await this.thermalPrinter.printReceipt(testTransaction, false);
      this.successMessage = 'Test receipt printed successfully!';
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to print test receipt';
    } finally {
      this.isLoading = false;
    }
  }

  async testDrawer(): Promise<void> {
    if (!this.selectedPrinter) {
      this.errorMessage = 'Please select a printer first';
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      await this.thermalPrinter.openCashDrawer();
      this.successMessage = 'Cash drawer command sent successfully!';
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to open cash drawer';
    } finally {
      this.isLoading = false;
    }
  }

  openQZTrayDownload(): void {
    window.open('https://qz.io/download/', '_blank');
  }

  async connectBluetooth(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      await this.thermalPrinter.connectBluetooth();
      this.qzTrayStatus = 'connected';
      this.qzTrayVersion = await this.thermalPrinter.getQZTrayVersion();
      this.selectedPrinter = this.thermalPrinter.getPrinter();
      this.successMessage = `Bluetooth printer "${this.selectedPrinter}" connected successfully!`;
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        this.successMessage = null;
      }, 5000);
    } catch (error: any) {
      // Format error message to be more user-friendly
      let errorMsg = error.message || 'Failed to connect to Bluetooth printer';
      
      // Add helpful context for common errors
      if (errorMsg.includes('No device selected') || errorMsg.includes('NotFoundError')) {
        errorMsg = 'No printer selected. Please:\n' +
                   '1. Make sure your printer is powered on\n' +
                   '2. Ensure Bluetooth is enabled on your printer\n' +
                   '3. Select your printer from the device list when it appears';
      } else if (errorMsg.includes('Bluetooth Classic') || errorMsg.includes('SPP')) {
        errorMsg = 'Your printer uses Bluetooth Classic (SPP), which has limited support in web browsers.\n\n' +
                   '💡 Recommended Solution: Use QZ Tray on a desktop computer with USB connection instead.\n\n' +
                   'If you must use Bluetooth, try:\n' +
                   '1. Make sure you\'re using Chrome browser\n' +
                   '2. Access the app via HTTPS (not HTTP)\n' +
                   '3. Check if your printer has a BLE mode in settings';
      } else if (errorMsg.includes('permission') || errorMsg.includes('SecurityError')) {
        errorMsg = 'Bluetooth permission denied. Please:\n' +
                   '1. Allow Bluetooth access when prompted\n' +
                   '2. Check Chrome settings → Site settings → Bluetooth\n' +
                   '3. Grant location permission (required for Bluetooth scanning on Android)';
      }
      
      this.errorMessage = errorMsg;
      
      // Keep error visible longer for important messages
      setTimeout(() => {
        if (this.errorMessage === errorMsg) {
          this.errorMessage = null;
        }
      }, 10000);
    } finally {
      this.isLoading = false;
    }
  }

  getMenuUrl(): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/menu`;
  }
}





