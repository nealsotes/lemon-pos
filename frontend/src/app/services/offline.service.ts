import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, fromEvent, merge, of, interval } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  public isOnline$ = new BehaviorSubject<boolean>(true);
  private backendUrl = '/api/health'; // Backend health check endpoint (public, no auth required)
  private checkInterval = 30000; // Check every 30 seconds

  constructor(private http: HttpClient) {
    // Initial backend check
    this.checkBackendStatus();

    // Listen to browser online/offline events
    merge(
      fromEvent(window, 'online'),
      fromEvent(window, 'offline')
    ).subscribe(() => {
      this.checkBackendStatus();
    });

    // Periodic backend health check
    interval(this.checkInterval).subscribe(() => {
      this.checkBackendStatus();
    });
  }

  private checkBackendStatus(): void {
    // Check if browser is offline first
    if (!navigator.onLine) {
      this.isOnline$.next(false);
      return;
    }

    // Ping the backend API to verify it's accessible
    // Use health endpoint which is public and doesn't require authentication
    this.http.get(this.backendUrl, { 
      observe: 'response',
      responseType: 'json'
    })
    .pipe(
      timeout(5000), // 5 second timeout
      map(() => true),
      catchError((error) => {
        // 401/403 errors mean unauthorized, not offline - backend is still online
        // Only treat network errors or 5xx errors as offline
        if (error.status === 401 || error.status === 403) {
          return of(true); // Backend is online, just unauthorized
        }
        return of(false); // Network error or server error = offline
      })
    )
    .subscribe(isBackendOnline => {
      this.isOnline$.next(isBackendOnline);
    });
  }

  isOnline(): boolean {
    return this.isOnline$.value;
  }

  // Force an immediate backend check
  checkNow(): void {
    this.checkBackendStatus();
  }

  showOfflineMessage(): string {
    return 'Backend is offline. Data will be synchronized when connection is restored.';
  }

  showOnlineMessage(): string {
    return 'Backend connected. Synchronizing data...';
  }
}
