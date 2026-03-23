import { Component, Input, Optional, Self, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, NgControl } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ],
  template: `
    <div class="input-wrapper">
      <label *ngIf="label" class="input-label">
        {{ label }}<span *ngIf="required" class="required-mark"> *</span>
      </label>
      <div class="input-field" [class.has-error]="showError" [class.has-prefix]="prefixIcon" [class.disabled]="disabled">
        <span *ngIf="prefixIcon" class="prefix-icon" [innerHTML]="prefixIcon"></span>
        <input
          [type]="type"
          [placeholder]="placeholder"
          [value]="value"
          [disabled]="disabled"
          (input)="onInput($event)"
          (blur)="onTouched()"
          class="input-control" />
      </div>
      <span *ngIf="hint && !showError" class="input-hint">{{ hint }}</span>
      <span *ngIf="showError" class="input-error">{{ errorMessage }}</span>
    </div>
  `,
  styles: [`
    .input-wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .input-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .required-mark {
      color: var(--danger);
    }

    .input-field {
      position: relative;
      display: flex;
      align-items: center;
    }

    .prefix-icon {
      position: absolute;
      left: 10px;
      display: flex;
      align-items: center;
      color: var(--text-muted);
      pointer-events: none;
    }

    .prefix-icon ::ng-deep svg {
      width: 14px;
      height: 14px;
    }

    .input-control {
      width: 100%;
      height: 32px;
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 13px;
      background-color: var(--bg-surface);
      color: var(--text-primary);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .has-prefix .input-control {
      padding-left: 32px;
    }

    .input-control:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.15);
    }

    .input-control::placeholder {
      color: var(--text-muted);
    }

    .has-error .input-control {
      border-color: var(--danger);
    }

    .has-error .input-control:focus {
      box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.15);
    }

    .input-error {
      font-size: 12px;
      color: var(--danger);
    }

    .input-hint {
      font-size: 0.6875rem;
      color: var(--text-muted);
    }

    .disabled .input-control {
      opacity: 0.5;
      cursor: not-allowed;
    }

    @media (pointer: coarse) {
      .input-control {
        min-height: 44px;
        padding: 12px 14px;
        font-size: 1rem;
      }
    }
  `]
})
export class InputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type = 'text';
  @Input() prefixIcon = '';
  @Input() required = false;
  @Input() hint = '';
  @Input() errorMessages: Record<string, string> = {};

  value = '';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  private defaultErrorMessages: Record<string, string> = {
    required: 'This field is required',
    email: 'Invalid email address'
  };

  constructor(@Optional() @Self() public ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: string): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  get showError(): boolean {
    const control = this.ngControl?.control;
    return !!(control && control.invalid && control.touched);
  }

  get errorMessage(): string {
    const errors = this.ngControl?.control?.errors;
    if (!errors) {
      return '';
    }

    const firstKey = Object.keys(errors)[0];
    const errorValue = errors[firstKey];

    if (this.errorMessages[firstKey]) {
      return this.errorMessages[firstKey];
    }

    switch (firstKey) {
      case 'required':
        return this.defaultErrorMessages['required'];
      case 'minlength':
        return `Must be at least ${errorValue.requiredLength} characters`;
      case 'min':
        return `Must be at least ${errorValue.min}`;
      case 'max':
        return `Must be at most ${errorValue.max}`;
      case 'email':
        return this.defaultErrorMessages['email'];
      default:
        return 'Invalid value';
    }
  }
}
