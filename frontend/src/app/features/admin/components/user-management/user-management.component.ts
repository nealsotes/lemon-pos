import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { UserAccount } from '../../../../shared/models/user.model';
import { UserManagementService } from '../../services/user-management.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { FilterBarComponent } from '../../../../shared/ui/filter-bar/filter-bar.component';
import { SkeletonTableComponent } from '../../../../shared/ui/skeleton/skeleton-table.component';
import {
  DataTableComponent
} from '../../../../shared/ui/data-table/data-table.component';
import { CellDefDirective } from '../../../../shared/ui/data-table/cell-def.directive';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';
import {
  UserEditorDialogComponent,
  UserEditorDialogData,
  UserEditorDialogResult
} from './user-editor-dialog.component';

interface UserView extends UserAccount {
  roleLabel: string;
  initial: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    TopBarComponent,
    FilterBarComponent,
    SkeletonTableComponent,
    DataTableComponent,
    CellDefDirective
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly tableColumns = [
    { key: 'username', label: 'User', cellTemplate: 'user' },
    { key: 'roleLabel', label: 'Role', width: '110px', cellTemplate: 'role' },
    { key: 'lastLoginAt', label: 'Last Login', width: '150px', cellTemplate: 'lastLogin', hideOnMobile: true },
    { key: 'isActive', label: 'Status', width: '100px', cellTemplate: 'status' },
    { key: 'actions', label: '', width: '92px', align: 'right' as const, cellTemplate: 'actions' }
  ];

  users: UserView[] = [];
  isLoading = true;

  searchTerm = '';
  roleFilter = '';
  /** Role filter chips follow what the viewer is allowed to see/create — no Admin chip on Owner's view. */
  get roleFilters(): string[] {
    return this.authService.isOwner() ? ['Owner', 'Employee'] : ['Owner', 'Employee', 'Admin'];
  }

  currentUsername: string | null = null;

  constructor(
    private userManagementService: UserManagementService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private confirmService: ConfirmDialogService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.currentUsername = typeof user?.username === 'string' ? user.username : null;
      });
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.userManagementService.getUsers()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: accounts => {
          this.users = accounts.map(account => this.toView(account));
        },
        error: () => this.showSnack('Could not load accounts', 'error')
      });
  }

  get filteredUsers(): UserView[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.users.filter(user => {
      if (this.roleFilter && user.roleLabel !== this.roleFilter) {
        return false;
      }
      return !term || user.username.toLowerCase().includes(term);
    });
  }

  openAddAccount(): void {
    const data: UserEditorDialogData = { mode: 'create', creatableRoles: this.creatableRoles() };
    this.dialog.open<UserEditorDialogComponent, UserEditorDialogData, UserEditorDialogResult>(
      UserEditorDialogComponent,
      { data, width: '420px', autoFocus: 'first-taggable' }
    ).afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result?.created) {
        this.showSnack(`Account '${result.username}' created`, 'success');
        this.loadUsers();
      }
    });
  }

  openPasswordReset(user: UserView): void {
    const data: UserEditorDialogData = { mode: 'reset-password', account: user };
    this.dialog.open<UserEditorDialogComponent, UserEditorDialogData, UserEditorDialogResult>(
      UserEditorDialogComponent,
      { data, width: '420px', autoFocus: 'first-taggable' }
    ).afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result?.saved) {
        this.showSnack(`Password updated for '${user.username}'`, 'success');
      }
    });
  }

  async toggleActive(user: UserView): Promise<void> {
    if (user.isActive) {
      const confirmed = await this.confirmService.confirm({
        title: 'Deactivate Account',
        message: `Deactivate '${user.username}'? They will no longer be able to log in.`,
        confirmLabel: 'Deactivate',
        variant: 'danger'
      });
      if (!confirmed) {
        return;
      }
    }

    this.userManagementService.setUserStatus(user.id, !user.isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSnack(`Account '${user.username}' ${user.isActive ? 'deactivated' : 'activated'}`, 'success');
          this.loadUsers();
        },
        error: error => this.showSnack(error?.error?.message ?? 'Could not update account', 'error')
      });
  }

  /** Whether this row's deactivate/activate action should be offered. */
  canToggle(user: UserView): boolean {
    return !user.isActive ||
      this.currentUsername === null ||
      user.username.toLowerCase() !== this.currentUsername.toLowerCase();
  }

  private creatableRoles(): string[] {
    if (this.authService.isOwner()) {
      return ['Owner', 'Employee'];
    }
    if (this.authService.isAdmin()) {
      return ['Owner', 'Admin', 'Employee'];
    }
    return [];
  }

  private toView(account: UserAccount): UserView {
    const label = this.roleLabel(account);
    return { ...account, roleLabel: label, initial: (account.username[0] ?? '?').toUpperCase() };
  }

  private roleLabel(user: UserAccount): string {
    const role = user.role;
    if (typeof role === 'number') {
      return ['Owner', 'Employee', 'Admin'][role - 1] ?? String(role);
    }
    return String(role);
  }

  get summaryLine(): string {
    const total = this.users.length;
    const active = this.users.filter(u => u.isActive).length;
    const neverLoggedIn = this.users.filter(u => !u.lastLoginAt).length;
    return `${total} ${total === 1 ? 'account' : 'accounts'} · ${active} active · ${neverLoggedIn} never signed in`;
  }

  private showSnack(message: string, kind: 'success' | 'error'): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: [kind === 'success' ? 'success-snackbar' : 'error-snackbar']
    });
  }
}