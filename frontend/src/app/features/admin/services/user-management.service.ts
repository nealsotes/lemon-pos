import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment.prod';
import { UserAccount, CreateUserRequest } from '../../../shared/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserManagementService {
  private readonly apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getUsers(): Observable<UserAccount[]> {
    return this.http.get<UserAccount[]>(this.apiUrl);
  }

  createUser(request: CreateUserRequest): Observable<UserAccount> {
    return this.http.post<UserAccount>(this.apiUrl, request);
  }

  setUserPassword(userId: string, password: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${userId}/password`, { password });
  }

  setUserStatus(userId: string, isActive: boolean): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/${userId}/status`, { isActive });
  }
}