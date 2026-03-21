import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-quantity-stepper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stepper">
      <button
        type="button"
        class="stepper-btn"
        [disabled]="value <= min"
        (click)="decrement()"
        aria-label="Decrease quantity">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M5 12h14"/>
        </svg>
      </button>
      <span class="stepper-value">{{ value }}</span>
      <button
        type="button"
        class="stepper-btn"
        [disabled]="value >= max"
        (click)="increment()"
        aria-label="Increase quantity">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
  `,
  styles: [`
    .stepper {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .stepper-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .stepper-btn:hover:not(:disabled) {
      background-color: var(--bg-subtle);
      color: var(--text-primary);
    }

    .stepper-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .stepper-value {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      text-align: center;
      user-select: none;
    }
  `]
})
export class QuantityStepperComponent {
  @Input() value = 1;
  @Input() min = 1;
  @Input() max = 99;

  @Output() valueChange = new EventEmitter<number>();

  decrement(): void {
    if (this.value > this.min) {
      this.value--;
      this.valueChange.emit(this.value);
    }
  }

  increment(): void {
    if (this.value < this.max) {
      this.value++;
      this.valueChange.emit(this.value);
    }
  }
}
