import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="select-wrapper">
      <label *ngIf="label" class="select-label">{{ label }}</label>
      <div class="select-field">
        <select
          [value]="value"
          (change)="onChange($event)"
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

    .chevron {
      position: absolute;
      right: 10px;
      color: var(--text-muted);
      pointer-events: none;
    }
  `]
})
export class SelectComponent {
  @Input() label = '';
  @Input() options: SelectOption[] = [];
  @Input() value = '';
  @Input() placeholder = '';

  @Output() valueChange = new EventEmitter<string>();

  onChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.value = target.value;
    this.valueChange.emit(this.value);
  }
}
