import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip adding token to auth endpoints
    if (request.url.includes('/api/auth/')) {
      return next.handle(request);
    }

    const token = this.authService.getToken();
    
    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Check if we're on a public route (menu, login)
          const currentUrl = this.router.url;
          const isPublicRoute = currentUrl === '/menu' || currentUrl.startsWith('/menu') || 
                                currentUrl === '/login' || currentUrl.startsWith('/login');
          
          // Only logout and redirect if not on a public route
          if (!isPublicRoute) {
            this.authService.logout();
          }
        }
        return throwError(() => error);
      })
    );
  }
}





