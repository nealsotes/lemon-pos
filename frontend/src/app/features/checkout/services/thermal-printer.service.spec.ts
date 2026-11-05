import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import * as qz from 'qz-tray';
import { ThermalPrinterService } from './thermal-printer.service';

describe('ThermalPrinterService transport configuration', () => {
  beforeEach(() => localStorage.clear());
  it('defaults Android to RawBT, migrates legacy Android only, persists choices and printer', () => {
    const ua = spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Android');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const create = (): any => new ThermalPrinterService(http);
    expect(create().getTransport()).toBe('rawbt');
    localStorage.setItem('mobilePrintMethod', 'backend');
    ua.and.returnValue('Desktop Chrome');
    expect(create().getTransport()).toBe('qz');
    ua.and.returnValue('Android');
    const service = create();
    expect(service.getTransport()).toBe('backend');
    service.setTransport('bluetooth');
    expect(localStorage.getItem('thermalPrintTransport')).toBe('bluetooth');
    expect(create().getTransport()).toBe('bluetooth');
    service.setPrinter('Saved');
    expect(create().getPrinter()).toBe('Saved');
  });
  afterEach(() => localStorage.clear());

  it('submits only to selected QZ, never kicks by default, and never falls back on failure', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Desktop Chrome');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.post.and.returnValue(throwError(() => new Error('backend forbidden')));
    spyOn(qz.websocket, 'isActive').and.returnValue(true);
    spyOn(qz.configs, 'create').and.returnValue({} as any);
    const print = spyOn(qz, 'print').and.resolveTo();
    const service: any = new ThermalPrinterService(http);
    service.setPrinter('Local');
    const tx = { items: [{ name: 'Coffee', price: 55, quantity: 1 }], total: 55 };
    expect((await service.printReceipt(tx)).status).toBe('submitted');
    const text = atob(print.calls.mostRecent().args[1][0].data as string);
    expect(text).toContain('Lemon POS');
    expect(text).toContain('Php 55.00');
    expect(text).not.toContain('\x1Bp');
    expect(http.post).not.toHaveBeenCalled();
    print.and.rejectWith(new Error('partial send'));
    await expectAsync(service.printReceipt(tx)).toBeRejectedWithError(/partial send/);
    expect(http.post).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('hands RawBT off once synchronously with exact drawer bytes and never falls back', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Android');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http);
    const launch = spyOn(service, 'launchExternalApp');
    const pending = service.openCashDrawer();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(atob(String(launch.calls.mostRecent().args[0]).split(',')[1])).toBe('\x1Bp\x00\x4B\xFA');
    expect((await pending).status).toBe('handoff-unconfirmed');
    launch.calls.reset();
    expect((await service.printReceipt({items: []})).status).toBe('handoff-unconfirmed');
    expect(atob(String(launch.calls.mostRecent().args[0]).split(',')[1])).not.toContain('\x1Bp');
    launch.and.throwError('launch blocked');
    await expectAsync(service.printReceipt({items: []})).toBeRejectedWithError('launch blocked');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('routes backend receipt and drawer only when selected and propagates failure without QZ', async () => {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.post.and.returnValue(of({success: true}));
    const service: any = new ThermalPrinterService(http);
    service.setTransport('backend');
    const connect = spyOn(service, 'connect');
    expect((await service.printReceipt({items: []})).status).toBe('submitted');
    expect(http.post.calls.mostRecent().args[0]).toBe('/api/print/receipt?openDrawer=false');
    await service.printReceipt({items: []}, true);
    expect(http.post.calls.mostRecent().args[0]).toBe('/api/print/receipt?openDrawer=true');
    await service.openCashDrawer();
    expect(http.post.calls.mostRecent().args[0]).toBe('/api/print/drawer');
    http.post.and.returnValue(throwError(() => new Error('offline')));
    await expectAsync(service.openCashDrawer()).toBeRejectedWithError('offline');
    expect(connect).not.toHaveBeenCalled();
  });

  it('gives actionable guidance when the store-local backend is unreachable and never claims success', async () => {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const unreachable = {status: 0, message: 'Http failure response'};
    http.post.and.returnValue(throwError(() => unreachable));
    const service: any = new ThermalPrinterService(http);
    service.setTransport('backend');
    await expectAsync(service.printReceipt({items: []})).toBeRejectedWithError(/store-local.*(reach|address|network)|Check.*(server|queue)/i);
    const drawerError = {status: 0, message: 'Http failure response'};
    http.post.and.callFake(() => { throw drawerError; });
    await expectAsync(service.openCashDrawer()).toBeRejectedWithError(/Check.*queue|store-local/i);
    expect(http.post).toHaveBeenCalled();
  });

  it('checks the selected path without sending receipt or drawer commands', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Android');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http);
    const launch = spyOn(service, 'launchExternalApp');
    expect(await service.checkPrinter()).toMatch(/cannot|unconfirmed|verify/i);
    expect(launch).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    service.setTransport('backend');
    http.get.and.returnValue(of({printers: ['Store']}));
    expect(await service.getPrinters()).toEqual(['Store']);
    expect(http.get.calls.mostRecent().args[0]).toBe('/api/print/printers');
    await service.checkPrinter();
    expect(http.get.calls.mostRecent().args[0]).toBe('/api/print/printers');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('rejects missing desktop printer and unsupported mobile QZ/RawBT without alternate attempts', async () => {
    const ua = spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Desktop Chrome');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http);
    const connect = spyOn(qz.websocket, 'connect').and.rejectWith(new Error('desktop required'));
    spyOn(qz, 'print').and.rejectWith(new Error('unexpected print'));
    await expectAsync(service.printReceipt({items: []})).toBeRejectedWithError(/printer.*settings/i);
    ua.and.returnValue('iPhone');
    const mobile: any = new ThermalPrinterService(http);
    mobile.setPrinter('Saved');
    await expectAsync(mobile.printReceipt({items: []})).toBeRejectedWithError(/desktop/i);
    mobile.setTransport('rawbt');
    await expectAsync(mobile.printReceipt({items: []})).toBeRejectedWithError(/Android/i);
    expect(connect).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('treats explicit share cancellation as cancelled without launching, printing or downloading', async () => {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http);
    const launch = spyOn(service, 'launchExternalApp');
    const download = spyOn(service, 'downloadReceipt');
    const share = jasmine.createSpy('share').and.rejectWith(new DOMException('cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', {configurable: true, value: share});
    Object.defineProperty(navigator, 'canShare', {configurable: true, value: () => true});
    try {
      expect((await service.shareReceipt({items: []})).status).toBe('cancelled');
      expect(share).toHaveBeenCalledTimes(1);
      expect(launch).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    } finally {
      delete (navigator as any).share;
      delete (navigator as any).canShare;
    }
  });

  it('downloads only on explicit request and never claims physical printing', () => {
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http);
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const result = service.downloadReceipt({items: []});
    expect(result.status).toBe('downloaded');
    expect(result.message).toMatch(/not.*print|not.*confirm/i);
    expect(click).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('cancels a BLE picker once without retry or alternate transport', async () => {
    const request = jasmine.createSpy('requestDevice').and.rejectWith(new DOMException('cancelled', 'NotFoundError'));
    Object.defineProperty(navigator, 'bluetooth', {configurable: true, value: {requestDevice: request}});
    try {
      const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
      const service: any = new ThermalPrinterService(http);
      service.setTransport('bluetooth');
      const launch = spyOn(service, 'launchExternalApp');
      await expectAsync(service.connectBluetooth()).toBeRejected();
      expect(request).toHaveBeenCalledTimes(1);
      expect(launch).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
    } finally { delete (navigator as any).bluetooth; }
  });

  it('validates BLE writability and writes bounded chunks using the supported mode with no retry after partial send', async () => {
    const write = jasmine.createSpy('writeValueWithResponse').and.resolveTo();
    const characteristic = {properties: {write: true, writeWithoutResponse: false}, writeValueWithResponse: write};
    const gattService = {getCharacteristic: jasmine.createSpy().and.resolveTo(characteristic)};
    const server = {connected: true, getPrimaryService: jasmine.createSpy().and.resolveTo(gattService), disconnect: jasmine.createSpy()};
    const device = {name: 'BLE', gatt: {connect: jasmine.createSpy().and.resolveTo(server), connected: true, disconnect: jasmine.createSpy()}};
    const request = jasmine.createSpy().and.resolveTo(device);
    Object.defineProperty(navigator, 'bluetooth', {configurable: true, value: {requestDevice: request}});
    try {
      const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
      const service: any = new ThermalPrinterService(http);
      service.setTransport('bluetooth');
      const launch = spyOn(service, 'launchExternalApp');
      await service.connectBluetooth();
      expect((await service.printReceipt({items: []})).status).toBe('submitted');
      expect(write.calls.count()).toBeGreaterThan(1);
      write.calls.allArgs().forEach(args => expect((args[0] as ArrayBuffer).byteLength).toBeLessThanOrEqual(20));
      write.calls.reset();
      write.and.callFake(() => write.calls.count() === 1 ? Promise.resolve() : Promise.reject(new Error('partial write')));
      await expectAsync(service.printReceipt({items: []})).toBeRejectedWithError(/partial write/);
      expect(write).toHaveBeenCalledTimes(2);
      expect(launch).not.toHaveBeenCalled();
      expect(http.post).not.toHaveBeenCalled();
      characteristic.properties.write = false;
      await expectAsync(service.connectBluetooth()).toBeRejectedWithError(/compatible|writ/i);
    } finally { delete (navigator as any).bluetooth; }
  });

  it('discovers QZ printers on first setup without a saved printer', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Desktop Chrome');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    spyOn(qz.websocket, 'isActive').and.returnValue(true);
    spyOn(qz.printers, 'find').and.resolveTo(['Actual printer'] as any);
    const service = new ThermalPrinterService(http);
    expect(await service.checkPrinter()).toMatch(/select.*printer/i);
    expect(await service.getPrinters()).toEqual(['Actual printer']);
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('uses documented QZ raw command base64 to preserve binary bytes', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Desktop Chrome');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    spyOn(qz.websocket, 'isActive').and.returnValue(true);
    spyOn(qz.configs, 'create').and.returnValue({} as any);
    const print = spyOn(qz, 'print').and.resolveTo();
    const service = new ThermalPrinterService(http);
    service.setPrinter('Dummy');
    await service.openCashDrawer();
    const job = print.calls.mostRecent().args[1][0] as any;
    expect(job.type).toBe('raw');
    expect(job.format).toBe('command');
    expect(job.flavor).toBe('base64');
    expect(typeof job.data).toBe('string');
    if (typeof job.data === 'string') expect(atob(job.data)).toBe('\x1Bp\x00\x4B\xFA');
  });

  it('preserves receipt text UTF-8 while keeping raw drawer command bytes intact', async () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Android');
    const service = new ThermalPrinterService(jasmine.createSpyObj('HttpClient', ['get', 'post']));
    const launch = spyOn(service, 'launchExternalApp');
    await service.printReceipt({ items: [{ name: 'Café 茶', price: 10, quantity: 1 }], notes: 'Thank you — café', total: 10 });
    const binary = atob(launch.calls.mostRecent().args[0].split(',')[1]);
    const text = new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    expect(text).toContain('Café 茶');
    expect(text).toContain('Thank you — café');
    expect(binary).not.toContain('\x1Bp');
  });

  it('defaults desktop to QZ without contacting the backend', () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('Desktop Chrome');
    const http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    const service: any = new ThermalPrinterService(http as HttpClient);
    expect(service.getTransport()).toBe('qz');
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});
