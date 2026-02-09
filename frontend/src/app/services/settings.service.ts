import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment.prod';

export interface PageSettings {
  path: string;
  name: string;
  enabled: boolean;
  requiresOwner?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly apiUrl = `${environment.apiUrl}/settings`;
  private pageSettingsSubject = new BehaviorSubject<PageSettings[]>(this.getDefaultSettings());
  public pageSettings$: Observable<PageSettings[]> = this.pageSettingsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadSettings();
  }

  private getDefaultSettings(): PageSettings[] {
    return [
      { path: '/pos', name: 'POS', enabled: true, requiresOwner: false },
      { path: '/cart', name: 'Cart', enabled: true, requiresOwner: false },
      { path: '/reports', name: 'Reports', enabled: true, requiresOwner: true },
      { path: '/products', name: 'Products', enabled: true, requiresOwner: true },
      { path: '/inventory', name: 'Inventory', enabled: true, requiresOwner: true },
      { path: '/printer-settings', name: 'Printer Settings', enabled: true, requiresOwner: true },
      { path: '/checkout', name: 'Checkout', enabled: true, requiresOwner: false },
      { path: '/receipt', name: 'Receipt', enabled: true, requiresOwner: false }
    ];
  }

  private loadSettings(): void {
    this.http.get<PageSettings[]>(`${this.apiUrl}/pages`).pipe(
      tap(settings => {
        // Merge with defaults to ensure all pages are included
        const defaults = this.getDefaultSettings();
        const merged = defaults.map(defaultSetting => {
          const storedSetting = settings.find(s => s.path === defaultSetting.path);
          return storedSetting || defaultSetting;
        });
        this.pageSettingsSubject.next(merged);
      }),
      catchError(error => {
        console.error('Error loading settings:', error);
        // Use defaults on error
        this.pageSettingsSubject.next(this.getDefaultSettings());
        return of(this.getDefaultSettings());
      })
    ).subscribe();
  }

  getPageSettings(): PageSettings[] {
    return this.pageSettingsSubject.value;
  }

  isPageEnabled(path: string): boolean {
    const settings = this.pageSettingsSubject.value;
    const page = settings.find(s => s.path === path);
    return page ? page.enabled : true; // Default to enabled if not found
  }

  togglePage(path: string): void {
    const settings = this.pageSettingsSubject.value;
    const updated = settings.map(setting => {
      if (setting.path === path) {
        return { ...setting, enabled: !setting.enabled };
      }
      return setting;
    });
    this.pageSettingsSubject.next(updated);
    this.saveSettings(updated);
  }

  setPageEnabled(path: string, enabled: boolean): void {
    const settings = this.pageSettingsSubject.value;
    const updated = settings.map(setting => {
      if (setting.path === path) {
        return { ...setting, enabled };
      }
      return setting;
    });
    this.pageSettingsSubject.next(updated);
    this.saveSettings(updated);
  }

  resetToDefaults(): void {
    this.http.post<PageSettings[]>(`${this.apiUrl}/pages/reset`, {}).pipe(
      tap(settings => {
        this.pageSettingsSubject.next(settings);
      }),
      catchError(error => {
        console.error('Error resetting settings:', error);
        const defaults = this.getDefaultSettings();
        this.pageSettingsSubject.next(defaults);
        return of(defaults);
      })
    ).subscribe();
  }

  private saveSettings(settings: PageSettings[]): void {
    this.http.post(`${this.apiUrl}/pages`, settings).pipe(
      tap(() => {
        // Reload settings from server after successful save to ensure sync
        this.loadSettings();
      }),
      catchError(error => {
        console.error('Error saving settings:', error);
        // Reload settings on error to revert to server state
        this.loadSettings();
        return of(null);
      })
    ).subscribe();
  }

  reloadSettings(): void {
    this.loadSettings();
  }
}




