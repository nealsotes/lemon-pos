import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chip-group',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chip-group">
      <button
        type="button"
        class="chip"
        [class.active]="!selected"
        (click)="onSelect('')">
        {{ allLabel }}
      </button>
      <button
        *ngFor="let chip of chips"
        type="button"
        class="chip"
        [class.active]="selected === chip"
        (click)="onSelect(chip)">
        {{ chip }}
      </button>
    </div>
  `,
  styles: [`
    .chip-group {
      display: flex;
      gap: var(--spacing-sm);
      overflow-x: auto;
      flex-wrap: nowrap;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .chip-group::-webkit-scrollbar {
      display: none;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      padding: 0 12px;
      border: none;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      background-color: var(--bg-subtle);
      color: var(--text-secondary);
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .chip:hover:not(.active) {
      background-color: var(--border);
      color: var(--text-primary);
    }

    .chip.active {
      background-color: var(--accent);
      color: var(--text-inverse);
    }
  `]
})
export class ChipGroupComponent {
  @Input() chips: string[] = [];
  @Input() selected = '';
  @Input() allLabel = 'All';

  @Output() selectedChange = new EventEmitter<string>();

  onSelect(value: string): void {
    this.selected = value;
    this.selectedChange.emit(value);
  }
}
