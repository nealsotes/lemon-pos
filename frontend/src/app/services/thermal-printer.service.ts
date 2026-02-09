import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as qz from 'qz-tray';
import { Transaction } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class ThermalPrinterService {
  private isConnected = false;
  private printerName: string | null = null;
  private bluetoothDevice: BluetoothDevice | null = null;
  private bluetoothServer: BluetoothRemoteGATTServer | null = null;
  private bluetoothCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private isAndroidDevice: boolean = false;
  private apiUrl = this.getApiUrl();
  private useBackendPrinting: boolean = true; // Try backend first, but allow Bluetooth fallback
  private preferredMobilePrintMethod: 'bluetooth' | 'rawbt' | 'backend' = 'rawbt'; // Default to RawBT for Android

  constructor(private http: HttpClient) {
    this.loadPrinterConfig();
    this.detectPlatform();
    this.loadMobilePrintPreference();
  }

  /**
   * Load mobile print preference from localStorage
   */
  private loadMobilePrintPreference(): void {
    const saved = localStorage.getItem('mobilePrintMethod');
    if (saved && ['bluetooth', 'rawbt', 'backend'].includes(saved)) {
      this.preferredMobilePrintMethod = saved as 'bluetooth' | 'rawbt' | 'backend';
    }
  }

  /**
   * Set preferred mobile print method
   */
  setMobilePrintMethod(method: 'bluetooth' | 'rawbt' | 'backend'): void {
    this.preferredMobilePrintMethod = method;
    localStorage.setItem('mobilePrintMethod', method);
  }

  /**
   * Get preferred mobile print method
   */
  getMobilePrintMethod(): 'bluetooth' | 'rawbt' | 'backend' {
    return this.preferredMobilePrintMethod;
  }

  /**
   * Get the API URL - use proxy in development, or detect from current location
   */
  private getApiUrl(): string {
    // In development with proxy, use relative URL
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return '/api';
    }

    // In production or on mobile, try to detect from current location
    const hostname = window.location.hostname;
    const port = window.location.port || '5001';

    // If accessing via IP address, use that
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `http://${hostname}:${port}/api`;
    }

    // Otherwise use current origin
    return `${window.location.origin}/api`;
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
    if (this.isConnected) {
      return;
    }

    // If Android and Bluetooth available, use Bluetooth instead
    if (this.isAndroidDevice && this.isBluetoothAvailable() && this.bluetoothDevice) {
      return; // Already connected via Bluetooth
    }

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
      throw new Error('Web Bluetooth is not available on this device.');
    }

    try {
      // First, try with filters for common printer names and SPP service
      let device: BluetoothDevice | null = null;

      try {
        // Try with specific filters first (faster, more targeted)
        // Note: Web Bluetooth only supports BLE, NOT Bluetooth Classic (SPP)
        // Common BLE service UUIDs for thermal printers:
        // - 0xFFE0 / FFE0 = Common BLE service for printers
        // - 0xFF00 / FF00 = Alternative BLE service
        device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: [0xFFE0] }, // Common BLE service UUID for printers
            { services: [0xFF00] }, // Alternative BLE service
            { namePrefix: 'POS' },
            { namePrefix: 'Printer' },
            { namePrefix: 'TM-' }, // Epson TM series (if BLE enabled)
            { namePrefix: 'TSP' }, // Star TSP series (if BLE enabled)
            { namePrefix: 'SRP' }, // Bixolon SRP series (if BLE enabled)
            { namePrefix: 'XP-' }, // XP series
            { namePrefix: 'RP' },  // RP series
            { namePrefix: 'Thermal' },
            { namePrefix: 'Receipt' }
          ],
          optionalServices: [0xFFE0, 0xFF00, 0xFFE5] // Common BLE service UUIDs
        });
      } catch (filterError: any) {
        // If filtered search fails, try without filters to show all devices
        // This allows user to see all Bluetooth devices and select their printer

        try {
          // Try without filters to show all Bluetooth devices
          // This allows user to see all devices and select their printer
          // Note: Only BLE devices will appear (not Bluetooth Classic/SPP)
          device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
              0xFFE0,  // Common BLE service UUID for printers (0xFFE0)
              0xFF00,  // Alternative BLE service
              0xFFE5   // Another common BLE service
            ]
          });
        } catch (unfilteredError: any) {
          // If user cancels, that's fine - just rethrow
          if (unfilteredError.name === 'NotFoundError' || unfilteredError.name === 'SecurityError') {
            throw new Error('No device selected or permission denied. Please try again and select your printer from the list.');
          }
          throw new Error('Failed to discover Bluetooth devices: ' + (unfilteredError.message || 'Unknown error'));
        }
      }

      if (!device) {
        throw new Error('No Bluetooth device selected.');
      }

      this.bluetoothDevice = device;

      // Connect to GATT server
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to Bluetooth device.');
      }

      this.bluetoothServer = server;

      // Try to get BLE service (Bluetooth Low Energy)
      // Common BLE service UUIDs for thermal printers:
      // - 0xFFE0 = Most common for BLE printers
      // - 0xFFE1 = Characteristic UUID for writing data
      // - 0xFF00 = Alternative service
      let service: BluetoothRemoteGATTService | null = null;
      let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

      // BLE service UUIDs (NOT SPP - Web Bluetooth doesn't support SPP)
      const serviceUUIDs = [
        0xFFE0,  // Most common BLE service for printers
        0xFF00,  // Alternative BLE service
        0xFFE5   // Another common BLE service
      ];

      // Try each service UUID
      for (const serviceUUID of serviceUUIDs) {
        try {
          service = await server.getPrimaryService(serviceUUID);

          // Try common characteristic UUIDs for writing
          const characteristicUUIDs = [
            0xFFE1,  // Most common characteristic for writing (used with 0xFFE0)
            0xFF01,  // Alternative characteristic
            0xFFE6   // Another common characteristic
          ];

          // Try each characteristic UUID
          for (const charUUID of characteristicUUIDs) {
            try {
              characteristic = await service.getCharacteristic(charUUID);

              // Check if it supports writing
              const properties = characteristic.properties;
              if (properties.write || properties.writeWithoutResponse) {
                break;
              }
            } catch (charError) {
              // Try next characteristic
              continue;
            }
          }

          // If we found a characteristic, break
          if (characteristic) {
            break;
          }

          // If no specific characteristic found, try getting all characteristics
          if (!characteristic) {
            const characteristics = await service.getCharacteristics();

            for (const char of characteristics) {
              // Look for characteristics that support write
              const properties = char.properties;
              if (properties.write || properties.writeWithoutResponse) {
                characteristic = char;
                break;
              }
            }
          }

          if (characteristic) {
            break;
          }
        } catch (serviceError) {
          // Try next service UUID
          continue;
        }
      }

      if (!service || !characteristic) {
        throw new Error('Could not find a compatible service on this device. Your printer may use Bluetooth Classic (SPP) which has limited Web Bluetooth support. Try using QZ Tray on a desktop computer instead.');
      }

      this.bluetoothCharacteristic = characteristic;
      this.isConnected = true;

      // Store device info
      this.printerName = device.name || 'Bluetooth Printer';
      localStorage.setItem('thermalPrinterName', this.printerName);
      localStorage.setItem('thermalPrinterType', 'bluetooth');
    } catch (error: any) {
      this.disconnectBluetooth();

      // Provide more helpful error messages
      if (error.name === 'NotFoundError') {
        throw new Error('No Bluetooth device found. Make sure your printer is:\n1. Powered on\n2. Bluetooth enabled\n3. Discoverable/pairable\n4. Within range');
      } else if (error.name === 'SecurityError') {
        throw new Error('Bluetooth permission denied. Please allow Bluetooth access when prompted.');
      } else if (error.message) {
        throw error; // Re-throw with our custom message
      } else {
        throw new Error('Failed to connect to Bluetooth printer: ' + (error.message || 'Unknown error'));
      }
    }
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

  /**
   * Print receipt to thermal printer
   * On mobile: Tries Bluetooth first (if connected), then backend
   * On desktop: Tries backend first, then QZ Tray/Bluetooth
   */
  async printReceipt(transaction: any, openDrawer: boolean = true): Promise<void> {
    const isMobile = this.isAndroidDevice || /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // On mobile, use preferred print method
    if (isMobile) {
      // Method 1: RawBT (Android print service app) - BEST for Android
      if (this.preferredMobilePrintMethod === 'rawbt' ||
        (this.preferredMobilePrintMethod === 'bluetooth' && !this.bluetoothCharacteristic)) {
        try {
          await this.printViaRawBT(transaction, openDrawer);
          return; // Successfully printed via RawBT
        } catch (rawbtError: any) {
          // Fall through to try other methods
        }
      }

      // Method 2: Bluetooth (Web Bluetooth API) - only if connected
      if (this.preferredMobilePrintMethod === 'bluetooth' && this.bluetoothCharacteristic && this.bluetoothDevice) {
        try {
          const commands = this.buildReceiptCommands(transaction, openDrawer);
          const rawString = commands.join('');
          const byteArray = this.stringToBytes(rawString);
          await this.printViaBluetooth(byteArray);
          return; // Successfully printed via Bluetooth
        } catch (bluetoothError: any) {
          // Try RawBT as fallback
          try {
            await this.printViaRawBT(transaction, openDrawer);
            return;
          } catch (rawbtError: any) {
            // Continue to next method
          }
        }
      }
    }

    // Try backend printing (works for both mobile and desktop)
    // Note: On mobile, this only runs if Bluetooth is not connected or failed
    if (this.useBackendPrinting) {
      try {
        const receiptData = this.convertTransactionToReceiptData(transaction);
        const response = await firstValueFrom(
          this.http.post<{ success: boolean; message: string }>(
            `${this.apiUrl}/print/receipt?openDrawer=${openDrawer}`,
            receiptData
          )
        );

        if (response.success) {
          return; // Successfully printed via backend
        } else {
          throw new Error(response.message || 'Backend printing failed');
        }
      } catch (backendError: any) {
        // Backend printing failed - try Bluetooth on mobile, or local printing on desktop

        // On mobile, if backend fails and Bluetooth is available but not connected, suggest it
        if (isMobile && this.isBluetoothAvailable() && !this.bluetoothDevice) {
          // On mobile, backend failed and Bluetooth not connected - show helpful error
          if (backendError.status === 0) {
            throw new Error(
              'Cannot connect to server. Options:\n\n' +
              'Option 1: Fix Server Connection\n' +
              '1. Ensure backend server is running\n' +
              '2. Connect to the same network\n' +
              '3. Check server IP address\n\n' +
              'Option 2: Use Bluetooth Printing\n' +
              '1. Go to Printer Settings\n' +
              '2. Click "Connect Bluetooth Printer"\n' +
              '3. Select your printer\n\n' +
              `Current API URL: ${this.apiUrl}`
            );
          } else {
            throw new Error(
              `Backend printing failed: ${backendError.error?.message || backendError.message}\n\n` +
              'Try Bluetooth printing instead:\n' +
              '1. Go to Printer Settings\n' +
              '2. Click "Connect Bluetooth Printer"'
            );
          }
        }
      }
    }

    // Fallback to local printing (QZ Tray or Bluetooth) - works on both desktop and mobile
    const commands = this.buildReceiptCommands(transaction, openDrawer);
    const rawString = commands.join('');
    const byteArray = this.stringToBytes(rawString);

    // Use Bluetooth if connected
    if (this.bluetoothCharacteristic && this.bluetoothDevice) {
      await this.printViaBluetooth(byteArray);
      return;
    }

    // Use QZ Tray for desktop
    if (!this.printerName) {
      throw new Error(
        'No printer configured. Please:\n' +
        '1. Select a printer in Printer Settings, OR\n' +
        '2. Configure backend printing (recommended for mobile)\n\n' +
        'Backend printing is recommended for mobile devices.'
      );
    }

    await this.connect();

    try {
      const config = qz.configs.create(this.printerName);
      await qz.print(config, [{
        type: 'raw',
        format: 'plain',
        data: byteArray
      }]);
    } catch (error) {
      throw new Error('Failed to print receipt. Please check printer connection.');
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
   * Print via RawBT or similar Android print service app
   * Uses multiple methods: URL scheme, file download, and Web Share API
   */
  private async printViaRawBT(transaction: any, openDrawer: boolean = true): Promise<void> {
    if (!this.isAndroidDevice) {
      throw new Error('RawBT printing is only available on Android devices');
    }

    // Build ESC/POS commands
    const commands = this.buildReceiptCommands(transaction, openDrawer);
    const rawString = commands.join('');

    // Convert string to bytes (handles binary ESC/POS sequences correctly)
    const byteArray = this.stringToBytes(rawString);

    // Convert bytes to base64 (RawBT expects base64-encoded binary data)
    const base64Data = this.uint8ArrayToBase64(byteArray);

    // Try direct printing methods first (no file download)
    // Method 1: RawBT base64 format (rawbt:base64,<data>) - RECOMMENDED
    try {
      const rawbtUrl = `rawbt:base64,${base64Data}`;

      // Use iframe method (more reliable than window.location)
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = rawbtUrl;
      document.body.appendChild(iframe);

      // Remove iframe after delay
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 3000);

      // Wait to see if RawBT opens
      await new Promise(resolve => setTimeout(resolve, 1500));
      return;
    } catch (base64Error: any) {
      // Try next method
    }

    // Method 2: RawBT URL scheme with data parameter (rawbt://print?data=)
    try {
      const encodedBase64 = encodeURIComponent(base64Data);
      const url = `rawbt://print?data=${encodedBase64}`;

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);

      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 3000);

      await new Promise(resolve => setTimeout(resolve, 1500));
      return;
    } catch (urlError: any) {
      // Try next method
    }

    // Method 3: Android Intent URL (explicit package)
    try {
      const encodedBase64 = encodeURIComponent(base64Data);
      // Try multiple intent formats
      const intentUrls = [
        `intent://print?data=${encodedBase64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;action=android.intent.action.VIEW;end`,
        `intent://#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;action=android.intent.action.VIEW;S.data=${encodedBase64};end`
      ];

      for (const intentUrl of intentUrls) {
        try {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = intentUrl;
          document.body.appendChild(iframe);

          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          }, 3000);

          await new Promise(resolve => setTimeout(resolve, 1500));
          return;
        } catch (intentErr) {
          continue;
        }
      }
    } catch (intentError: any) {
      // Try next method
    }

    // Method 4: Try window.open (sometimes more reliable)
    try {
      const encodedBase64 = encodeURIComponent(base64Data);
      const url = `rawbt://print?data=${encodedBase64}`;
      const newWindow = window.open(url, '_blank');
      if (newWindow) {
        setTimeout(() => newWindow.close(), 2000);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      return;
    } catch (openError: any) {
      // Try next method
    }

    // Method 5: Try Web Share API (if available) - allows user to choose RawBT
    if (navigator.share && navigator.canShare) {
      try {
        const bytes = Array.from(byteArray);
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
        const file = new File([blob], `receipt_${Date.now()}.prn`, { type: 'application/octet-stream' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Print Receipt',
            text: 'Select RawBT to print'
          });
          return;
        }
      } catch (shareError: any) {
        // Try next method
      }
    }

    // Method 6: Fallback - file download (last resort)
    try {
      const bytes = Array.from(byteArray);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${Date.now()}.prn`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await new Promise(resolve => setTimeout(resolve, 500));
      // Don't show alert for fallback - user will know to open file
      return;
    } catch (fileError: any) {
      // All methods failed
    }

    // If all methods failed, throw error with instructions
    throw new Error(
      'Unable to connect to RawBT for direct printing.\n\n' +
      'Troubleshooting Steps:\n\n' +
      '1. Verify RawBT is installed:\n' +
      '   - Install RawBT from Google Play Store if not installed\n' +
      '   - Open RawBT app to verify it works\n\n' +
      '2. Configure RawBT printer:\n' +
      '   - Open RawBT app\n' +
      '   - Settings → Printer → Select your printer\n' +
      '   - Set printer type to "ESC/POS" or "Raw ESC/POS"\n' +
      '   - Enable "Raw Mode" or "Direct ESC/POS"\n' +
      '   - Test print from RawBT app first\n\n' +
      '3. Check browser permissions:\n' +
      '   - Allow the browser to open external apps\n' +
      '   - Check if RawBT appears in app selection when printing\n\n' +
      '4. Alternative: If direct printing fails, a .prn file will download.\n' +
      '   Open it manually with RawBT app.\n\n' +
      '5. Alternative App: Install "ESC POS Bluetooth Print Service" from Play Store'
    );
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
    if (!this.bluetoothCharacteristic) {
      throw new Error('Bluetooth printer not connected.');
    }

    try {
      // Convert Uint8Array to ArrayBuffer for Bluetooth
      const buffer = byteArray.buffer.slice(byteArray.byteOffset, byteArray.byteOffset + byteArray.byteLength) as ArrayBuffer;

      // Write data to Bluetooth characteristic
      await this.bluetoothCharacteristic.writeValueWithoutResponse(buffer);
    } catch (error: any) {
      throw new Error('Failed to print via Bluetooth: ' + (error.message || 'Unknown error'));
    }
  }

  /**
   * Open cash drawer without printing
   * Tries backend API first, then falls back to RawBT (Android) or local printing
   */
  async openCashDrawer(): Promise<void> {
    // On Android, always try RawBT first (most reliable for cash drawer)
    if (this.isAndroidDevice) {
      try {
        await this.openDrawerViaRawBT();
        return; // Successfully opened via RawBT
      } catch (rawbtError: any) {
        // If RawBT fails, try backend API as fallback
        if (this.useBackendPrinting) {
          try {
            const response = await firstValueFrom(
              this.http.post<{ success: boolean; message: string }>(
                `${this.apiUrl}/print/drawer`,
                {}
              )
            );

            if (response.success) {
              return; // Successfully opened via backend
            } else {
              throw new Error(response.message || 'Failed to open cash drawer');
            }
          } catch (backendError: any) {
            if (backendError.status === 0) {
              // If backend is not available, throw the RawBT error with helpful message
              throw new Error(
                rawbtError.message ||
                'Failed to open cash drawer via RawBT. Please ensure RawBT app is installed and configured.'
              );
            } else {
              throw new Error(`Failed to open cash drawer: ${backendError.error?.message || backendError.message}`);
            }
          }
        }
        // If RawBT fails and backend is not available, throw the RawBT error
        throw rawbtError;
      }
    }

    // Try backend API first (for non-Android or when backend is preferred)
    if (this.useBackendPrinting) {
      try {
        const response = await firstValueFrom(
          this.http.post<{ success: boolean; message: string }>(
            `${this.apiUrl}/print/drawer`,
            {}
          )
        );

        if (response.success) {
          return; // Successfully opened via backend
        } else {
          throw new Error(response.message || 'Failed to open cash drawer');
        }
      } catch (backendError: any) {
        // On mobile, backend is the only option
        if (this.isAndroidDevice || /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          if (backendError.status === 0) {
            throw new Error('Cannot connect to server. Please ensure backend server is running.');
          } else {
            throw new Error(`Failed to open cash drawer: ${backendError.error?.message || backendError.message}`);
          }
        }

        // On desktop, fall back to local printing
      }
    }

    // Fallback to local printing
    const drawerCommand = this.getDrawerKickCommand();
    const byteArray = this.stringToBytes(drawerCommand);

    // Use Bluetooth if connected
    if (this.bluetoothCharacteristic && this.bluetoothDevice) {
      await this.printViaBluetooth(byteArray);
      return;
    }

    // Use QZ Tray for desktop
    if (!this.printerName) {
      throw new Error('No printer configured. Please select a printer in settings or configure backend printing.');
    }

    await this.connect();

    try {
      const config = qz.configs.create(this.printerName);
      await qz.print(config, [{
        type: 'raw',
        format: 'plain',
        data: byteArray
      }]);
    } catch (error) {
      throw new Error('Failed to open cash drawer.');
    }
  }

  /**
   * Open cash drawer via RawBT on Android
   * Sends drawer kick command directly to RawBT
   * Uses same methods as printViaRawBT for consistency
   */
  private async openDrawerViaRawBT(): Promise<void> {
    if (!this.isAndroidDevice) {
      throw new Error('RawBT drawer opening is only available on Android devices');
    }

    // Get drawer kick command (multiple attempts for reliability)
    const drawerCommand = this.getDrawerKickCommand();

    // Build complete command with initialization and multiple drawer kicks
    // For RawBT, we need to ensure commands are properly formatted
    const ESC = '\x1B';

    // Try multiple command variations for maximum compatibility
    // Some printers need simpler commands, others need the full sequence

    // Command 1: Full command with initialization (most reliable)
    const fullCommand1 = ESC + '@' + // Initialize printer (critical for RawBT)
      drawerCommand + // Full drawer kick command
      drawerCommand; // Retry

    // Command 2: Simple command (for printers that don't like complex sequences)
    const simpleCommand = this.getSimpleDrawerKickCommand();
    const fullCommand2 = ESC + '@' + // Initialize
      simpleCommand + // Simple Pin 2 kick
      simpleCommand; // Retry

    // Command 3: Just the drawer kick without init (some printers)
    const fullCommand3 = drawerCommand + drawerCommand;

    // Try commands in order of complexity
    const commandsToTry = [
      { name: 'Full with init', command: fullCommand1 },
      { name: 'Simple with init', command: fullCommand2 },
      { name: 'No init', command: fullCommand3 }
    ];

    // Try each command variation with all RawBT methods
    // This ensures we find a working combination
    for (const cmdVariation of commandsToTry) {
      const byteArray = this.stringToBytes(cmdVariation.command);
      const base64Data = this.uint8ArrayToBase64(byteArray);

      // Method 1: RawBT base64 format (rawbt:base64,<data>) - RECOMMENDED
      try {
        const rawbtUrl = `rawbt:base64,${base64Data}`;

        // Use iframe method (more reliable than window.location)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = rawbtUrl;
        document.body.appendChild(iframe);

        // Remove iframe after delay
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 3000);

        // Wait to see if RawBT opens
        await new Promise(resolve => setTimeout(resolve, 1500));
        return; // Success!
      } catch (base64Error: any) {
        // Try next method
      }

      // Method 2: RawBT URL scheme with data parameter (rawbt://print?data=)
      try {
        const encodedBase64 = encodeURIComponent(base64Data);
        const url = `rawbt://print?data=${encodedBase64}`;

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
        }, 3000);

        await new Promise(resolve => setTimeout(resolve, 1500));
        return; // Success!
      } catch (urlError: any) {
        // Try next method
      }

      // Method 3: Android Intent URL (explicit package)
      try {
        const encodedBase64 = encodeURIComponent(base64Data);
        // Try multiple intent formats
        const intentUrls = [
          `intent://print?data=${encodedBase64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;action=android.intent.action.VIEW;end`,
          `intent://#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;action=android.intent.action.VIEW;S.data=${encodedBase64};end`
        ];

        for (const intentUrl of intentUrls) {
          try {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = intentUrl;
            document.body.appendChild(iframe);

            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 3000);

            await new Promise(resolve => setTimeout(resolve, 1500));
            return; // Success!
          } catch (intentErr) {
            continue;
          }
        }
      } catch (intentError: any) {
        // Try next method
      }

      // Method 4: Try window.open (sometimes more reliable)
      try {
        const encodedBase64 = encodeURIComponent(base64Data);
        const url = `rawbt://print?data=${encodedBase64}`;
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          setTimeout(() => newWindow.close(), 2000);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        return; // Success!
      } catch (openError: any) {
        // Try next method
      }

      // Method 5: Try window.location (fallback)
      try {
        const encodedBase64 = encodeURIComponent(base64Data);
        const url = `rawbt://print?data=${encodedBase64}`;
        window.location.href = url;
        await new Promise(resolve => setTimeout(resolve, 1500));
        return; // Success!
      } catch (locationError: any) {
        // Try next method
      }

      // Method 6: Try Web Share API (if available) - allows user to choose RawBT
      if (navigator.share && navigator.canShare) {
        try {
          const bytes = Array.from(byteArray);
          const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
          const file = new File([blob], `drawer_${Date.now()}.prn`, { type: 'application/octet-stream' });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Open Cash Drawer',
              text: 'Select RawBT to open cash drawer'
            });
            return; // Success!
          }
        } catch (shareError: any) {
          // Try next method
        }
      }

      // Method 7: Fallback - file download (last resort)
      try {
        const bytes = Array.from(byteArray);
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `drawer_${Date.now()}.prn`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        await new Promise(resolve => setTimeout(resolve, 500));
        return; // File downloaded, user can open manually
      } catch (fileError: any) {
        // Try next command variation
        continue;
      }
    }

    // If all methods failed, throw error with instructions
    throw new Error(
      'Unable to open cash drawer via RawBT.\n\n' +
      'Troubleshooting Steps:\n\n' +
      '1. Verify RawBT is installed:\n' +
      '   - Install RawBT from Google Play Store if not installed\n' +
      '   - Open RawBT app to verify it works\n\n' +
      '2. Configure RawBT printer:\n' +
      '   - Open RawBT app\n' +
      '   - Settings → Printer → Select your printer\n' +
      '   - Set printer type to "ESC/POS" or "Raw ESC/POS"\n' +
      '   - Enable "Raw Mode" or "Direct ESC/POS"\n' +
      '   - Test opening drawer from RawBT app settings first\n\n' +
      '3. Check browser permissions:\n' +
      '   - Allow the browser to open external apps\n' +
      '   - Check if RawBT appears in app selection when opening drawer\n\n' +
      '4. Alternative: If direct opening fails, a .prn file will download.\n' +
      '   Open it manually with RawBT app.\n\n' +
      '5. Alternative App: Install "ESC POS Bluetooth Print Service" from Play Store'
    );
  }

  /**
   * Build ESC/POS commands for receipt printing
   */
  private buildReceiptCommands(transaction: any, openDrawer: boolean): any[] {
    const commands: any[] = [];
    const ESC = '\x1B';
    const GS = '\x1D';

    // Normalize property names (handle both camelCase and PascalCase)
    const paymentMethod = transaction.paymentMethod || transaction.PaymentMethod || 'cash';
    const amountReceived = transaction.amountReceived || transaction.AmountReceived || 0;
    const change = transaction.change || transaction.Change;

    // Initialize printer
    commands.push(ESC + '@'); // Initialize

    // Open cash drawer IMMEDIATELY at start for faster response
    // Send multiple drawer kicks for better reliability, especially on Android/RawBT
    if (openDrawer) {
      // First drawer kick
      commands.push(this.getDrawerKickCommand());
      // Add delay to ensure command is processed
      commands.push('\x00\x00\x00'); // Multiple NULL commands for delay

      // Second drawer kick for reliability (some printers need retry)
      commands.push(this.getDrawerKickCommand());
      commands.push('\x00\x00\x00');

      // Third drawer kick for maximum reliability
      commands.push(this.getDrawerKickCommand());
      commands.push('\x00\x00\x00');
    }

    // Additional delay to ensure drawer kick is fully processed before printing starts
    // This is especially important for Android/RawBT where timing can be critical
    commands.push('\x00\x00\x00\x00'); // Multiple NULL commands for longer delay

    // Center alignment
    commands.push(ESC + 'a' + '\x01');

    // Store name (large text)
    commands.push(ESC + '!' + '\x10'); // Double height only (reduced from double height and width)
    commands.push('finnbites POS\n');
    commands.push(ESC + '!' + '\x00'); // Reset text size

    // Subtitle and date (matching receipt sidebar)
    commands.push('Point of Sale Terminal\n');
    commands.push(`${this.formatDate(transaction.timestamp)}\n`);
    commands.push(this.drawLine());

    // Left alignment
    commands.push(ESC + 'a' + '\x00');

    // Transaction details (matching receipt sidebar order)
    // Use daily receipt number if available, otherwise fallback to transaction ID
    const receiptNumber = transaction.receiptNumber || transaction.ReceiptNumber || transaction.id || transaction.Id || 'N/A';
    commands.push(`Receipt #: ${receiptNumber}\n`);
    commands.push(`Payment Method: ${this.capitalize(paymentMethod)}\n`);

    // Service Type (matching receipt sidebar)
    if (transaction.serviceType) {
      const serviceTypeDisplay = transaction.serviceType === 'dineIn' ? 'Dine-in' : 'Take-out';
      commands.push(`Service Type: ${serviceTypeDisplay}\n`);
    }

    if (transaction.customerInfo?.name) {
      commands.push(`Customer: ${transaction.customerInfo.name}\n`);
    }

    if (transaction.customerInfo?.phone) {
      commands.push(`Phone: ${transaction.customerInfo.phone}\n`);
    }

    if (transaction.customerInfo?.email) {
      commands.push(`Email: ${transaction.customerInfo.email}\n`);
    }

    commands.push(this.drawLine());

    // Items header (matching receipt sidebar: Item, Qty, Price, Total)
    commands.push(ESC + '!' + '\x08'); // Bold
    commands.push(this.formatItemsHeader());
    commands.push(ESC + '!' + '\x00'); // Reset to normal size (ensure normal font for items and add-ons)

    // Items list (matching receipt sidebar format)
    // Font size is set to normal and will NOT reduce, even when items have add-ons
    if (transaction.items && transaction.items.length > 0) {
      transaction.items.forEach((item: any) => {
        // Ensure normal font size for each item (including add-ons)
        commands.push(ESC + '!' + '\x00'); // Explicitly set normal font size

        // Calculate item total (with discount if applicable)
        const itemTotal = item.price * item.quantity;
        const itemTotalAfterDiscount = item.discount
          ? itemTotal - item.discount.amount
          : itemTotal;

        // Ensure addOns is an array (handle undefined/null/object)
        // Create a deep copy to prevent reference sharing between items
        let addOns: any[] = [];
        if (item.addOns) {
          if (Array.isArray(item.addOns)) {
            // Deep copy to prevent addon sharing between items
            addOns = JSON.parse(JSON.stringify(item.addOns));
          } else if (typeof item.addOns === 'object') {
            // If it's an object, convert to array with deep copy
            addOns = [JSON.parse(JSON.stringify(item.addOns))];
          }
        }

        // Calculate base price per unit (without add-ons)
        // Always calculate from item.price to correctly handle temperature-adjusted prices
        // Account for addon quantities
        const addOnsTotalPerUnit = addOns.reduce((sum: number, addOn: any) => {
          const addonQty = addOn.quantity || 1;
          return sum + ((addOn.price || 0) * addonQty);
        }, 0);
        const basePricePerUnit = item.price - addOnsTotalPerUnit;

        const itemLine = this.formatItemLineDetailed(
          item.name,
          item.quantity,
          basePricePerUnit,
          itemTotalAfterDiscount,
          item.temperature,
          addOns.length > 0 ? addOns : undefined
        );
        commands.push(itemLine);
      });
    }

    commands.push(this.drawLine());

    // Calculate subtotal (sum of item prices)
    const subtotal = transaction.items?.reduce((sum: number, item: any) => {
      return sum + (item.price * item.quantity);
    }, 0) || 0;

    // Calculate total discount
    const discountTotal = transaction.items?.reduce((sum: number, item: any) => {
      if (item.discount) {
        return sum + item.discount.amount;
      }
      return sum;
    }, 0) || 0;

    // Subtotal after discount
    const subtotalAfterDiscount = subtotal - discountTotal;

    // Component of Total: subtotal - discount + serviceFee
    const serviceFee = transaction.serviceFee || 0;
    const total = (transaction.total && transaction.total > 0)
      ? transaction.total
      : (subtotalAfterDiscount + serviceFee);

    // Totals section (matching receipt sidebar format)
    // Show subtotal (Gross)
    commands.push(this.formatTotalLine('Subtotal', subtotal));

    // Show discount if any
    if (discountTotal > 0) {
      let discountLabel = 'Discount';
      // Add discount type if available
      if (transaction.customerInfo?.discountType) {
        const type = transaction.customerInfo.discountType;
        if (type === 'senior') discountLabel = 'Discount (Senior)';
        else if (type === 'pwd') discountLabel = 'Discount (PWD)';
        else if (type === 'manual') discountLabel = 'Discount (Custom)';
      }
      commands.push(this.formatTotalLine(discountLabel, -discountTotal));
    }

    // Service Fee (matching receipt sidebar)
    if (transaction.serviceFee && transaction.serviceFee > 0) {
      const serviceTypeLabel = transaction.serviceType === 'dineIn' ? 'Dine-in (2%)' : 'Take-out';
      commands.push(this.formatTotalLine(`Service Fee (${serviceTypeLabel})`, transaction.serviceFee));
    }

    // Total (bold)
    commands.push(ESC + '!' + '\x08'); // Bold only (reduced from double height, bold)
    commands.push(this.formatTotalLine('TOTAL', total));
    commands.push(ESC + '!' + '\x00'); // Reset

    // Cash Payment Details (if cash payment)
    if (paymentMethod === 'cash' && amountReceived > 0) {
      // Calculate change: Amount Received - Total (matching receipt sidebar logic)
      // Always recalculate to ensure accuracy, matching receipt sidebar's getChange() method
      const calculatedChange = amountReceived - total;
      const finalChange = Math.max(0, calculatedChange);
      commands.push(this.drawLine());
      commands.push(this.formatTotalLine('Amount Received', amountReceived));
      commands.push(this.formatTotalLine('Change', finalChange));
    }

    // Notes (matching receipt sidebar format)
    if (transaction.notes) {
      commands.push(this.drawLine());
      commands.push(ESC + '!' + '\x08'); // Bold
      commands.push('Notes:\n');
      commands.push(ESC + '!' + '\x00'); // Reset
      commands.push(`${transaction.notes}\n`);
    }

    commands.push(this.drawLine());

    // Footer - centered (matching receipt sidebar)
    commands.push(ESC + 'a' + '\x01'); // Center
    commands.push('Thank you for your purchase!\n');
    commands.push('Please keep this receipt for your records\n');

    // QR Code (optional - if you want to add transaction ID or URL)
    // commands.push(this.generateQRCode(transaction.id));

    // Cut paper - reduced blank lines for speed
    commands.push('\n\n');
    commands.push(GS + 'V' + '\x41' + '\x03'); // Partial cut

    return commands;
  }

  /**
   * Get ESC/POS command to open cash drawer
   * This is the standard ESC/POS drawer kick command with stronger pulse
   * Uses multiple methods for maximum compatibility, especially for Android/RawBT
   */
  private getDrawerKickCommand(): string {
    // ESC p m t1 t2
    // m = pin number (0 = pin 2, 1 = pin 5)
    // t1 = ON time (pulse duration in 2ms units) - using 150ms for stronger kick
    // t2 = OFF time (pulse duration in 2ms units) - using 500ms

    // Method 1: Standard ESC/POS drawer kick (both pins with stronger pulse)
    // Pin 2: 150ms pulse (0x4B = 75 * 2ms = 150ms), 500ms off (0xFA = 250 * 2ms = 500ms)
    const pin2 = '\x1B\x70\x00\x4B\xFA'; // Pin 2, 150ms pulse, 500ms off

    // Pin 5: 150ms pulse, 500ms off
    const pin5 = '\x1B\x70\x01\x4B\xFA'; // Pin 5, 150ms pulse, 500ms off

    // Method 2: Alternative drawer command (some printers use this)
    // ESC p 0 50 50 (50 * 2ms = 100ms pulse, 50 * 2ms = 100ms off)
    const altCommand = '\x1B\x70\x00\x32\x32';

    // Method 3: DLE DC4 (some older printers)
    const dleCommand = '\x10\x14';

    // Combine all methods for maximum compatibility
    // Send to both pins, then alternative commands
    return pin2 + pin5 + altCommand + dleCommand;
  }

  /**
   * Get simple drawer kick command (for testing/simpler printers)
   * Just sends Pin 2 command - most common and reliable
   */
  private getSimpleDrawerKickCommand(): string {
    // Simple Pin 2 command: 200ms pulse, 200ms off
    // 0x64 = 100 * 2ms = 200ms
    return '\x1B\x70\x00\x64\x64';
  }

  /**
   * Format items header (compact format)
   */
  private formatItemsHeader(): string {
    // 32 char width: Item (20) | Qty (3) | Amount (9)
    return 'Item                Qty  Amount\n';
  }

  /**
   * Format item line for receipt (compact format)
   * Shows: Item name, Temperature, Quantity, Add-ons, Total
   */
  private formatItemLineDetailed(
    name: string,
    quantity: number,
    unitPrice: number,
    total: number,
    temperature?: string | null,
    addOns?: any[]
  ): string {
    const maxNameLength = 18;
    const truncatedName = name.length > maxNameLength
      ? name.substring(0, maxNameLength - 2) + '..'
      : name;

    // Add temperature indicator
    let tempIndicator = '';
    if (temperature === 'hot') {
      tempIndicator = ' (hot)';
    } else if (temperature === 'cold') {
      tempIndicator = ' (Iced)';
    }

    // Format: "Item Name (hot/cold) x2     ₱100.00" (base price only)
    let nameQtyPart = `${truncatedName}${tempIndicator} x${quantity}`;

    // Show base item price (unitPrice * quantity) in the main line
    const baseItemTotal = unitPrice * quantity;
    const baseItemPriceStr = this.formatPrice(baseItemTotal);
    const baseSpacing = Math.max(1, 32 - nameQtyPart.length - baseItemPriceStr.length);

    // Format base item price line
    let receiptText = `${nameQtyPart}${' '.repeat(baseSpacing)}${baseItemPriceStr}\n`;

    // Format add-ons - display each on its own line with prices and quantities
    if (addOns && addOns.length > 0) {
      addOns.forEach((addOn) => {
        const addonQty = addOn.quantity || 1;
        const qtyPrefix = addonQty > 1 ? `${addonQty}x ` : '';
        const addOnLine = `  + ${qtyPrefix}${addOn.name}`;
        const addOnTotal = addOn.price * addonQty * quantity; // Add-on price * addon qty * item qty
        const addOnPriceStr = this.formatPrice(addOnTotal);
        const addOnSpacing = Math.max(1, 30 - addOnLine.length - addOnPriceStr.length);
        receiptText += `${addOnLine}${' '.repeat(addOnSpacing)}${addOnPriceStr}\n`;
      });
    }

    return receiptText;
  }

  /**
   * Format total line for receipt
   */
  private formatTotalLine(label: string, amount: number): string {
    const priceStr = this.formatPrice(amount);
    const spacing = Math.max(1, 32 - label.length - priceStr.length);
    return `${label}${' '.repeat(spacing)}${priceStr}\n`;
  }

  /**
   * Draw a line separator
   */
  private drawLine(): string {
    return '--------------------------------\n';
  }

  /**
   * Format price for display (matching receipt sidebar: ₱XX.XX)
   */
  private formatPrice(price: number): string {
    if (price === undefined || price === null) return 'Php 0.00';
    // Use "Php" instead of ₱ symbol for thermal printers
    // Most ESC/POS printers don't support the peso symbol (₱) in their character set
    // This ensures reliable printing across all thermal printer models
    return `Php ${price.toFixed(2)}`;
  }

  /**
   * Format date for receipt
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Capitalize first letter
   */
  private capitalize(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Generate QR code command (optional)
   * Encodes transaction ID or custom URL
   */
  private generateQRCode(data: string): string {
    const GS = '\x1D';
    // QR Code ESC/POS commands
    // This is a simplified version - you may need to adjust based on your printer model
    return GS + '(k' + '\x04\x00\x31\x41\x32\x00' + // QR code model
      GS + '(k' + '\x03\x00\x31\x43\x03' + // QR code size
      GS + '(k' + '\x03\x00\x31\x45\x30' + // Error correction
      GS + '(k' + (data.length + 3) + '\x00\x31\x50\x30' + data + // Store data
      GS + '(k' + '\x03\x00\x31\x51\x30'; // Print QR
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

  /**
   * Convert string with ESC/POS codes to byte array
   * Uses TextEncoder for proper UTF-8 encoding of special characters like ₱
   * This ensures escape sequences like \x1B are sent as actual bytes (27)
   * and special characters like peso symbol are properly encoded
   */
  private stringToBytes(str: string): Uint8Array {
    // Use TextEncoder for proper UTF-8 encoding (handles peso symbol ₱ correctly)
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }
}

