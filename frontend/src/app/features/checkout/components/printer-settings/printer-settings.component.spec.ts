import { PrinterSettingsComponent } from './printer-settings.component';
import { ThermalPrinterService } from '../../services/thermal-printer.service';

describe('PrinterSettingsComponent explicit transport', () => {
  let component: PrinterSettingsComponent;
  let printer: any;
  const handoff = { status: 'handoff-unconfirmed', transport: 'rawbt', message: 'RawBT handoff requested. Physical printing unconfirmed.' };

  beforeEach(() => {
    printer = jasmine.createSpyObj('ThermalPrinterService', [
      'getPrinter', 'isBluetoothAvailable', 'isBluetoothConnected', 'isAndroid',
      'getTransport', 'setTransport', 'checkPrinter', 'getPrinters', 'setPrinter',
      'printReceipt', 'openCashDrawer', 'shareReceipt', 'downloadReceipt',
      'isQZTrayRunning', 'getQZTrayVersion'
    ]);
    printer.getTransport.and.returnValue('rawbt');
    printer.isAndroid.and.returnValue(true);
    printer.checkPrinter.and.resolveTo('RawBT installation cannot be detected; configure the app first.');
    printer.printReceipt.and.resolveTo(handoff);
    printer.openCashDrawer.and.resolveTo(handoff);
    component = new PrinterSettingsComponent(printer as ThermalPrinterService);
  });

  it('initializes without probing a different transport', async () => {
    await component.ngOnInit();
    expect((component as any).selectedTransport).toBe('rawbt');
    expect(printer.isQZTrayRunning).not.toHaveBeenCalled();
    expect(printer.getPrinters).not.toHaveBeenCalled();
    expect(printer.printReceipt).not.toHaveBeenCalled();
  });

  it('sends a no-drawer dummy test to RawBT without requiring a QZ printer name', async () => {
    await component.testPrint();
    expect(printer.printReceipt).toHaveBeenCalledWith(jasmine.objectContaining({ notes: 'This is a test receipt' }), false);
    expect(printer.openCashDrawer).not.toHaveBeenCalled();
    expect(component.successMessage).toBe(handoff.message);
  });

  it('shares only a dummy receipt and shows cancellation without another send', async () => {
    printer.shareReceipt.and.resolveTo({ status: 'cancelled', transport: 'rawbt', message: 'Sharing cancelled. Nothing else was sent.' });
    await (component as any).shareTestReceipt();
    expect(printer.shareReceipt).toHaveBeenCalledOnceWith(jasmine.objectContaining({ notes: 'This is a test receipt', total: 45.50 }));
    expect(component.successMessage).toBe('Sharing cancelled. Nothing else was sent.');
    expect(printer.downloadReceipt).not.toHaveBeenCalled();
    expect(printer.printReceipt).not.toHaveBeenCalled();
  });

  it('downloads only on the explicit action and does not claim printing', () => {
    printer.downloadReceipt.and.returnValue({ status: 'downloaded', transport: 'rawbt', message: 'Receipt file download requested. Not printed.' });
    (component as any).downloadTestReceipt();
    expect(printer.downloadReceipt).toHaveBeenCalledOnceWith(jasmine.objectContaining({ notes: 'This is a test receipt' }));
    expect(component.successMessage).toContain('Not printed');
    expect(printer.printReceipt).not.toHaveBeenCalled();
  });

  it('uses the typed result message for explicit drawer submission', async () => {
    await component.testDrawer();
    expect(printer.openCashDrawer).toHaveBeenCalledTimes(1);
    expect(printer.printReceipt).not.toHaveBeenCalled();
    expect(component.successMessage).toBe(handoff.message);
  });
});
