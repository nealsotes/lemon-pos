import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { CartService } from './features/checkout/services/cart.service';
import { OfflineService } from './core/services/offline.service';
import { AuthService } from './core/services/auth.service';
import { SettingsService, PageSettings } from './core/services/settings.service';
import { PwaInstallComponent } from './shared/components/pwa-install/pwa-install.component';
import { NavRailComponent } from './shared/ui/nav-rail/nav-rail.component';
import { BottomTabBarComponent } from './shared/ui/bottom-tab-bar/bottom-tab-bar.component';
import { ToastComponent } from './shared/ui/toast/toast.component';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog/confirm-dialog.component';
import { Subject, takeUntil, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    PwaInstallComponent,
    NavRailComponent,
    BottomTabBarComponent,
    ToastComponent,
    ConfirmDialogComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {

  cartItemCount = 0;
  isDarkMode = false;
  isLoginPage = false;
  pageSettings: PageSettings[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private cartService: CartService,
    public offlineService: OfflineService,
    public authService: AuthService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initTheme();

    // Service worker update handling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  setTimeout(() => { window.location.reload(); }, 1000);
                }
              });
            }
          });
          registration.update();
          setInterval(() => { registration.update(); }, 30000);
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { registration.update(); }
          });
        }
      });
    }

    this.checkBuildVersion();
    this.checkLoginPage();

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe(() => { this.checkLoginPage(); });

    this.cartService.getCartItems().subscribe(items => {
      this.cartItemCount = items.reduce((total, item) => total + item.quantity, 0);
    });

    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.cdr.detectChanges();
    });

    this.settingsService.pageSettings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.pageSettings = settings;
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => { document.body.classList.add('app-loaded'); }, 1000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout(): void {
    this.authService.logout();
  }

  toggleTheme(): void {
    const nextTheme = this.isDarkMode ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  isPageEnabled(path: string): boolean {
    const isAdmin = this.authService.isAdmin();
    if (isAdmin) return true;
    const page = this.pageSettings.find(s => s.path === path);
    return page ? page.enabled : true;
  }

  private checkLoginPage(): void {
    const url = this.router.url;
    this.isLoginPage = url === '/login' || url.startsWith('/login') || url === '/menu' || url.startsWith('/menu');
  }

  private checkBuildVersion(): void {
    fetch('/build-info.txt')
      .then(response => response.ok ? response.text() : null)
      .then(buildInfo => {
        if (buildInfo) {
          const previousBuild = sessionStorage.getItem('buildInfo');
          if (previousBuild && previousBuild !== buildInfo) {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) { registration.update(); }
              });
            }
          }
          sessionStorage.setItem('buildInfo', buildInfo);
        }
      })
      .catch(() => {});
  }

  private initTheme(): void {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      this.applyTheme(storedTheme);
      return;
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.applyTheme(prefersDark ? 'dark' : 'light');
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    this.isDarkMode = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.updateThemeColor(theme);
  }

  private updateThemeColor(theme: 'light' | 'dark'): void {
    const metaTheme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!metaTheme) return;
    metaTheme.content = theme === 'dark' ? 'var(--text-primary)' : '#3B82F6';
  }
}
