import {
  Component,
  Input,
  Output,
  EventEmitter,
  ContentChildren,
  QueryList,
  AfterContentInit,
  TemplateRef,
  SimpleChanges,
  OnChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { CellDefDirective } from './cell-def.directive';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  cellTemplate?: string;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, CellDefDirective],
  template: `
    <div class="table-wrapper">
      <table class="data-table" *ngIf="data.length > 0">
        <thead>
          <tr>
            <th *ngIf="selectable" class="checkbox-col">
              <label class="checkbox-wrapper">
                <input type="checkbox"
                  [checked]="isAllSelected()"
                  [indeterminate]="isIndeterminate()"
                  (change)="toggleSelectAll()">
                <span class="checkmark"></span>
              </label>
            </th>
            <th
              *ngFor="let col of columns"
              [style.width]="col.width"
              [style.text-align]="col.align || 'left'"
              [class.sortable]="col.sortable"
              [class.sorted]="sortKey === col.key"
              (click)="col.sortable ? onSort(col.key) : null">
              {{ col.label }}
              <span
                *ngIf="col.sortable"
                class="sort-indicator"
                [class.active]="sortKey === col.key">
                {{ sortKey === col.key ? (sortDirection === 'asc' ? '\u25B2' : '\u25BC') : '\u25B4' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            *ngFor="let row of data"
            [class.clickable]="clickable"
            [class.selected]="selectable && isSelected(row)"
            (click)="onRowClick(row)">
            <td *ngIf="selectable" class="checkbox-col" (click)="$event.stopPropagation()">
              <label class="checkbox-wrapper">
                <input type="checkbox"
                  [checked]="isSelected(row)"
                  (change)="toggleSelect(row)">
                <span class="checkmark"></span>
              </label>
            </td>
            <td
              *ngFor="let col of columns"
              [style.text-align]="col.align || 'left'">
              <ng-container *ngIf="getCellTemplate(col) as tmpl; else plainText">
                <ng-container
                  *ngTemplateOutlet="tmpl; context: { $implicit: row }">
                </ng-container>
              </ng-container>
              <ng-template #plainText>{{ row[col.key] }}</ng-template>
            </td>
          </tr>
        </tbody>
      </table>
      <app-empty-state
        *ngIf="data.length === 0"
        [icon]="emptyIcon"
        [title]="emptyTitle"
        [message]="emptyMessage || 'No data found'"
        [actionLabel]="emptyAction"
        (action)="emptyActionClick.emit()">
      </app-empty-state>
    </div>
  `,
  styles: [`
    .table-wrapper {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-surface);
    }

    .data-table thead {
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .data-table th {
      padding: 12px 16px;
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      text-align: left;
      white-space: nowrap;
      user-select: none;
    }

    .data-table th.sortable {
      cursor: pointer;
      transition: color var(--transition-fast);
    }

    .data-table th.sortable:hover {
      color: var(--text-primary);
    }

    .data-table th.sorted {
      color: var(--text-primary);
    }

    .sort-indicator {
      display: inline-block;
      margin-left: 4px;
      font-size: 0.5rem;
      color: var(--text-muted);
      opacity: 0.4;
      transition: opacity var(--transition-fast);
    }

    .sort-indicator.active {
      opacity: 1;
      color: var(--accent);
    }

    .data-table td {
      padding: 12px 16px;
      font-size: 0.8125rem;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .data-table tbody tr:last-child td {
      border-bottom: none;
    }

    .data-table tbody tr.clickable {
      cursor: pointer;
      transition: background-color var(--transition-fast);
    }

    .data-table tbody tr.clickable:hover {
      background: var(--bg-subtle);
    }

    .data-table tbody tr.selected {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
    }

    .checkbox-col {
      width: 40px;
      padding: 12px 8px 12px 16px !important;
    }

    .checkbox-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }

    .checkbox-wrapper input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .checkmark {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--border-strong, var(--border));
      border-radius: 3px;
      background: var(--bg-surface);
      transition: all 0.15s ease;
    }

    .checkbox-wrapper input:checked + .checkmark {
      background: var(--accent);
      border-color: var(--accent);
    }

    .checkbox-wrapper input:checked + .checkmark::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 1.5px;
      width: 4px;
      height: 8px;
      border: solid var(--text-inverse, #fff);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .checkbox-wrapper input:indeterminate + .checkmark {
      background: var(--accent);
      border-color: var(--accent);
    }

    .checkbox-wrapper input:indeterminate + .checkmark::after {
      content: '';
      position: absolute;
      left: 3px;
      top: 6px;
      width: 8px;
      height: 0;
      border: solid var(--text-inverse, #fff);
      border-width: 0 0 2px 0;
    }

    @media (pointer: coarse) {
      .data-table td {
        padding: 14px 16px;
      }
    }

    @media (max-width: 768px) {
      .data-table {
        min-width: 600px;
      }
    }
  `]
})
export class DataTableComponent implements AfterContentInit, OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() clickable = false;
  @Input() selectable = false;
  @Input() trackBy: string = 'id';
  @Input() emptyIcon = '\uD83D\uDCE6';
  @Input() emptyTitle = '';
  @Input() emptyMessage = '';
  @Input() emptyAction = '';

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<{ key: string; direction: 'asc' | 'desc' }>();
  @Output() selectionChange = new EventEmitter<any[]>();
  @Output() emptyActionClick = new EventEmitter<void>();

  @ContentChildren(CellDefDirective) cellDefs!: QueryList<CellDefDirective>;

  sortKey = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  selectedSet = new Set<any>();

  private cellTemplateMap = new Map<string, TemplateRef<any>>();

  ngAfterContentInit(): void {
    this.buildTemplateMap();
    this.cellDefs.changes.subscribe(() => this.buildTemplateMap());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.selectedSet.size > 0) {
      const newIds = new Set(this.data.map(r => r[this.trackBy]));
      let changed = false;
      for (const id of this.selectedSet) {
        if (!newIds.has(id)) {
          this.selectedSet.delete(id);
          changed = true;
        }
      }
      if (changed) {
        this.emitSelection();
      }
    }
  }

  isSelected(row: any): boolean {
    return this.selectedSet.has(row[this.trackBy]);
  }

  isAllSelected(): boolean {
    return this.data.length > 0 && this.selectedSet.size === this.data.length;
  }

  isIndeterminate(): boolean {
    return this.selectedSet.size > 0 && this.selectedSet.size < this.data.length;
  }

  toggleSelect(row: any): void {
    const key = row[this.trackBy];
    if (this.selectedSet.has(key)) {
      this.selectedSet.delete(key);
    } else {
      this.selectedSet.add(key);
    }
    this.emitSelection();
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedSet.clear();
    } else {
      this.data.forEach(row => this.selectedSet.add(row[this.trackBy]));
    }
    this.emitSelection();
  }

  clearSelection(): void {
    this.selectedSet.clear();
    this.emitSelection();
  }

  private emitSelection(): void {
    const selected = this.data.filter(row => this.selectedSet.has(row[this.trackBy]));
    this.selectionChange.emit(selected);
  }

  onSort(key: string): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = 'asc';
    }
    this.sortChange.emit({ key: this.sortKey, direction: this.sortDirection });
  }

  onRowClick(row: any): void {
    if (this.clickable) {
      this.rowClick.emit(row);
    }
  }

  getCellTemplate(col: TableColumn): TemplateRef<any> | null {
    if (!col.cellTemplate) {
      return null;
    }
    return this.cellTemplateMap.get(col.cellTemplate) || null;
  }

  private buildTemplateMap(): void {
    this.cellTemplateMap.clear();
    if (this.cellDefs) {
      this.cellDefs.forEach(def => {
        this.cellTemplateMap.set(def.columnName, def.templateRef);
      });
    }
  }
}
