import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Ingredient } from '../models/ingredient.model';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class IngredientService {
  private apiUrl = `${environment.apiUrl}/ingredients`;

  constructor(private http: HttpClient) {}

  getAllIngredients(): Observable<Ingredient[]> {
    return this.http.get<Ingredient[]>(this.apiUrl).pipe(
      catchError(this.handleError)
    );
  }

  getIngredientById(id: string): Observable<Ingredient> {
    return this.http.get<Ingredient>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  createIngredient(ingredient: Ingredient): Observable<Ingredient> {
    return this.http.post<Ingredient>(this.apiUrl, ingredient).pipe(
      catchError(this.handleError)
    );
  }

  updateIngredient(id: string, ingredient: Ingredient): Observable<Ingredient> {
    return this.http.put<Ingredient>(`${this.apiUrl}/${id}`, ingredient).pipe(
      catchError(this.handleError)
    );
  }

  deleteIngredient(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  getLowStockIngredients(threshold?: number): Observable<Ingredient[]> {
    const url = threshold !== undefined 
      ? `${this.apiUrl}/low-stock?threshold=${threshold}`
      : `${this.apiUrl}/low-stock`;
    return this.http.get<Ingredient[]>(url).pipe(
      catchError(this.handleError)
    );
  }

  adjustQuantity(id: string, adjustment: number): Observable<Ingredient> {
    return this.http.post<Ingredient>(`${this.apiUrl}/${id}/adjust-quantity`, { adjustment }).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.error) {
      if (error.error.errors && Array.isArray(error.error.errors)) {
        errorMessage = `Validation errors: ${error.error.errors.join(', ')}`;
      } else if (error.error.message) {
        errorMessage = error.error.message;
      } else if (typeof error.error === 'string') {
        errorMessage = error.error;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => ({ message: errorMessage, error: error.error }));
  }
}

