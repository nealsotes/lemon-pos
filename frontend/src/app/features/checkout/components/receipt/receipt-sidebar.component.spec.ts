import { ChangeDetectorRef } from '@angular/core';
import { ReceiptSidebarComponent } from './receipt-sidebar.component';
import { ThermalPrinterService } from '../../services/thermal-printer.service';

describe('ReceiptSidebarComponent printing safety', () => {
  let component: ReceiptSidebarComponent;
  let printer: jasmine.SpyObj<ThermalPrinterService>;
  const handoff = { status: 'handoff-unconfirmed', transport: 'rawbt', message: 'RawBT handoff requested. Printing is unconfirmed.' };

  beforeEach(() => {
    printer = jasmine.createSpyObj('ThermalPrinterService', ['printReceipt', 'openCashDrawer']);
    printer.printReceipt.and.returnValue(Promise.resolve(handoff) as any);
    printer.openCashDrawer.and.returnValue(Promise.resolve(handoff) as any);
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['markForCheck', 'detectChanges']);
    component = new ReceiptSidebarComponent(cdr, printer);
    component.transaction = { id: 'DUMMY-ONLY', items: [{ name: 'Dummy', quantity: 1, price: 10 }], total: 10 };
  });

  it('prints an existing receipt without opening the drawer or changing the sale', async () => {
    const before = JSON.stringify(component.transaction);
    const newSale = spyOn(component.newSale, 'emit');
    await component.printReceipt();
    expect(printer.printReceipt).toHaveBeenCalledOnceWith(component.transaction, false);
    expect(printer.openCashDrawer).not.toHaveBeenCalled();
    expect(JSON.stringify(component.transaction)).toBe(before);
    expect(newSale).not.toHaveBeenCalled();
  });

  it('shows an unconfirmed handoff rather than claiming printing succeeded', async () => {
    await component.printReceipt();
    expect((component as any).printMessage).toBe(handoff.message);
    expect(component.isPrinting).toBeFalse();
  });

  it('only sends the drawer action from its explicit control', async () => {
    await component.openCashDrawer();
    expect(printer.openCashDrawer).toHaveBeenCalledTimes(1);
    expect(printer.printReceipt).not.toHaveBeenCalled();
    expect((component as any).printMessage).toBe(handoff.message);
  });

  it('prevents a second receipt send while the first is pending', async () => {
    let finish!: (value: any) => void;
    const result = new Promise(resolve => finish = resolve);
    printer.printReceipt.and.returnValue(result as any);
    const pending = component.printReceipt();
    const duplicate = component.printReceipt();
    expect(printer.printReceipt).toHaveBeenCalledTimes(1);
    finish(handoff);
    await Promise.all([pending, duplicate]);
  });
});
