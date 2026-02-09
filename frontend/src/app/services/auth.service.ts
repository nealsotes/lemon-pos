import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { User, UserRole, LoginResponse } from '../models/user.model';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // Check for existing token on service initialization
    this.checkStoredToken();
  }

  login(username: string, password: string, rememberMe: boolean = false): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, {
      username,
      password,
      rememberMe
    }).pipe(
      tap(response => {
        this.setUser(response, rememberMe);
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  logout(): void {
    // Remove token from both storages
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_expires');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_expires');
    
    // Clear current user
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    
    // Navigate to login
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  }

  getUserRole(): UserRole | string | number | null {
    const user = this.currentUserSubject.value;
    return user ? user.role : null;
  }

  isTokenValid(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    const expires = this.getExpirationDate();
    if (!expires) {
      return false;
    }

    return new Date(expires) > new Date();
  }

  isOwner(): boolean {
    const role = this.getUserRole();
    if (role === null || role === undefined) return false;
    // Handle both number and string comparisons
    // Backend sends enum as string with camelCase due to JsonStringEnumConverter
    if (typeof role === 'string') {
      const roleLower = role.toLowerCase();
      return roleLower === 'owner' || roleLower === 'dinein';
    }
    // Handle number enum value (UserRole.Owner = 1)
    if (typeof role === 'number') {
      return role === UserRole.Owner || role === 1;
    }
    // Handle enum directly
    return role === UserRole.Owner;
  }

  isEmployee(): boolean {
    const role = this.getUserRole();
    if (role === null || role === undefined) return false;
    // Handle both number and string comparisons
    if (typeof role === 'string') {
      const roleLower = role.toLowerCase();
      return roleLower === 'employee' || roleLower === 'takeout';
    }
    // Handle number enum value (UserRole.Employee = 2)
    if (typeof role === 'number') {
      return role === UserRole.Employee || role === 2;
    }
    // Handle enum directly
    return role === UserRole.Employee;
  }

  isAdmin(): boolean {
    const role = this.getUserRole();
    if (role === null || role === undefined) return false;
    // Handle both number and string comparisons
    if (typeof role === 'string') {
      const roleLower = role.toLowerCase();
      return roleLower === 'admin';
    }
    // Handle number enum value (UserRole.Admin = 3)
    if (typeof role === 'number') {
      return role === UserRole.Admin || role === 3;
    }
    // Handle enum directly
    return role === UserRole.Admin;
  }

  private setUser(response: LoginResponse, rememberMe: boolean): void {
    // Convert role to number enum - backend may send as string ("owner"/"employee"/"admin") or number (1/2/3)
    let role: UserRole = UserRole.Employee;
    if (typeof response.role === 'number') {
      role = response.role as UserRole;
    } else if (typeof response.role === 'string') {
      // Convert string to enum number
      const roleStr = response.role.toLowerCase();
      if (roleStr === 'owner' || roleStr === 'dinein') {
        role = UserRole.Owner; // 1
      } else if (roleStr === 'employee' || roleStr === 'takeout') {
        role = UserRole.Employee; // 2
      } else if (roleStr === 'admin') {
        role = UserRole.Admin; // 3
      }
    }
    
    const user: User = {
      id: '', // Will be extracted from token if needed
      username: response.username,
      role: role,
      token: response.token,
      expiresAt: new Date(response.expiresAt)
    };

    const storage = this.getStorage(rememberMe);
    storage.setItem('auth_token', response.token);
    storage.setItem('auth_user', JSON.stringify(user));
    storage.setItem('auth_expires', response.expiresAt);

    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
  }

  private checkStoredToken(): void {
    // Check both localStorage and sessionStorage
    let token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (token && this.isTokenValid()) {
      const userJson = localStorage.getItem('auth_user') || sessionStorage.getItem('auth_user');
      if (userJson) {
        try {
          const parsedUser = JSON.parse(userJson);
          // Convert role to number enum - may be stored as string or number
          let role: UserRole = UserRole.Employee;
          if (typeof parsedUser.role === 'number') {
            role = parsedUser.role as UserRole;
          } else if (typeof parsedUser.role === 'string') {
            const roleStr = parsedUser.role.toLowerCase();
            if (roleStr === 'owner' || roleStr === 'dinein') {
              role = UserRole.Owner;
            } else if (roleStr === 'employee' || roleStr === 'takeout') {
              role = UserRole.Employee;
            } else if (roleStr === 'admin') {
              role = UserRole.Admin;
            }
          }
          
          const user: User = {
            id: parsedUser.id || '',
            username: parsedUser.username,
            role: role,
            token: parsedUser.token,
            expiresAt: parsedUser.expiresAt ? new Date(parsedUser.expiresAt) : undefined
          };
          this.currentUserSubject.next(user);
          this.isAuthenticatedSubject.next(true);
        } catch (e) {
          // Invalid stored user, clear everything
          this.logout();
        }
      }
    } else {
      // Token expired or doesn't exist - clear but don't navigate
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_expires');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_user');
      sessionStorage.removeItem('auth_expires');
    }
  }

  private getStorage(rememberMe: boolean = false): Storage {
    return rememberMe ? localStorage : sessionStorage;
  }

  private getExpirationDate(): string | null {
    return localStorage.getItem('auth_expires') || sessionStorage.getItem('auth_expires');
  }

  validateToken(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      return new Observable<boolean>(observer => {
        observer.next(false);
        observer.complete();
      });
    }

    return this.http.post<{ valid: boolean; username?: string; role?: UserRole | string | number }>(
      `${this.apiUrl}/validate`,
      { token }
    ).pipe(
      map((response): boolean => {
        if (response.valid && response.username && response.role !== undefined && response.role !== null) {
          // Convert role to number enum - backend may send as string or number
          let role: UserRole = UserRole.Employee;
          const roleValue = response.role;
          if (typeof roleValue === 'number') {
            role = roleValue as UserRole;
          } else if (typeof roleValue === 'string') {
            const roleStr = roleValue.toLowerCase();
            if (roleStr === 'owner' || roleStr === 'dinein') {
              role = UserRole.Owner;
            } else if (roleStr === 'employee' || roleStr === 'takeout') {
              role = UserRole.Employee;
            } else if (roleStr === 'admin') {
              role = UserRole.Admin;
            }
          }
          
          const user: User = {
            id: '',
            username: response.username,
            role: role
          };
          this.currentUserSubject.next(user);
          this.isAuthenticatedSubject.next(true);
          return true;
        }
        return false;
      }),
      catchError(() => {
        this.logout();
        return new Observable<boolean>(observer => {
          observer.next(false);
          observer.complete();
        });
      })
    );
  }
}


