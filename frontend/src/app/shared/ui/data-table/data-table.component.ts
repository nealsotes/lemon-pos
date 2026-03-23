import {
  Component,
  Input,
  Output,
  EventEmitter,
  ContentChildren,
  QueryList,
  AfterContentInit,
  TemplateRef
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
            (click)="onRowClick(row)">
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
export class DataTableComponent implements AfterContentInit {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() clickable = false;
  @Input() emptyIcon = '\uD83D\uDCE6';
  @Input() emptyTitle = '';
  @Input() emptyMessage = '';
  @Input() emptyAction = '';

  @Output() rowClick = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<{ key: string; direction: 'asc' | 'desc' }>();
  @Output() emptyActionClick = new EventEmitter<void>();

  @ContentChildren(CellDefDirective) cellDefs!: QueryList<CellDefDirective>;

  sortKey = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  private cellTemplateMap = new Map<string, TemplateRef<any>>();

  ngAfterContentInit(): void {
    this.buildTemplateMap();
    this.cellDefs.changes.subscribe(() => this.buildTemplateMap());
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
