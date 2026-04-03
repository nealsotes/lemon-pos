import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment.prod';
import { IngredientLot, IngredientLotDto, IngredientLotUpdateDto } from '../models/ingredient-lot.model';

@Injectable({
  providedIn: 'root'
})
export class IngredientLotService {
  private apiUrl = `${environment.apiUrl}/ingredients`;

  constructor(private http: HttpClient) { }

  getLots(ingredientId: string): Observable<IngredientLot[]> {
    return this.http.get<IngredientLot[]>(`${this.apiUrl}/${ingredientId}/lots`);
  }

  getLot(ingredientId: string, lotId: string): Observable<IngredientLot> {
    return this.http.get<IngredientLot>(`${this.apiUrl}/${ingredientId}/lots/${lotId}`);
  }

  createLot(ingredientId: string, dto: IngredientLotDto): Observable<IngredientLot> {
    return this.http.post<IngredientLot>(`${this.apiUrl}/${ingredientId}/lots`, dto);
  }

  updateLot(ingredientId: string, lotId: string, dto: IngredientLotUpdateDto): Observable<IngredientLot> {
    return this.http.put<IngredientLot>(`${this.apiUrl}/${ingredientId}/lots/${lotId}`, dto);
  }
}
