import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThermalPrinterService } from '../../services/thermal-printer.service';
import { PrintTransport } from '../../models/print-result.model';
import { QrCodeGeneratorComponent } from '../qr-code-generator/qr-code-generator.component';

@Component({
  selector: 'app-printer-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, QrCodeGeneratorComponent],
  templateUrl: './printer-settings.component.html',
  styleUrls: ['./printer-settings.component.css']
})
export class PrinterSettingsComponent implements OnInit {
  readonly transport = PrintTransport;
  selectedTransport: PrintTransport;
  printers: string[] = [];
  selectedPrinter: string | null = null;
  isLoading = false;
  statusMessage: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isBluetoothAvailable = false;

  constructor(public thermalPrinter: ThermalPrinterService) {
    this.selectedTransport = thermalPrinter.getTransport();
  }

  ngOnInit(): void {
    this.selectedPrinter = this.thermalPrinter.getPrinter();
    this.isBluetoothAvailable = this.thermalPrinter.isBluetoothAvailable();
    // Opening settings never contacts any transport or submits a job.
  }

  selectTransport(value: PrintTransport): void {
    if (this.isLoading) return;
    this.thermalPrinter.setTransport(value);
    this.selectedTransport = this.thermalPrinter.getTransport();
    this.printers = [];
    this.statusMessage = null;
    this.errorMessage = null;
    this.successMessage = 'Transport saved on this device. No job has been sent.';
  }

  async checkPrinter(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;
    this.statusMessage = null;
    try {
      this.statusMessage = await this.thermalPrinter.checkPrinter();
      if (this.selectedTransport === PrintTransport.Qz) {
        this.printers = await this.thermalPrinter.getPrinters();
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Could not check the selected transport. See setup instructions.';
    } finally {
      this.isLoading = false;
    }
  }

  selectPrinter(printerName: string): void {
    if (this.isLoading) return;
    this.selectedPrinter = printerName;
    this.thermalPrinter.setPrinter(printerName);
    this.successMessage = `Printer "${printerName}" saved. No job has been sent.`;
  }

  async testPrint(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      const result = await this.thermalPrinter.printReceipt(this.createTestReceipt(), false);
      this.successMessage = result.message;
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to print test receipt';
    } finally {
      this.isLoading = false;
    }
  }

  async testDrawer(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;
    try {
      const result = await this.thermalPrinter.openCashDrawer();
      this.successMessage = result.message;
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
    if (this.isLoading || this.selectedTransport !== PrintTransport.Bluetooth) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;
    try {
      await this.thermalPrinter.connectBluetooth();
      this.selectedPrinter = this.thermalPrinter.getPrinter();
      this.statusMessage = 'BLE connected. Physical paper printing and drawer operation remain unconfirmed.';
    } catch (error: any) {
      this.errorMessage = error.message || 'BLE setup failed. Web Bluetooth cannot use Classic SPP printers.';
    } finally {
      this.isLoading = false;
    }
  }

  private createTestReceipt(): any {
    return {
      id: 'TEST-' + Date.now(), timestamp: new Date().toISOString(),
      items: [
        { name: 'Test Item 1', quantity: 2, price: 10.00 },
        { name: 'Test Item 2', quantity: 1, price: 25.50 }
      ],
      total: 45.50, paymentMethod: 'cash',
      customerInfo: { name: 'Test Customer', discountType: 'none' },
      status: 'completed', notes: 'This is a test receipt',
      amountReceived: 50.00, change: 4.50
    };
  }

  async shareTestReceipt(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;
    try {
      const result = await this.thermalPrinter.shareReceipt(this.createTestReceipt());
      this.successMessage = result.message;
    } catch (error: any) {
      this.errorMessage = error.message || 'Sharing unavailable. You can explicitly download the receipt file instead.';
    } finally {
      this.isLoading = false;
    }
  }

  downloadTestReceipt(): void {
    if (this.isLoading) return;
    this.errorMessage = null;
    this.successMessage = null;
    try {
      this.successMessage = this.thermalPrinter.downloadReceipt(this.createTestReceipt()).message;
    } catch (error: any) {
      this.errorMessage = error.message || 'Could not download receipt file.';
    }
  }

  getMenuUrl(): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/menu`;
  }
}





