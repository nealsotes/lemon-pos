import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { SettingsService, PageSettings } from '../../../core/services/settings.service';
import { UserRole } from '../../models/user.model';

interface TabItem {
  icon: string;
  label: string;
  route: string;
  roles?: UserRole[];
  adminOnly?: boolean;
}

const TAB_ITEMS: TabItem[] = [
  {
    icon: '<path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm-11 11h7v7H3v-7zm11 0h7v7h-7v-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>',
    label: 'POS',
    route: '/pos'
  },
  {
    icon: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zm0 0h12M9 10a3 3 0 006 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Cart',
    route: '/cart'
  },
  {
    icon: '<path d="M3 3v18h18M7 16l4-5 4 4 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Reports',
    route: '/reports',
    roles: [UserRole.Owner, UserRole.Admin]
  },
  {
    icon: '<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Products',
    route: '/products',
    roles: [UserRole.Owner, UserRole.Admin]
  }
];

const MORE_ITEMS: TabItem[] = [
  {
    icon: '<path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4M20 12v4H6a2 2 0 00-2 2c0 1.1.9 2 2 2h12v-4M20 12H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    label: 'Inventory',
    route: '/inventory',
    roles: [UserRole.Owner, UserRole.Admin]
  },
  {
    icon: '<path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>',
    label: 'Settings',
    route: '/settings',
    adminOnly: true
  }
];

@Component({
  selector: 'app-bottom-tab-bar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="bottom-tab-bar" role="navigation" aria-label="Mobile navigation">
      <a *ngFor="let tab of visibleTabs"
         class="tab-item"
         [routerLink]="tab.route"
         routerLinkActive="active">
        <span class="tab-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
               [innerHTML]="getSafeIcon(tab.icon)">
          </svg>
          <span class="tab-badge" *ngIf="tab.route === '/cart' && cartItemCount > 0">
            {{ cartItemCount > 99 ? '99+' : cartItemCount }}
          </span>
        </span>
        <span class="tab-label">{{ tab.label }}</span>
      </a>

      <!-- More tab -->
      <button class="tab-item"
              [class.active]="moreMenuOpen"
              (click)="toggleMoreMenu($event)"
              *ngIf="filteredMoreItems.length > 0 || true">
        <span class="tab-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </span>
        <span class="tab-label">More</span>
      </button>

      <!-- More menu dropdown -->
      <div class="more-menu" *ngIf="moreMenuOpen">
        <a *ngFor="let item of filteredMoreItems"
           class="more-menu-item"
           [routerLink]="item.route"
           routerLinkActive="active"
           (click)="moreMenuOpen = false">
          <span class="more-menu-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                 [innerHTML]="getSafeIcon(item.icon)">
            </svg>
          </span>
          <span>{{ item.label }}</span>
        </a>

        <div class="more-menu-divider"></div>

        <button class="more-menu-item" (click)="onToggleTheme()">
          <span class="more-menu-icon">
            <svg *ngIf="!isDarkMode" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/>
              <path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M8.34 15.66l-1.41 1.41m0-12.73l1.41 1.41m8.73 8.73l1.41 1.41"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <svg *ngIf="isDarkMode" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span>{{ isDarkMode ? 'Light mode' : 'Dark mode' }}</span>
        </button>

        <button class="more-menu-item logout-item" (click)="onLogout()">
          <span class="more-menu-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 17l5-5-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span>Logout</span>
        </button>
      </div>
    </nav>
  `,
  styleUrls: ['./bottom-tab-bar.component.css']
})
export class BottomTabBarComponent implements OnInit, OnDestroy {
  @Input() cartItemCount = 0;
  @Input() isDarkMode = false;

  @Output() toggleTheme = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  visibleTabs: TabItem[] = [];
  filteredMoreItems: TabItem[] = [];
  moreMenuOpen = false;

  private pageSettings: PageSettings[] = [];
  private isOwner = false;
  private isAdmin = false;
  private iconCache = new Map<string, SafeHtml>();
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private settingsService: SettingsService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOwner = this.authService.isOwner();
      this.isAdmin = this.authService.isAdmin();
      this.buildTabs();
    });

    this.settingsService.pageSettings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.pageSettings = settings;
      this.buildTabs();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (this.moreMenuOpen && !target.closest('.more-menu') && !target.closest('.tab-item')) {
      this.moreMenuOpen = false;
    }
  }

  toggleMoreMenu(event: Event): void {
    event.stopPropagation();
    this.moreMenuOpen = !this.moreMenuOpen;
  }

  onToggleTheme(): void {
    this.toggleTheme.emit();
    this.moreMenuOpen = false;
  }

  onLogout(): void {
    this.logout.emit();
    this.moreMenuOpen = false;
  }

  getSafeIcon(icon: string): SafeHtml {
    let safe = this.iconCache.get(icon);
    if (!safe) {
      safe = this.sanitizer.bypassSecurityTrustHtml(icon);
      this.iconCache.set(icon, safe);
    }
    return safe;
  }

  private buildTabs(): void {
    this.visibleTabs = TAB_ITEMS.filter(item => this.isItemVisible(item));
    this.filteredMoreItems = MORE_ITEMS.filter(item => this.isItemVisible(item));
  }

  private isItemVisible(item: TabItem): boolean {
    if (item.adminOnly && !this.isAdmin) {
      return false;
    }

    if (item.roles && item.roles.length > 0) {
      const hasRole = item.roles.some(role => {
        if (role === UserRole.Owner) return this.isOwner;
        if (role === UserRole.Admin) return this.isAdmin;
        return true;
      });
      if (!hasRole) return false;
    }

    if (this.isAdmin) return true;
    const page = this.pageSettings.find(s => s.path === item.route);
    return page ? page.enabled : true;
  }
}
