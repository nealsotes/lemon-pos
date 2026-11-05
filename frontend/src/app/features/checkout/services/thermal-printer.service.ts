import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as qz from 'qz-tray';
import { PrintResult, PrintStatus, PrintTransport } from '../models/print-result.model';

@Injectable({
  providedIn: 'root'
})
export class ThermalPrinterService {
  getTransport(): PrintTransport {
    return this.transport;
  }

  setTransport(transport: PrintTransport): void {
    if (!Object.values(PrintTransport).includes(transport)) throw new Error('Unknown print transport.');
    this.transport = transport;
    localStorage.setItem('thermalPrintTransport', transport);
  }

  private transport: PrintTransport = PrintTransport.Qz;

  private isConnected = false;
  private printerName: string | null = null;
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothServer: BluetoothRemoteGATTServer | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private isAndroidDevice = false;

  constructor(private http: HttpClient) {
    this.loadPrinterConfig();
    this.detectPlatform();
    const saved = localStorage.getItem('thermalPrintTransport');
    const legacy = this.isAndroidDevice ? localStorage.getItem('mobilePrintMethod') : null;
    const choice = saved || legacy;
    this.transport = Object.values(PrintTransport).includes(choice as PrintTransport)
      ? choice as PrintTransport : this.isAndroidDevice ? PrintTransport.RawBt : PrintTransport.Qz;
    if (!saved && legacy && Object.values(PrintTransport).includes(legacy as PrintTransport)) {
      localStorage.setItem('thermalPrintTransport', this.transport);
    }
  }

  /**
   * Set preferred mobile print method
   */
  setMobilePrintMethod(method: 'bluetooth' | 'rawbt' | 'backend'): void {
    this.setTransport(method as PrintTransport);
  }

  /**
   * Get preferred mobile print method
   */
  getMobilePrintMethod(): 'bluetooth' | 'rawbt' | 'backend' {
    return this.transport === PrintTransport.Qz ? 'rawbt' : this.transport;
  }

  /**
   * Detect if running on Android
   */
  private detectPlatform(): void {
    const userAgent = navigator.userAgent;
    this.isAndroidDevice = /Android/i.test(userAgent);
  }

  /**
   * Check if running on Android
   */
  isAndroid(): boolean {
    return this.isAndroidDevice;
  }

  /**
   * Check if Web Bluetooth is available
   */
  isBluetoothAvailable(): boolean {
    return 'bluetooth' in navigator &&
      navigator.bluetooth !== undefined &&
      'requestDevice' in navigator.bluetooth;
  }

