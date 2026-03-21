import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toasts: Toast[] = [];
  private nextId = 0;

  toasts$ = new BehaviorSubject<Toast[]>([]);

  success(message: string): void {
    this.addToast(message, 'success');
  }

  error(message: string): void {
    this.addToast(message, 'error');
  }

  info(message: string): void {
    this.addToast(message, 'info');
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.map(t =>
      t.id === id ? { ...t, visible: false } : t
    );
    this.toasts$.next([...this.toasts]);

    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
      this.toasts$.next([...this.toasts]);
    }, 200);
  }

  private addToast(message: string, type: Toast['type']): void {
    const id = this.nextId++;
    const toast: Toast = { id, message, type, visible: true };
    this.toasts = [...this.toasts, toast];
    this.toasts$.next([...this.toasts]);

    setTimeout(() => this.dismiss(id), 4000);
  }
}
