import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { SettingsService, PageSettings } from '../../../core/services/settings.service';
import { NAV_ITEMS, NavItem } from './nav-items';
import { UserRole } from '../../models/user.model';

@Component({
  selector: 'app-nav-rail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="nav-rail"
         [class.expanded]="!collapsed"
         (mouseenter)="collapsed = false"
         (mouseleave)="collapsed = true"
         role="navigation"
         aria-label="Main navigation">
      <div class="nav-rail-top">
        <div class="nav-logo">
          <span class="logo-icon">LP</span>
          <span class="logo-text" *ngIf="!collapsed">Lemon POS</span>
        </div>
      </div>

      <div class="nav-rail-items">
        <a *ngFor="let item of filteredItems"
           class="nav-item"
           [routerLink]="item.route"
           routerLinkActive="active"
           [title]="collapsed ? item.label : ''">
          <span class="nav-item-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                 [innerHTML]="getSafeIcon(item.icon)">
            </svg>
            <span class="cart-badge" *ngIf="item.route === '/cart' && cartItemCount > 0">
              {{ cartItemCount > 99 ? '99+' : cartItemCount }}
            </span>
          </span>
          <span class="nav-item-label">{{ item.label }}</span>
        </a>
      </div>

      <div class="nav-rail-bottom">
        <button class="nav-action-btn"
                (click)="toggleTheme.emit()"
                [title]="collapsed ? (isDarkMode ? 'Light mode' : 'Dark mode') : ''">
          <span class="nav-item-icon">
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
          <span class="nav-item-label">{{ isDarkMode ? 'Light mode' : 'Dark mode' }}</span>
        </button>

        <button class="nav-action-btn logout-btn"
                (click)="logout.emit()"
                [title]="collapsed ? 'Logout' : ''">
          <span class="nav-item-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 17l5-5-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="nav-item-label">Logout</span>
        </button>
      </div>
    </nav>
  `,
  styleUrls: ['./nav-rail.component.css']
})
export class NavRailComponent implements OnInit, OnDestroy {
  @Input() collapsed = true;
  @Input() cartItemCount = 0;
  @Input() isDarkMode = false;

  @Output() toggleTheme = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  filteredItems: NavItem[] = [];
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
      this.buildFilteredItems();
    });

    this.settingsService.pageSettings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.pageSettings = settings;
      this.buildFilteredItems();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getSafeIcon(icon: string): SafeHtml {
    let safe = this.iconCache.get(icon);
    if (!safe) {
      safe = this.sanitizer.bypassSecurityTrustHtml(icon);
      this.iconCache.set(icon, safe);
    }
    return safe;
  }

  private buildFilteredItems(): void {
    this.filteredItems = NAV_ITEMS.filter(item => {
      // Admin-only check
      if (item.adminOnly && !this.isAdmin) {
        return false;
      }

      // Role check
      if (item.roles && item.roles.length > 0) {
        const hasRole = item.roles.some(role => {
          if (role === UserRole.Owner) return this.isOwner;
          if (role === UserRole.Admin) return this.isAdmin;
          return true;
        });
        if (!hasRole) return false;
      }

      // Page settings check — admin sees all regardless
      if (this.isAdmin) return true;
      const page = this.pageSettings.find(s => s.path === item.route);
      return page ? page.enabled : true;
    });
  }
}
