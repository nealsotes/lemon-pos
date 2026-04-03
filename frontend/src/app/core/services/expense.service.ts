import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment.prod';

export interface ExpenseCategory {
  id: string;
  name: string;
  isSystem: boolean;
  sortOrder: number;
}

export interface ExpenseResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: number;
  date: string;
  isRecurring: boolean;
  recurrenceType: string | null;
  recurrenceEndDate: string | null;
  parentExpenseId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  isVirtual: boolean;
}

export interface ExpenseDto {
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  isRecurring: boolean;
  recurrenceType?: string | null;
  recurrenceEndDate?: string | null;
  notes?: string | null;
}

export interface ExpenseCategoryDto {
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Expense CRUD
  getExpenses(startDate: Date, endDate: Date, categoryId?: string): Observable<ExpenseResponse[]> {
    const params: any = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
    if (categoryId) params.categoryId = categoryId;
    return this.http.get<ExpenseResponse[]>(`${this.apiUrl}/expenses`, { params });
  }

  getExpense(id: string): Observable<ExpenseResponse> {
    return this.http.get<ExpenseResponse>(`${this.apiUrl}/expenses/${id}`);
  }

  createExpense(dto: ExpenseDto): Observable<ExpenseResponse> {
    return this.http.post<ExpenseResponse>(`${this.apiUrl}/expenses`, dto);
  }

  updateExpense(id: string, dto: ExpenseDto): Observable<ExpenseResponse> {
    return this.http.put<ExpenseResponse>(`${this.apiUrl}/expenses/${id}`, dto);
  }

  deleteExpense(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/expenses/${id}`);
  }

  // Category CRUD
  getCategories(): Observable<ExpenseCategory[]> {
    return this.http.get<ExpenseCategory[]>(`${this.apiUrl}/expense-categories`);
  }

  createCategory(dto: ExpenseCategoryDto): Observable<ExpenseCategory> {
    return this.http.post<ExpenseCategory>(`${this.apiUrl}/expense-categories`, dto);
  }

  updateCategory(id: string, dto: ExpenseCategoryDto): Observable<ExpenseCategory> {
    return this.http.put<ExpenseCategory>(`${this.apiUrl}/expense-categories/${id}`, dto);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/expense-categories/${id}`);
  }
}
