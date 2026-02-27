import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RecipeLine, RecipeUpdateRequest } from '../models/recipe.model';
import { environment } from '../../../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private apiUrl = `${environment.apiUrl}/recipes`;

  constructor(private http: HttpClient) {}

  getRecipe(productId: string): Observable<RecipeLine[]> {
    return this.http.get<RecipeLine[]>(`${this.apiUrl}/product/${productId}`).pipe(
      catchError(this.handleError)
    );
  }

  setRecipe(productId: string, request: RecipeUpdateRequest): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/product/${productId}`, request).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.error) {
      if (error.error.message) {
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
