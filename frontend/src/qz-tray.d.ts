/**
 * TypeScript declarations for qz-tray
 * QZ Tray is a printing library for web applications
 */

declare module 'qz-tray' {
  export namespace websocket {
    function connect(config?: any): Promise<void>;
    function disconnect(): Promise<void>;
    function isActive(): boolean;
  }

  export namespace printers {
    function find(query?: string): Promise<string[]>;
    function details(printer: string): Promise<any>;
  }

  export namespace configs {
    function create(printer: string | null, options?: any): any;
  }

  export function print(config: any, data: any[]): Promise<void>;

  export namespace api {
    function getVersion(): Promise<string>;
    function getConnectionInfo(): Promise<any>;
  }

  export namespace security {
    function setCertificatePromise(callback: (resolve: any, reject: any) => void): void;
    function setSignaturePromise(callback: (data: string) => Promise<string>): void;
  }

  export namespace hid {
    function listDevices(): Promise<any[]>;
    function openDevice(device: any): Promise<void>;
    function closeDevice(device: any): Promise<void>;
    function sendData(device: any, data: any): Promise<void>;
    function readData(device: any, length: number): Promise<any>;
  }

  export namespace serial {
    function findPorts(): Promise<string[]>;
    function openPort(port: string, options?: any): Promise<void>;
    function closePort(port: string): Promise<void>;
    function sendData(port: string, data: any): Promise<void>;
  }
}

