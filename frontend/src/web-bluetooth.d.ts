/**
 * Web Bluetooth API TypeScript definitions
 */

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  
  watchAdvertisements(): Promise<void>;
  unwatchAdvertisements(): void;
  addEventListener(type: 'gattserverdisconnected', listener: (this: this, ev: Event) => any): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (this: this, ev: Event) => any): void;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothRemoteGATTService extends EventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
  
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  
  getDescriptor(descriptor: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor>;
  getDescriptors(descriptor?: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor[]>;
  readValue(): Promise<DataView>;
  writeValue(value: ArrayBuffer | ArrayBufferView): Promise<void>;
  writeValueWithoutResponse(value: ArrayBuffer | ArrayBufferView): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTDescriptor {
  readonly characteristic: BluetoothRemoteGATTCharacteristic;
  readonly uuid: string;
  
  readValue(): Promise<DataView>;
  writeValue(value: ArrayBuffer | ArrayBufferView): Promise<void>;
}

interface BluetoothCharacteristicProperties {
  readonly broadcast: boolean;
  readonly read: boolean;
  readonly writeWithoutResponse: boolean;
  readonly write: boolean;
  readonly notify: boolean;
  readonly indicate: boolean;
  readonly authenticatedSignedWrites: boolean;
  readonly reliableWrite: boolean;
  readonly writableAuxiliaries: boolean;
}

interface BluetoothLEScanFilter {
  readonly services?: BluetoothServiceUUID[];
  readonly name?: string;
  readonly namePrefix?: string;
  readonly manufacturerData?: BluetoothManufacturerDataFilter[];
  readonly serviceData?: BluetoothServiceDataFilter[];
}

interface BluetoothManufacturerDataFilter {
  readonly companyIdentifier: number;
  readonly dataPrefix?: BufferSource;
  readonly mask?: BufferSource;
}

interface BluetoothServiceDataFilter {
  readonly service: BluetoothServiceUUID;
  readonly dataPrefix?: BufferSource;
  readonly mask?: BufferSource;
}

interface BluetoothRequestDeviceFilter {
  readonly services?: BluetoothServiceUUID[];
  readonly name?: string;
  readonly namePrefix?: string;
  readonly manufacturerData?: BluetoothManufacturerDataFilter[];
  readonly serviceData?: BluetoothServiceDataFilter[];
}

interface BluetoothLEScanOptions {
  readonly filters?: BluetoothLEScanFilter[];
  readonly acceptAllAdvertisements?: boolean;
  readonly keepRepeatedDevices?: boolean;
}

interface BluetoothRequestDeviceOptions {
  filters?: BluetoothRequestDeviceFilter[];
  acceptAllDevices?: boolean;
  optionalServices?: BluetoothServiceUUID[];
  optionalManufacturerData?: number[];
}

interface RequestDeviceOptions {
  filters: any[];
  optionalServices: any[];
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;
type BluetoothDescriptorUUID = number | string;

interface Bluetooth extends EventTarget {
  readonly availability: boolean;
  
  requestDevice(options?: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
  requestLEScan(options?: BluetoothLEScanOptions): Promise<BluetoothLEScan>;
  getAvailability(): Promise<boolean>;
  getDevices(): Promise<BluetoothDevice[]>;
  addEventListener(type: 'availabilitychanged', listener: (this: this, ev: Event) => any): void;
  removeEventListener(type: 'availabilitychanged', listener: (this: this, ev: Event) => any): void;
}

interface BluetoothLEScan extends EventTarget {
  readonly active: boolean;
  readonly acceptAllAdvertisements: boolean;
  readonly filters: BluetoothLEScanFilter[];
  
  stop(): void;
  addEventListener(type: 'advertisementreceived', listener: (this: this, ev: Event) => any): void;
  removeEventListener(type: 'advertisementreceived', listener: (this: this, ev: Event) => any): void;
}

interface Navigator {
  bluetooth?: Bluetooth;
}

interface BluetoothDeviceEvent extends Event {
  readonly device: BluetoothDevice;
}


