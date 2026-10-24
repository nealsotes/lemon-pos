import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment.prod';

export type ImportKind = 'products' | 'ingredients' | 'expenses';

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResultReport {
  kind: string;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
}

// Reusable CSV/XLSX import dialog — one component for products, ingredients and
// expenses. Mirrors the confirm-dialog look (backdrop + dialog-card) so it feels
// native to the app. Uploads multipart FormData to <api>/x/import and shows the
// row-level report the backend returns; emits (imported) so the host page reloads.
const IMPORT_META: Record<ImportKind, { title: string; endpoint: string; hint: string }> = {
  products: {
    title: 'Import Products',
    endpoint: `${environment.apiUrl}/products/import`,
    hint: 'Columns match the Products export: Name, Category, Price, Hot Price, Cold Price, Stock, Low Stock Threshold, Status. Existing products are matched by name and updated; new names are added.'
  },
  ingredients: {
    title: 'Import Ingredients',
    endpoint: `${environment.apiUrl}/ingredients/import`,
    hint: 'Columns match the Ingredients export: Name, Quantity, Unit, Unit Cost, Supplier, Low Stock Threshold, Expiration (YYYY-MM-DD), Status. Existing items are matched by name and updated; new names are added.'
  },
  expenses: {
    title: 'Import Expenses',
    endpoint: `${environment.apiUrl}/expenses/import`,
    hint: 'Columns match the Expenses export: Date (YYYY-MM-DD), Category, Description, Amount, Recurring, Recurrence, Notes. Every row adds a new expense; unknown categories are created automatically.'
  }
};

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-backdrop" *ngIf="isOpen" (click)="close()">
      <div class="dialog-card" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h3 class="dialog-title">{{ meta.title }}</h3>
          <button type="button" class="dialog-close" (click)="close()" aria-label="Close">&times;</button>
        </div>

        <!-- Pick a file -->
        <div class="dialog-body" *ngIf="state === 'pick'">
          <p class="dialog-hint">{{ meta.hint }}</p>
          <div class="drop-zone" [class.drop-zone-active]="!!selectedFile" (click)="fileInput.click()">
            <input #fileInput type="file" accept=".csv,.xlsx" (change)="onFilePicked($event)" hidden />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span class="drop-zone-file" *ngIf="selectedFile">{{ selectedFile.name }}</span>
            <span class="drop-zone-text" *ngIf="!selectedFile">Click to choose a .csv or .xlsx file</span>
          </div>
          <p class="dialog-error" *ngIf="fileError">{{ fileError }}</p>
        </div>

        <!-- Uploading -->
        <div class="dialog-body" *ngIf="state === 'uploading'">
          <p class="dialog-message">Uploading and importing… large files can take a moment.</p>
          <div class="spinner-ring"><div class="spinner"></div></div>
        </div>

        <!-- Result -->
        <div class="dialog-body" *ngIf="state === 'result' && result">
          <div class="result-strip">
            <span class="result-card"><span class="result-value">{{ result.created }}</span><span class="result-label">Added</span></span>
            <span class="result-card"><span class="result-value">{{ result.updated }}</span><span class="result-label">Updated</span></span>
            <span class="result-card"><span class="result-value">{{ result.skipped }}</span><span class="result-label">Skipped</span></span>
          </div>
          <div class="error-list" *ngIf="result.errors?.length">
            <p class="error-title">{{ result.errors.length }} row(s) failed:</p>
            <ul>
              <li *ngFor="let err of result.errors">
                <span class="error-row">Row {{ err.row }}:</span>
                {{ err.message }}
              </li>
            </ul>
          </div>
          <p class="dialog-message" *ngIf="!result.errors?.length" style="color: var(--success);">
            No errors — all rows imported.
          </p>
        </div>

        <div class="dialog-footer">
          <button type="button" class="btn-cancel" (click)="close()" *ngIf="state !== 'uploading'">
            {{ state === 'result' ? 'Close' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="btn-confirm btn-confirm-primary"
            *ngIf="state === 'pick'"
            [disabled]="!selectedFile"
            (click)="upload()">
            Import
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
    }

    .dialog-card {
      background-color: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 460px;
      margin: var(--spacing-md);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-md) 0;
    }

    .dialog-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .dialog-close {
      background: none;
      border: none;
      color: var(--text-tertiary);
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    }

    .dialog-close:hover {
      color: var(--text-primary);
    }

    .dialog-body {
      padding: var(--spacing-sm) var(--spacing-md);
      max-height: 60vh;
      overflow-y: auto;
    }

    .dialog-hint {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0 0 var(--spacing-sm);
    }

    .dialog-message {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin: 0 0 var(--spacing-sm);
    }

    .dialog-error {
      font-size: 12px;
      color: var(--danger, #dc3545);
      margin: var(--spacing-sm) 0 0;
    }

    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: var(--spacing-lg) var(--spacing-md);
      border: 2px dashed var(--border);
      border-radius: var(--radius-md);
      cursor: pointer;
      text-align: center;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .drop-zone:hover,
    .drop-zone-active {
      border-color: var(--accent);
      background: rgba(120, 120, 120, 0.05);
    }

    .drop-zone-text {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .drop-zone-file {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      word-break: break-all;
    }

    .spinner-ring {
      display: flex;
      justify-content: center;
      padding: var(--spacing-md) 0;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: import-spin 0.8s linear infinite;
    }

    @keyframes import-spin {
      to { transform: rotate(360deg); }
    }

    .result-strip {
      display: flex;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-sm);
    }

    .result-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--spacing-sm) 0;
      background: var(--bg-page, rgba(128, 128, 128, 0.06));
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }

    .result-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .result-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .error-list {
      border-top: 1px solid var(--border);
      padding-top: var(--spacing-sm);
    }

    .error-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--danger, #dc3545);
      margin: 0 0 6px;
    }

    .error-list ul {
      margin: 0;
      padding-left: 16px;
      max-height: 180px;
      overflow-y: auto;
    }

    .error-list li {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .error-row {
      font-weight: 600;
      color: var(--text-primary);
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 0 var(--spacing-md) var(--spacing-md);
    }

    .btn-cancel {
      padding: 8px 16px;
      font-size: 13px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
    }

    .btn-confirm {
      padding: 8px 16px;
      font-size: 13px;
      border-radius: var(--radius-md);
      border: none;
      cursor: pointer;
    }

    .btn-confirm-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-confirm-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .btn-confirm-primary:not(:disabled):hover {
      filter: brightness(1.08);
    }
  `]
})
export class ImportDialogComponent {
  @Input() kind: ImportKind = 'products';
  @Output() imported = new EventEmitter<ImportResultReport>();

  isOpen = false;
  state: 'pick' | 'uploading' | 'result' = 'pick';
  selectedFile: File | null = null;
  fileError = '';
  result: ImportResultReport | null = null;

  constructor(private http: HttpClient) {}

  get meta() {
    // meta is only read while the dialog is open; the map is static.
    return IMPORT_META[this.kind];
  }

  open(): void {
    this.selectedFile = null;
    this.fileError = '';
    this.result = null;
    this.state = 'pick';
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    const endsWithSupported = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.xlsx');
    if (!endsWithSupported) {
      this.fileError = 'Only .csv and .xlsx files are supported.';
      this.selectedFile = null;
      return;
    }

    this.fileError = '';
    this.selectedFile = file;
    input.value = '';
  }

  upload(): void {
    if (!this.selectedFile || this.state === 'uploading') return;

    const formData = new FormData();
    formData.append('file', this.selectedFile, this.selectedFile.name);

    this.state = 'uploading';
    this.http
      .post<ImportResultReport>(this.meta.endpoint, formData)
      .subscribe({
        next: report => {
          this.result = report;
          this.state = 'result';
          this.imported.emit(report);
        },
        error: err => {
          const message =
            (err?.error && typeof err.error === 'string' && err.error) ||
            err?.error?.message ||
            err?.message ||
            'Import failed. Please try again.';
          this.fileError = message;
          this.state = 'pick';
        }
      });
  }
}