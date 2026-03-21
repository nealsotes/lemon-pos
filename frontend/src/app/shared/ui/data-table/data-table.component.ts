import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: string;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <div class="table-wrapper">
      <table class="data-table" *ngIf="data.length > 0">
        <thead>
          <tr>
            <th
              *ngFor="let col of columns"
              [style.width]="col.width"
              [style.text-align]="col.align || 'left'">
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <ng-content></ng-content>
        </tbody>
      </table>
      <app-empty-state
        *ngIf="data.length === 0"
        [message]="emptyMessage || 'No data found'">
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
      background-color: var(--bg-surface);
    }

    .data-table thead {
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .data-table th {
      padding: 8px 12px;
      background-color: var(--bg-subtle);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
      text-align: left;
    }

    .data-table ::ng-deep td {
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border);
    }

    .data-table ::ng-deep tbody tr:hover {
      background-color: var(--bg-subtle);
    }

    .data-table ::ng-deep tbody tr:last-child td {
      border-bottom: none;
    }
  `]
})
export class DataTableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() emptyMessage = '';
}
