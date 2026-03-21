import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmDialogState {
  active: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'primary' | 'danger';
  resolve: ((value: boolean) => void) | null;
}

const INITIAL_STATE: ConfirmDialogState = {
  active: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  variant: 'primary',
  resolve: null
};

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  state$ = new BehaviorSubject<ConfirmDialogState>({ ...INITIAL_STATE });

  confirm(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'primary' | 'danger';
  }): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.state$.next({
        active: true,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        variant: options.variant || 'primary',
        resolve
      });
    });
  }

  close(result: boolean): void {
    const current = this.state$.value;
    if (current.resolve) {
      current.resolve(result);
    }
    this.state$.next({ ...INITIAL_STATE });
  }
}
