import { Component, EventEmitter, Input, OnInit, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { ExpenseService, ExpenseCategory, ExpenseDto, ExpenseResponse } from '../../../../core/services/expense.service';

@Component({
  selector: 'app-expense-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './expense-modal.component.html',
  styleUrls: ['./expense-modal.component.css']
})
export class ExpenseModalComponent implements OnInit, OnDestroy {
  @Input() expense: ExpenseResponse | null = null; // null = create mode
  @Output() saved = new EventEmitter<ExpenseResponse>();
  @Output() closed = new EventEmitter<void>();

  categories: ExpenseCategory[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  // Form fields
  categoryId = '';
  description = '';
  amount: number | null = null;
  date = '';
  isRecurring = false;
  recurrenceType = 'monthly';
  recurrenceEndDate = '';
  notes = '';

  // New category inline
  showNewCategory = false;
  newCategoryName = '';

  private destroy$ = new Subject<void>();

  constructor(private expenseService: ExpenseService) {}

  ngOnInit(): void {
    this.loadCategories();
    this.date = new Date().toISOString().split('T')[0];

    if (this.expense) {
      this.categoryId = this.expense.categoryId;
      this.description = this.expense.description;
      this.amount = this.expense.amount;
      this.date = this.expense.date.split('T')[0];
      this.isRecurring = this.expense.isRecurring;
      this.recurrenceType = this.expense.recurrenceType || 'monthly';
      this.recurrenceEndDate = this.expense.recurrenceEndDate ? this.expense.recurrenceEndDate.split('T')[0] : '';
      this.notes = this.expense.notes || '';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isEditMode(): boolean {
    return this.expense !== null;
  }

  get isValid(): boolean {
    return !!(this.categoryId && this.description.trim() && this.amount && this.amount > 0 && this.date);
  }

  loadCategories(): void {
    this.isLoading = true;
    this.expenseService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = 'Failed to load categories';
          this.isLoading = false;
        }
      });
  }

  onSave(): void {
    if (!this.isValid || this.isSaving) return;

    this.isSaving = true;
    this.errorMessage = '';

    const dto: ExpenseDto = {
      categoryId: this.categoryId,
      description: this.description.trim(),
      amount: this.amount!,
      date: new Date(this.date).toISOString(),
      isRecurring: this.isRecurring,
      recurrenceType: this.isRecurring ? this.recurrenceType : null,
      recurrenceEndDate: this.isRecurring && this.recurrenceEndDate
        ? new Date(this.recurrenceEndDate).toISOString()
        : null,
      notes: this.notes.trim() || null
    };

    const request$ = this.isEditMode
      ? this.expenseService.updateExpense(this.expense!.id, dto)
      : this.expenseService.createExpense(dto);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.isSaving = false;
        this.saved.emit(result);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage = err?.error?.message || err?.message || 'Failed to save expense';
      }
    });
  }

  onCreateCategory(): void {
    if (!this.newCategoryName.trim()) return;

    this.expenseService.createCategory({ name: this.newCategoryName.trim() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (category) => {
          this.categories.push(category);
          this.categories.sort((a, b) => a.sortOrder - b.sortOrder);
          this.categoryId = category.id;
          this.showNewCategory = false;
          this.newCategoryName = '';
        },
        error: () => {
          this.errorMessage = 'Failed to create category';
        }
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }
}
