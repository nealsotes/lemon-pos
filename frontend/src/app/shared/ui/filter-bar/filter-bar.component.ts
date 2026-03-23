import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SearchInputComponent } from '../search-input/search-input.component';
import { ChipGroupComponent } from '../chip-group/chip-group.component';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, SearchInputComponent, ChipGroupComponent],
  template: `
    <div class="filter-bar">
      <div class="filter-bar-header">
        <div *ngIf="title" class="filter-bar-title-group">
          <h3 class="filter-bar-title">{{ title }}</h3>
          <span *ngIf="subtitle" class="filter-bar-subtitle">{{ subtitle }}</span>
        </div>
        <div class="filter-bar-controls">
          <app-search-input
            [placeholder]="searchPlaceholder"
            [value]="searchValue"
            (search)="searchChange.emit($event)">
          </app-search-input>
          <select
            *ngIf="sortOptions.length > 0"
            [value]="sortValue"
            (change)="onSortChange($event)"
            class="sort-select">
            <option *ngFor="let opt of sortOptions" [value]="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>
      <div *ngIf="categories.length > 0" class="filter-bar-chips">
        <app-chip-group
          [chips]="categories"
          [selected]="selectedCategory"
          allLabel="All"
          (selectedChange)="categoryChange.emit($event)">
        </app-chip-group>
      </div>
    </div>
  `,
  styles: [`
    .filter-bar {
      display: flex;
      flex-direction: column;
    }

    .filter-bar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border);
    }

    .filter-bar-title-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .filter-bar-title {
      font-family: var(--font-display);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .filter-bar-subtitle {
      font-size: 0.6875rem;
      color: var(--text-muted);
    }

    .filter-bar-controls {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .sort-select {
      padding: 6px 12px;
      font-size: 0.8125rem;
      font-family: var(--font-ui);
      color: var(--text-primary);
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      outline: none;
      cursor: pointer;
      height: 32px;
    }

    .sort-select:focus {
      border-color: var(--accent);
    }

    .filter-bar-chips {
      padding: var(--spacing-sm) var(--spacing-lg);
      border-bottom: 1px solid var(--border);
      background: var(--bg-subtle);
    }

    @media (max-width: 768px) {
      .filter-bar-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--spacing-sm);
      }

      .filter-bar-controls {
        width: 100%;
      }
    }

    @media (max-width: 640px) {
      .filter-bar-controls {
        flex-direction: column;
        gap: 4px;
      }

      .sort-select {
        width: 100%;
      }
    }

    @media (pointer: coarse) {
      .sort-select {
        height: 40px;
        padding: 8px 14px;
      }
    }
  `]
})
export class FilterBarComponent {
  @Input() searchPlaceholder = 'Search...';
  @Input() searchValue = '';
  @Input() sortOptions: { value: string; label: string }[] = [];
  @Input() sortValue = '';
  @Input() categories: string[] = [];
  @Input() selectedCategory = '';
  @Input() title = '';
  @Input() subtitle = '';

  @Output() searchChange = new EventEmitter<string>();
  @Output() sortChange = new EventEmitter<string>();
  @Output() categoryChange = new EventEmitter<string>();

  onSortChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sortChange.emit(target.value);
  }
}
