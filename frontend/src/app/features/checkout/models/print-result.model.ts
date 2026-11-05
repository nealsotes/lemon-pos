export enum PrintTransport {
  Qz = 'qz',
  RawBt = 'rawbt',
  Bluetooth = 'bluetooth',
  Backend = 'backend'
}

export enum PrintStatus {
  Submitted = 'submitted',
  HandoffUnconfirmed = 'handoff-unconfirmed',
  Downloaded = 'downloaded',
  Cancelled = 'cancelled'
}

export interface PrintResult {
  status: PrintStatus;
  transport: PrintTransport;
  message: string;
}