  /**
   * Initialize QZ Tray connection (for desktop)
   */
  async connect(): Promise<void> {
    this.validateTransport();
    if (this.transport !== PrintTransport.Qz) throw new Error('Select QZ Tray in Printer Settings to connect to QZ.');
    try {
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect();
        this.isConnected = true;
      }
    } catch (error) {
      throw new Error('QZ Tray is not running. Please install and start QZ Tray.');
    }
  }

  /**
   * Connect to Bluetooth printer
   */
  async connectBluetooth(): Promise<void> {
    if (!this.isBluetoothAvailable() || !navigator.bluetooth) {
      throw new Error('Web Bluetooth is unavailable. Use a supported secure browser with a compatible BLE GATT printer; Bluetooth Classic/SPP is not supported.');
    }
    await this.disconnectBluetooth();
    try {
      // Exactly one user picker. Cancellation must never open another picker.
      const device = await navigator.bluetooth.requestDevice({acceptAllDevices: true, optionalServices: [0xFFE0, 0xFF00, 0xFFE5]});
      this.bluetoothDevice = device;
      const server = await device.gatt?.connect();
      if (!server) throw new Error('This device has no compatible BLE GATT server. Bluetooth Classic/SPP is not supported.');
      this.bluetoothServer = server;
      for (const serviceId of [0xFFE0, 0xFF00, 0xFFE5]) {
        let service: BluetoothRemoteGATTService;
        try { service = await server.getPrimaryService(serviceId); } catch { continue; }
        for (const characteristicId of [0xFFE1, 0xFF01, 0xFFE6]) {
          try {
            const candidate = await service.getCharacteristic(characteristicId);
            if (this.isWritable(candidate)) { this.bluetoothCharacteristic = candidate; break; }
          } catch { /* Discover another supported characteristic, never retry a write. */ }
        }
        if (!this.bluetoothCharacteristic) {
          try {
            const candidates = await service.getCharacteristics();
            this.bluetoothCharacteristic = candidates.find(candidate => this.isWritable(candidate)) || null;
          } catch { /* This service is not compatible. */ }
        }
        if (this.bluetoothCharacteristic) break;
      }
      if (!this.bluetoothCharacteristic) throw new Error('No compatible writable BLE GATT characteristic found. Bluetooth Classic/SPP is not supported; select a compatible printer in Printer Settings.');
    } catch (error: any) {
      await this.disconnectBluetooth();
      if (error.name === 'NotFoundError' || error.name === 'AbortError') throw new Error('Bluetooth selection cancelled. No print was sent.');
      throw error;
    }
  }

  private isWritable(characteristic: BluetoothRemoteGATTCharacteristic): boolean {
    return !!((characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') ||
      (characteristic.properties.write && (typeof (characteristic as BluetoothRemoteGATTCharacteristic & {writeValueWithResponse?: (value: ArrayBuffer) => Promise<void>}).writeValueWithResponse === 'function' || typeof characteristic.writeValue === 'function')));
  }

  /**
   * Disconnect from QZ Tray
   */
  async disconnect(): Promise<void> {
    if (this.isConnected && qz.websocket.isActive()) {
      await qz.websocket.disconnect();
      this.isConnected = false;
    }

    // Also disconnect Bluetooth if connected
    await this.disconnectBluetooth();
  }

  /**
   * Disconnect from Bluetooth printer
   */
  private async disconnectBluetooth(): Promise<void> {
    if (this.bluetoothCharacteristic) {
      this.bluetoothCharacteristic = null;
    }

    if (this.bluetoothServer) {
      if (this.bluetoothServer.connected) {
        this.bluetoothServer.disconnect();
      }
      this.bluetoothServer = null;
    }

    if (this.bluetoothDevice) {
      if (this.bluetoothDevice.gatt?.connected) {
        this.bluetoothDevice.gatt.disconnect();
      }
      this.bluetoothDevice = null;
    }

    if (this.isConnected && this.isAndroidDevice) {
      this.isConnected = false;
    }
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<string[]> {
    this.validateTransport();
    if (this.transport === PrintTransport.Backend) {
      const response = await firstValueFrom(this.http.get<{success?: boolean; printers: string[]; message?: string}>('/api/print/printers'));
      if (response.success === false || !Array.isArray(response.printers)) throw new Error(response.message || 'Cannot list store-local backend printers.');
      return response.printers;
    }
    if (this.transport !== PrintTransport.Qz) return [];
    await this.connect();
    return await qz.printers.find();
  }

  /**
   * Set the default printer
   */
  setPrinter(printerName: string): void {
    this.printerName = printerName;
    localStorage.setItem('thermalPrinterName', printerName);
  }

  /**
   * Get the configured printer name
   */
  getPrinter(): string | null {
    return this.printerName;
  }

  /**
   * Load printer configuration from localStorage
   */
  private loadPrinterConfig(): void {
    this.printerName = localStorage.getItem('thermalPrinterName');
  }

  /** Print only through the explicitly selected transport; never auto-retry elsewhere. */
  async printReceipt(transaction: any, openDrawer = false): Promise<PrintResult> {
    this.validateTransport();
    if (this.transport === PrintTransport.Backend) {
      return this.submitBackend(`/receipt?openDrawer=${openDrawer}`, this.convertTransactionToReceiptData(transaction));
    }
    return this.submitBytes(this.buildReceiptBytes(transaction, openDrawer));
  }

  private validateTransport(): void {
    if (this.transport === PrintTransport.RawBt && !this.isAndroidDevice) {
      throw new Error('RawBT requires Android. Select a compatible transport in Printer Settings or explicitly share/download the receipt.');
    }
    if (this.transport === PrintTransport.Qz && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) {
      throw new Error('QZ Tray requires a desktop computer. Select a compatible transport in Printer Settings or explicitly share/download the receipt.');
    }
  }

  private async submitBackend(path: string, data: any): Promise<PrintResult> {
    let response: {success: boolean; message?: string};
    try {
      response = await firstValueFrom(this.http.post<{success: boolean; message?: string}>(`/api/print${path}`, data));
    } catch (error: any) {
      if (error && (error.status === 0 || error.name === 'HttpErrorResponse')) {
        throw new Error('Cannot reach the store-local backend print server. Verify its address and that this device is on the store network, then check its queue before retrying.');
      }
      throw error;
    }
    if (!response.success) throw new Error(response.message || 'Backend printing failed. Check the store-local print server.');
    return this.result(PrintStatus.Submitted, 'Submitted to the store-local backend; physical printing is not confirmed.');
  }

  private async submitBytes(bytes: Uint8Array): Promise<PrintResult> {
    this.validateTransport();
    if (this.transport === PrintTransport.RawBt) {
      this.launchExternalApp(`rawbt:base64,${this.uint8ArrayToBase64(bytes)}`);
      return this.result(PrintStatus.HandoffUnconfirmed, 'RawBT handoff requested — unconfirmed. This browser cannot confirm RawBT is installed or that printing occurred. Verify the printer before retrying.');
    }
    if (this.transport === PrintTransport.Bluetooth) {
      await this.printViaBluetooth(bytes);
      return this.result(PrintStatus.Submitted, 'Submitted to the BLE printer; physical printing is not confirmed.');
    }
    if (!this.printerName) throw new Error('No printer configured. Select a printer in Printer Settings.');
    await this.connect();
    await qz.print(qz.configs.create(this.printerName), [{type: 'raw', format: 'command', flavor: 'base64', data: this.uint8ArrayToBase64(bytes)}]);
    return this.result(PrintStatus.Submitted, 'Submitted to QZ Tray; physical printing is not confirmed.');
  }

  private result(status: PrintStatus, message: string): PrintResult {
    return {status, transport: this.transport, message};
  }

  private receiptFile(transaction: any): File {
    const bytes = this.buildReceiptBytes(transaction, false);
    return new File([bytes.buffer as ArrayBuffer], `receipt_${Date.now()}.prn`, {type: 'application/octet-stream'});
  }

  async shareReceipt(transaction: any): Promise<PrintResult> {
    const file = this.receiptFile(transaction);
    if (!navigator.share || !navigator.canShare?.({files: [file]})) {
      throw new Error('Receipt file sharing is unavailable in this browser. Use the explicit Download receipt action instead.');
    }
    try {
      await navigator.share({files: [file], title: 'Receipt'});
      return this.result(PrintStatus.HandoffUnconfirmed, 'Receipt shared; the browser cannot confirm physical printing.');
    } catch (error: any) {
      if (error.name === 'AbortError') return this.result(PrintStatus.Cancelled, 'Receipt sharing cancelled. No alternate print or download was attempted.');
      throw error;
    }
  }

  downloadReceipt(transaction: any): PrintResult {
    const url = URL.createObjectURL(this.receiptFile(transaction));
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt_${Date.now()}.prn`;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
    return this.result(PrintStatus.Downloaded, 'Receipt download requested; this does not confirm physical printing.');
  }

  launchExternalApp(url: string): void {
    window.location.assign(url);
  }

  async checkPrinter(): Promise<string> {
    this.validateTransport();
    switch (this.transport) {
      case PrintTransport.RawBt:
        return 'RawBT installation and printing cannot be verified by this browser. Check RawBT settings and your printer.';
      case PrintTransport.Backend: {
        const printers = await this.getPrinters();
        if (!printers.length) throw new Error('No printers found on the store-local backend. Configure the local print server in Printer Settings.');
        return 'Store-local backend reports available printers; no print was sent and physical printing is not confirmed.';
      }
      case PrintTransport.Bluetooth:
        if (!this.isBluetoothConnected() || !this.bluetoothCharacteristic) throw new Error('No compatible BLE printer connected. Connect one in Printer Settings; Bluetooth Classic/SPP is not supported.');
        return 'Compatible BLE printer connected; no print was sent.';
      default:
        await this.connect();
        if (!this.printerName) return 'QZ Tray connected. Select a printer in Printer Settings; no print was sent.';
        await qz.printers.find(this.printerName);
        return 'QZ Tray printer available; no print was sent.';
    }
  }

  /**
   * Convert transaction to ReceiptData format for backend API
   */
  private convertTransactionToReceiptData(transaction: any): any {
    // Calculate subtotal (sum of item prices)
    const subtotal = (transaction.items || []).reduce((sum: number, item: any) => {
      return sum + (item.price * item.quantity);
    }, 0);

    const discountTotal = (transaction.items || []).reduce((sum: number, item: any) => {
      return sum + (item.discount?.amount || 0);
    }, 0);

    const subtotalAfterDiscount = subtotal - discountTotal;

    const serviceFee = transaction.serviceFee || 0;
    const total = subtotalAfterDiscount + serviceFee; // Subtotal + Service Fee (no VAT)

    return {
      receiptNumber: (transaction.receiptNumber || transaction.ReceiptNumber || transaction.id || transaction.Id || `TXN-${Date.now()}`).toString(),
      timestamp: transaction.timestamp || new Date().toISOString(),
      customerName: transaction.customerInfo?.name,
      customerPhone: transaction.customerInfo?.phone,
      customerEmail: transaction.customerInfo?.email,
      paymentMethod: transaction.paymentMethod || 'cash',
      serviceType: transaction.serviceType || 'dineIn',
      serviceFee: serviceFee,
      items: (transaction.items || []).map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        temperature: item.temperature || null,
        addOns: item.addOns || []
      })),
      subtotal: subtotalAfterDiscount, // Subtotal (sum of item prices after discount)
      tax: 0, // No VAT
      total: total,
      amountReceived: transaction.amountReceived,
      change: transaction.change,
      notes: transaction.notes
    };
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Print via Bluetooth
   */
  private async printViaBluetooth(byteArray: Uint8Array): Promise<void> {
    const characteristic = this.bluetoothCharacteristic as (BluetoothRemoteGATTCharacteristic & {writeValueWithResponse?: (value: ArrayBuffer) => Promise<void>}) | null;
    if (!characteristic || !this.isBluetoothConnected() || !this.isWritable(characteristic)) {
      throw new Error('No compatible writable BLE printer connected. Connect a BLE GATT printer in Printer Settings; Bluetooth Classic/SPP is not supported.');
    }
    const write = characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function'
      ? characteristic.writeValueWithoutResponse.bind(characteristic)
      : characteristic.writeValueWithResponse?.bind(characteristic) || characteristic.writeValue.bind(characteristic);
    // Conservative GATT payload size. A failed chunk may already have printed: never retry.
    for (let offset = 0; offset < byteArray.length; offset += 20) {
      await write(byteArray.slice(offset, offset + 20).buffer as ArrayBuffer);
    }
  }

  /** Open the drawer once using only the selected transport. */
  async openCashDrawer(): Promise<PrintResult> {
    this.validateTransport();
    if (this.transport === PrintTransport.Backend) return this.submitBackend('/drawer', {});
    return this.submitBytes(this.stringToBytes(this.getDrawerKickCommand()));
  }

  /**
   * Build ESC/POS commands for receipt printing
   * Mirrors the on-screen receipt sidebar layout (receipt-sidebar.component):
   *   success hero -> stat rows -> items -> totals -> total-paid block -> change block -> notes
   */
  private buildReceiptCommands(transaction: any, openDrawer: boolean): any[] {
    const commands: any[] = [];
    const ESC = '\x1B';
    const GS = '\x1D';

    const paymentMethod = transaction.paymentMethod || transaction.PaymentMethod || 'cash';
    const amountReceived = transaction.amountReceived || transaction.AmountReceived || 0;

    commands.push(ESC + '@'); // Initialize printer

    // A receipt kicks only on explicit opt-in, with one standard pin-2 pulse.
    if (openDrawer) commands.push(this.getDrawerKickCommand());
    commands.push('\x00\x00\x00\x00');

    // Totals — computed up front because the success hero shows the grand total
    const subtotal = (transaction.items || []).reduce((sum: number, item: any) => {
      return sum + ((item.price || 0) * (item.quantity || 0));
    }, 0);
    const discountTotal = (transaction.items || []).reduce((sum: number, item: any) => {
      return sum + (item.discount?.amount || 0);
    }, 0);
    const subtotalAfterDiscount = subtotal - discountTotal;
    const serviceFee = transaction.serviceFee || 0;
    const total = (transaction.total && transaction.total > 0)
      ? transaction.total
      : (subtotalAfterDiscount + serviceFee);

    // ── Brand header ────────────────────────────────────────────────────────
    const receiptNumber = transaction.receiptNumber || transaction.ReceiptNumber || transaction.id || transaction.Id || 'N/A';

    commands.push(ESC + 'a' + '\x01'); // Center
    commands.push(ESC + '!' + '\x30'); // Double height + double width
    commands.push('Lemon POS\n');
    commands.push(ESC + '!' + '\x00'); // Reset

    // ── Success hero (matches .success-hero in the sidebar) ─────────────────
    commands.push(`PAID - RECEIPT NO ${receiptNumber}\n`);
    commands.push(ESC + '!' + '\x30'); // Double height + double width
    commands.push(`${this.formatPrice(total)}\n`);
    commands.push(ESC + '!' + '\x00'); // Reset

    commands.push('\n');
    commands.push(this.drawLine());

    // ── Stat rows (Date / Payment / Service / Customer) ─────────────────────
    commands.push(ESC + 'a' + '\x00'); // Left
    commands.push(this.formatStatRow('Date', this.formatReceiptDate(transaction.timestamp)));
    commands.push(this.formatStatRow('Payment', this.getPaymentMethodDisplay(paymentMethod)));

    if (transaction.serviceType) {
      const serviceTypeDisplay = transaction.serviceType === 'dineIn' ? 'Dine-in' : 'Take-out';
      commands.push(this.formatStatRow('Service', serviceTypeDisplay));
    }

    if (transaction.customerInfo?.name) {
      commands.push(this.formatStatRow('Customer', transaction.customerInfo.name));
    }
    if (transaction.customerInfo?.phone) {
      commands.push(this.formatStatRow('Phone', transaction.customerInfo.phone));
    }
    if (transaction.customerInfo?.email) {
      commands.push(this.formatStatRow('Email', transaction.customerInfo.email));
    }

    commands.push(this.drawDashedLine());

    // ── Items list (matches .item-row in the sidebar) ───────────────────────
    if (transaction.items && transaction.items.length > 0) {
      transaction.items.forEach((item: any, index: number) => {
        commands.push(ESC + '!' + '\x00'); // Force normal size per item

        let addOns: any[] = [];
        if (item.addOns) {
          if (Array.isArray(item.addOns)) {
            addOns = JSON.parse(JSON.stringify(item.addOns));
          } else if (typeof item.addOns === 'object') {
            addOns = [JSON.parse(JSON.stringify(item.addOns))];
          }
        }

        const itemTotal = (item.price || 0) * (item.quantity || 0);
        const itemTotalAfterDiscount = item.discount
          ? itemTotal - item.discount.amount
          : itemTotal;

        const addOnsTotalPerUnit = addOns.reduce((sum: number, addOn: any) => {
          const addonQty = addOn.quantity || 1;
          return sum + ((addOn.price || 0) * addonQty);
        }, 0);
        const basePricePerUnit = (item.price || 0) - addOnsTotalPerUnit;

        // Item name + temperature pill text (🔥/❄️ glyphs aren't printable)
        let nameLine = item.name || 'Unknown Item';
        if (item.temperature === 'hot') nameLine += ' (hot)';
        else if (item.temperature === 'cold') nameLine += ' (Iced)';
        commands.push(ESC + '!' + '\x08'); // Bold (matches .item-name weight)
        commands.push(`${nameLine}\n`);
        commands.push(ESC + '!' + '\x00');

        // Add-on lines (matches .addon-item under .item-addons). As MODIFIERS WITHOUT
        // their own money figure (roadmap item 2, OT-14): the item total below is
        // add-on inclusive, so printing the add-on's money here made the printed Σ
        // item lines exceed the TOTAL the customer paid. Only the count prefix (2x)
        // and the name go on the paper.
        addOns.forEach((addOn: any) => {
          const addonQty = addOn.quantity || 1;
          const qtyPrefix = addonQty > 1 ? `${addonQty}x ` : '';
          commands.push(`  + ${qtyPrefix}${addOn.name || ''}\n`);
        });

        // Meta line + item total (matches .item-meta + .item-total flex row)
        const metaText = `${this.formatPrice(basePricePerUnit)} x ${item.quantity || 0}`;
        const itemTotalStr = this.formatPrice(itemTotalAfterDiscount);
        commands.push(this.formatJustifiedLine(metaText, itemTotalStr));

        // Dashed border between items (matches .item-row border-bottom: dashed)
        if (index < transaction.items.length - 1) {
          commands.push(this.drawDashedLine());
        }
      });
    }

    commands.push(this.drawDashedLine());

    // ── Subtotal / Discount / Service Fee stat rows ─────────────────────────
    commands.push(this.formatStatRow('Subtotal', this.formatPrice(subtotal)));

    if (discountTotal > 0) {
      let discountLabel = 'Discount';
      if (transaction.customerInfo?.discountType) {
        const type = transaction.customerInfo.discountType;
        if (type === 'senior') discountLabel = 'Discount (Senior)';
        else if (type === 'pwd') discountLabel = 'Discount (PWD)';
        else if (type === 'manual') discountLabel = 'Discount (Custom)';
      }
      commands.push(this.formatStatRow(discountLabel, `-${this.formatPrice(discountTotal)}`));
    }

    if (serviceFee > 0) {
      const serviceTypeLabel = transaction.serviceType === 'dineIn' ? 'Dine-in (2%)' : 'Take-out';
      commands.push(this.formatStatRow(`Service Fee (${serviceTypeLabel})`, this.formatPrice(serviceFee)));
    }

    commands.push(this.drawLine());

    // ── Total paid block (matches .ed-total-block.printed-total) ────────────
    commands.push(ESC + 'a' + '\x01'); // Center
    commands.push('TOTAL PAID\n');
    commands.push(ESC + '!' + '\x30'); // Double height + double width
    commands.push(`${this.formatPrice(total)}\n`);
    commands.push(ESC + '!' + '\x00');
    commands.push(`${this.getPaymentMethodDisplay(paymentMethod)}\n`);

    // ── Cash details: Received + Change due block ───────────────────────────
    if (paymentMethod === 'cash' && amountReceived > 0) {
      const finalChange = Math.max(0, amountReceived - total);

      commands.push(this.drawDashedLine());
      commands.push(ESC + 'a' + '\x00'); // Left
      commands.push(this.formatStatRow('Received', this.formatPrice(amountReceived)));

      commands.push('\n');
      commands.push(ESC + 'a' + '\x01'); // Center
      commands.push('CHANGE DUE\n');
      commands.push(ESC + '!' + '\x30'); // Double height + double width
      commands.push(`${this.formatPrice(finalChange)}\n`);
      commands.push(ESC + '!' + '\x00');
    }

    // ── Notes (matches .receipt-notes) ──────────────────────────────────────
    if (transaction.notes) {
      commands.push(this.drawDashedLine());
      commands.push(ESC + 'a' + '\x00'); // Left
      commands.push(`${transaction.notes}\n`);
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    commands.push('\n');
    commands.push(this.drawLine());
    commands.push(ESC + 'a' + '\x01'); // Center
    commands.push('Thank you for your purchase!\n');

    // Cut paper
    commands.push('\n\n');
    commands.push(GS + 'V' + '\x41' + '\x03'); // Partial cut

    return commands;
  }

  /** One standard pin-2 pulse: 150ms on, 500ms off. */
  private getDrawerKickCommand(): string {
    return '\x1B\x70\x00\x4B\xFA';
  }

  /**
   * Stat row — label left, value right, justified to the receipt width.
   * Mirrors .ed-stat-row in the sidebar. If the label+value don't fit on one
   * line, the value wraps onto the next line and is right-aligned.
   */
  private formatStatRow(label: string, value: string): string {
    const width = 32;
    if (label.length + value.length + 1 > width) {
      const padding = Math.max(0, width - value.length);
      return `${label}\n${' '.repeat(padding)}${value}\n`;
    }
    const spacing = width - label.length - value.length;
    return `${label}${' '.repeat(spacing)}${value}\n`;
  }

  /**
   * Justified line — arbitrary left/right text, used for item rows and addons.
   */
  private formatJustifiedLine(left: string, right: string): string {
    const width = 32;
    if (left.length + right.length + 1 > width) {
      const padding = Math.max(0, width - right.length);
      return `${left}\n${' '.repeat(padding)}${right}\n`;
    }
    const spacing = width - left.length - right.length;
    return `${left}${' '.repeat(spacing)}${right}\n`;
  }

  /**
   * Solid divider (matches .ed-receipt__divider)
   */
  private drawLine(): string {
    return '--------------------------------\n';
  }

  /**
   * Dashed divider (matches .ed-receipt__divider--dashed)
   */
  private drawDashedLine(): string {
    return '- - - - - - - - - - - - - - - -\n';
  }

  /**
   * Payment method display — mirrors the sidebar's getPaymentMethodDisplay()
   */
  private getPaymentMethodDisplay(paymentMethod: string): string {
    if (!paymentMethod) return 'Cash';
    switch (paymentMethod.toLowerCase()) {
      case 'cash': return 'Cash';
      case 'card': return 'Card';
      case 'mobile': return 'Mobile Payment';
      case 'gcash': return 'GCash';
      case 'gotyme': return 'GoTyme';
      case 'maribank': return 'Maribank';
      case 'metrobank': return 'Metrobank';
      default: return paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
    }
  }

  /**
   * Receipt date — mirrors the sidebar's formatDate() (toLocaleString()).
   */
  private formatReceiptDate(dateString: string | Date | undefined): string {
    if (!dateString) return new Date().toLocaleString();
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      if (!date || isNaN(date.getTime())) {
        return new Date().toLocaleString();
      }
      return date.toLocaleString();
    } catch {
      return new Date().toLocaleString();
    }
  }

  /**
   * Format price for display (matching receipt sidebar: ₱XX.XX)
   */
  private formatPrice(price: number): string {
    if (price === undefined || price === null) return 'Php 0.00';
    // Use "Php" instead of ₱ symbol for thermal printers
    // Most ESC/POS printers don't support the peso symbol (₱) in their character set
    // This ensures reliable printing across all thermal printer models
    return `Php ${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Check if QZ Tray is running (desktop) or if Bluetooth is connected (mobile)
   */
  async isQZTrayRunning(): Promise<boolean> {
    // Check Bluetooth connection on Android
    if (this.isAndroidDevice && this.bluetoothDevice && this.bluetoothServer?.connected) {
      return true;
    }

    // Check QZ Tray on desktop
    try {
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect();
        await qz.websocket.disconnect();
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Bluetooth is connected
   */
  isBluetoothConnected(): boolean {
    return this.bluetoothDevice !== null &&
      this.bluetoothServer !== null &&
      this.bluetoothServer.connected;
  }

  /**
   * Get QZ Tray version or Bluetooth info
   */
  async getQZTrayVersion(): Promise<string> {
    if (this.isAndroidDevice && this.bluetoothDevice) {
      return `Bluetooth: ${this.bluetoothDevice.name || 'Connected'}`;
    }

    await this.connect();
    return await qz.api.getVersion();
  }

  private buildReceiptBytes(transaction: any, openDrawer: boolean): Uint8Array {
    const encoder = new TextEncoder();
    // Retain the existing UTF-8 receipt text; only the explicit drawer command
    // is binary and must not expand 0xFA into a UTF-8 character sequence.
    const chunks = this.buildReceiptCommands(transaction, openDrawer).map((command: string, index: number) =>
      openDrawer && index === 1 ? this.stringToBytes(command) : encoder.encode(command));
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  /** Convert an ESC/POS binary command without UTF-8-expanding command bytes. */
  private stringToBytes(str: string): Uint8Array {
    // ESC/POS commands are binary, not UTF-8 text (0xFA must remain one byte).
    return Uint8Array.from(str, char => char.charCodeAt(0) <= 255 ? char.charCodeAt(0) : 63);
  }
}





