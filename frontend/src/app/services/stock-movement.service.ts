import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.prod';
import { StockMovement } from '../models/stock-movement.model';

@Injectable({
  providedIn: 'root'
})
export class StockMovementService {
  private apiUrl = `${environment.apiUrl}/stockmovements`;

  constructor(private http: HttpClient) {}

  getAllMovements(ingredientId?: string, startDate?: Date, endDate?: Date): Observable<StockMovement[]> {
    let params = new HttpParams();
    if (ingredientId) {
      params = params.set('ingredientId', ingredientId);
    }
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    return this.http.get<StockMovement[]>(this.apiUrl, { params });
  }

  getMovementById(id: string): Observable<StockMovement> {
    return this.http.get<StockMovement>(`${this.apiUrl}/${id}`);
  }

  getMovementsByIngredient(ingredientId: string): Observable<StockMovement[]> {
    return this.http.get<StockMovement[]>(this.apiUrl, {
      params: new HttpParams().set('ingredientId', ingredientId)
    });
  }

  createMovement(movement: StockMovement): Observable<StockMovement> {
    return this.http.post<StockMovement>(this.apiUrl, movement);
  }

  deleteMovement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}


