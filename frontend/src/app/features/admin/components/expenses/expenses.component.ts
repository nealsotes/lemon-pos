import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { environment } from '../../../../../environments/environment.prod';
import { ExpenseService, ExpenseCategory, ExpenseResponse } from '../../../../core/services/expense.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner/loading-spinner.component';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { DataTableComponent, TableColumn } from '../../../../shared/ui/data-table/data-table.component';
import { CellDefDirective } from '../../../../shared/ui/data-table/cell-def.directive';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TopBarComponent,
    ButtonComponent,
    LoadingSpinnerComponent,
    ExpenseModalComponent,
    DataTableComponent,
    CellDefDirective,
    BadgeComponent
  ],
  templateUrl: './expenses.component.html',
  styleUrls: ['./expenses.component.css']
})
export class ExpensesComponent implements OnInit, OnDestroy {
  expenses: ExpenseResponse[] = [];
  categories: ExpenseCategory[] = [];
  isLoading = false;
  isExporting = false;
  errorMessage = '';

  tableColumns: TableColumn[] = [
    { key: 'date', label: 'Date', cellTemplate: 'date', width: '100px', sortable: true },
    { key: 'categoryName', label: 'Category', cellTemplate: 'category', sortable: true },
    { key: 'description', label: 'Description', cellTemplate: 'description', sortable: true },
    { key: 'isRecurring', label: 'Type', cellTemplate: 'type', width: '110px', sortable: true },
    { key: 'amount', label: 'Amount', cellTemplate: 'amount', align: 'right', sortable: true },
    { key: 'actions', label: '', cellTemplate: 'actions', width: '100px', align: 'right' }
  ];

  sortKey = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Filters
  selectedCategory = '';
  selectedPeriod = 'thisMonth';
  searchQuery = '';
  startDate = new Date();
  endDate = new Date();

  // Modal
  showModal = false;
  editingExpense: ExpenseResponse | null = null;

  // Confirm delete
  showDeleteConfirm = false;
  deletingExpense: ExpenseResponse | null = null;

  private destroy$ = new Subject<void>();
  private loadSub?: Subscription;

  constructor(
    private expenseService: ExpenseService,
    private http: HttpClient,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.setDatePreset('thisMonth');
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data loading ──

  loadExpenses(): void {
    this.loadSub?.unsubscribe();
    this.isLoading = true;
    this.errorMessage = '';
    this.expenses = [];
    const catId = this.selectedCategory || undefined;

    this.loadSub = this.expenseService.getExpenses(this.startDate, this.endDate, catId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (expenses) => {
          this.expenses = expenses;
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = 'Failed to load expenses';
          this.isLoading = false;
        }
      });
  }

