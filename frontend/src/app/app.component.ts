import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router, NavigationEnd } from '@angular/router';
import { CartService } from './services/cart.service';
import { OfflineService } from './services/offline.service';
import { AuthService } from './services/auth.service';
import { SettingsService, PageSettings } from './services/settings.service';
import { PwaInstallComponent } from './components/pwa-install/pwa-install.component';
import { User, UserRole } from './models/user.model';
import { Subject, takeUntil, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    PwaInstallComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  title = 'Lemon POS Advance';
  cartItemCount = 0;
  isOnline = true;
  mobileMenuOpen = false;
  currentUser: User | null = null;
  isOwner = false;
  isAdmin = false;
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

  ngOnInit() {
    // Check for service worker updates immediately and handle updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          // Listen for service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  // Reload after a short delay to allow user to see the update
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                }
              });
            }
          });

          // Force update check immediately
          registration.update();
          
          // Check for updates every 30 seconds (more frequent)
          setInterval(() => {
            registration.update();
          }, 30000);

          // Also check on visibility change (when user returns to tab)
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              registration.update();
            }
          });
        }
      });
    }

    // Check build version on startup
    this.checkBuildVersion();
    
    // Check if on login page
    this.checkLoginPage();
    
    // Subscribe to route changes
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.checkLoginPage();
      });

    // Subscribe to cart changes
    this.cartService.getCartItems().subscribe(items => {
      this.cartItemCount = items.reduce((total, item) => total + item.quantity, 0);
    });

    // Subscribe to online status
    this.offlineService.isOnline$.subscribe(status => {
      this.isOnline = status;
    });

    // Subscribe to current user
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser = user;
      // Use auth service method which handles both string and number role values
      this.isOwner = this.authService.isOwner();
      this.isAdmin = this.authService.isAdmin();
    });

    // Subscribe to page settings changes
    this.settingsService.pageSettings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.pageSettings = settings;
      this.cdr.detectChanges(); // Trigger change detection when settings update
    });
  }

  private checkLoginPage(): void {
    const url = this.router.url;
    // Hide header/footer on login page and public menu page
    this.isLoginPage = url === '/login' || url.startsWith('/login') || url === '/menu' || url.startsWith('/menu');
  }

  private checkBuildVersion(): void {
    // Fetch build info to verify we have the latest version
    fetch('/build-info.txt')
      .then(response => {
        if (response.ok) {
          return response.text();
        }
        return null;
      })
      .then(buildInfo => {
        if (buildInfo) {
          // Store in sessionStorage to compare on next load
          const previousBuild = sessionStorage.getItem('buildInfo');
          if (previousBuild && previousBuild !== buildInfo) {
            // Force service worker update
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                  registration.update();
                }
              });
            }
          }
          sessionStorage.setItem('buildInfo', buildInfo);
        }
      })
      .catch(err => {
        // Silently handle build info fetch errors
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout() {
    this.authService.logout();
  }

  ngAfterViewInit() {
    // Hide loading screen when app is ready
    setTimeout(() => {
      document.body.classList.add('app-loaded');
    }, 1000);
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  isPageEnabled(path: string): boolean {
    // Admin can see all pages regardless of settings
    if (this.isAdmin) {
      return true;
    }
    const page = this.pageSettings.find(s => s.path === path);
    return page ? page.enabled : true; // Default to enabled if not found
  }
}

