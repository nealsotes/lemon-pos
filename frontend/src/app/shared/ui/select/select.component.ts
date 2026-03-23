import { Component, Input, Optional, Self, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR, ControlValueAccessor, NgControl } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ],
  template: `
    <div class="select-wrapper">
      <label *ngIf="label" class="select-label">
        {{ label }}<span *ngIf="required" class="required-mark"> *</span>
      </label>
      <div class="select-field" [class.has-error]="showError" [class.disabled]="disabled">
        <select
          [value]="value"
          [disabled]="disabled"
          (change)="onSelectChange($event)"
          (blur)="onTouched()"
          class="select-control">
          <option *ngIf="placeholder" value="" disabled [selected]="!value">
            {{ placeholder }}
          </option>
          <option *ngFor="let opt of options" [value]="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      <span *ngIf="showError" class="select-error">{{ errorMessage }}</span>
    </div>
  `,
  styles: [`
    .select-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .select-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .required-mark {
      color: var(--danger);
    }

    .select-field {
      position: relative;
      display: flex;
      align-items: center;
    }

    .select-control {
      width: 100%;
      height: 32px;
      padding: 6px 32px 6px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 13px;
      background-color: var(--bg-surface);
      color: var(--text-primary);
      appearance: none;
      cursor: pointer;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .select-control:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
    }

    .has-error .select-control {
      border-color: var(--danger);
    }

    .has-error .select-control:focus {
      box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.15);
    }

    .select-error {
      font-size: 12px;
      color: var(--danger);
    }

    .disabled .select-control {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .chevron {
      position: absolute;
      right: 10px;
      color: var(--text-muted);
      pointer-events: none;
    }

    @media (pointer: coarse) {
      .select-control {
        min-height: 44px;
        padding: 8px 32px 8px 14px;
        font-size: 1rem;
      }
    }
  `]
})
export class SelectComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() options: SelectOption[] = [];
  @Input() placeholder = '';
  @Input() required = false;
  @Input() errorMessages: Record<string, string> = {};

  value = '';
  disabled = false;

  private changeFn: (value: string) => void = () => {};
  private touchedFn: () => void = () => {};

  private readonly defaultErrorMessages: Record<string, string> = {
    required: 'This field is required'
  };

  constructor(@Optional() @Self() public ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.value = target.value;
    this.changeFn(this.value);
    this.touchedFn();
  }

  onTouched(): void {
    this.touchedFn();
  }

  get showError(): boolean {
    return !!(this.ngControl?.control?.touched && this.ngControl?.control?.errors);
  }

  get errorMessage(): string {
    const errors = this.ngControl?.control?.errors;
    if (!errors) {
      return '';
    }
    const firstKey = Object.keys(errors)[0];
    return this.errorMessages[firstKey]
      || this.defaultErrorMessages[firstKey]
      || firstKey;
  }
}