  loadCategories(): void {
    this.expenseService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cats) => this.categories = cats,
        error: () => {}
      });
  }

  // ── Filters ──

  setDatePreset(preset: string): void {
    this.selectedPeriod = preset;
    const now = new Date();

    switch (preset) {
      case 'thisMonth':
        this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'lastMonth':
        this.startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        this.endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case '3months':
        this.startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'thisYear':
        this.startDate = new Date(now.getFullYear(), 0, 1);
        this.endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
    }

    this.loadExpenses();
  }

  onCategoryFilterChange(): void {
    this.loadExpenses();
  }

  // ── Computed data ──

  get recurringExpenses(): ExpenseResponse[] {
    const seen = new Set<string>();
    return this.expenses.filter(e => {
      if (!e.isRecurring) return false;
      if (e.isVirtual) {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      }
      return e.parentExpenseId === null;
    });
  }

  get oneTimeExpenses(): ExpenseResponse[] {
    return this.filteredExpenses.filter(e => !e.isRecurring);
  }

  get filteredExpenses(): ExpenseResponse[] {
    if (!this.searchQuery.trim()) return this.expenses;
    const q = this.searchQuery.toLowerCase();
    return this.expenses.filter(e =>
      e.description.toLowerCase().includes(q) ||
      e.categoryName.toLowerCase().includes(q)
    );
  }

  get allExpenses(): ExpenseResponse[] {
    const combined = [...this.recurringExpenses, ...this.oneTimeExpenses];

    const key = this.sortKey as keyof ExpenseResponse;
    if (!key) {
      return combined.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return combined.sort((a, b) => {
      let valA: any = a[key];
      let valB: any = b[key];

      if (key === 'date') {
        return (new Date(valA).getTime() - new Date(valB).getTime()) * dir;
      }
      if (key === 'amount') {
        return ((valA as number) - (valB as number)) * dir;
      }
      if (key === 'isRecurring') {
        return ((valA === valB) ? 0 : valA ? -1 : 1) * dir;
      }

      valA = (valA || '').toString().toLowerCase();
      valB = (valB || '').toString().toLowerCase();
      return valA.localeCompare(valB) * dir;
    });
  }

  onSort(event: { key: string; direction: 'asc' | 'desc' }): void {
    this.sortKey = event.key;
    this.sortDirection = event.direction;
  }

  get totalThisPeriod(): number {
    return this.expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  get recurringMonthlyTotal(): number {
    return this.recurringExpenses.reduce((sum, e) => {
      if (e.recurrenceType === 'weekly') return sum + e.amount * 4.33;
      if (e.recurrenceType === 'yearly') return sum + e.amount / 12;
      return sum + e.amount;
    }, 0);
  }

  get oneTimeTotal(): number {
    return this.oneTimeExpenses.reduce((sum, e) => sum + e.amount, 0);
  }

  // ── Actions ──

  openAddModal(): void {
    this.editingExpense = null;
    this.showModal = true;
  }

  openEditModal(expense: ExpenseResponse): void {
    this.editingExpense = expense;
    this.showModal = true;
  }

  onModalSaved(): void {
    this.showModal = false;
    this.editingExpense = null;
    this.loadExpenses();
  }

  onModalClosed(): void {
    this.showModal = false;
    this.editingExpense = null;
  }

  confirmDelete(expense: ExpenseResponse): void {
    this.deletingExpense = expense;
    this.showDeleteConfirm = true;
  }

  onDeleteConfirmed(): void {
    if (!this.deletingExpense) return;

    this.expenseService.deleteExpense(this.deletingExpense.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showDeleteConfirm = false;
          this.deletingExpense = null;
          this.loadExpenses();
        },
        error: () => {
          this.errorMessage = 'Failed to delete expense';
          this.showDeleteConfirm = false;
        }
      });
  }

  // ── Formatting ──

  formatCurrency(value: number): string {
    return '₱' + value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  getFrequencyLabel(type: string | null): string {
    switch (type) {
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'yearly': return 'Yearly';
      default: return 'Monthly';
    }
  }

  exportExpenses(): void {
    if (this.isExporting) return;
    this.isExporting = true;

    const params = new URLSearchParams({
      format: 'xlsx',
      startDate: this.toIsoNoTz(this.startDate),
      endDate: this.toIsoNoTz(this.endDate)
    });
    if (this.selectedCategory) {
      params.set('categoryId', this.selectedCategory);
    }

    this.http.get(`${environment.apiUrl}/expenses/export?${params.toString()}`, { responseType: 'blob', observe: 'response' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const blob = response.body;
          if (!blob) {
            this.toast.error('Export returned no content.');
            this.isExporting = false;
            return;
          }
          const fallbackName = `expenses_${new Date().toISOString().split('T')[0]}.xlsx`;
          const filename = this.extractFilename(response.headers.get('content-disposition')) ?? fallbackName;
          this.triggerDownload(blob, filename);
          this.toast.success('Expenses export ready.');
          this.isExporting = false;
        },
        error: () => {
          this.toast.error('Export failed. Please try again.');
          this.isExporting = false;
        }
      });
  }

  private toIsoNoTz(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private extractFilename(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition);
    return match ? decodeURIComponent(match[1].replace(/"/g, '')) : null;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
