import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="input-wrapper">
      <label *ngIf="label" class="input-label">{{ label }}</label>
      <div class="input-field" [class.has-error]="error" [class.has-prefix]="prefixIcon">
        <span *ngIf="prefixIcon" class="prefix-icon" [innerHTML]="prefixIcon"></span>
        <input
          [type]="type"
          [placeholder]="placeholder"
          [value]="value"
          (input)="onInput($event)"
          class="input-control" />
      </div>
      <span *ngIf="error" class="input-error">{{ error }}</span>
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
  `]
})
export class InputComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type = 'text';
  @Input() value = '';
  @Input() error = '';
  @Input() prefixIcon = '';

  @Output() valueChange = new EventEmitter<string>();

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.valueChange.emit(this.value);
  }
}
