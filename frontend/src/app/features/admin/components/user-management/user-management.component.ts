import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { UserAccount } from '../../../../shared/models/user.model';
import { UserManagementService } from '../../services/user-management.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';

const ALL_ROLE_CHOICES = ['Owner', 'Employee', 'Admin'];
/** A logged-in user can only create accounts at or beside their own role — never above it. */
const CREATABLE_ROLES: Record<string, string[]> = {
  owner: ['Owner', 'Employee'],
  admin: ['Admin', 'Employee']
};

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TopBarComponent],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  users: UserAccount[] = [];
  isLoading = true;
  isSaving = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // Add-account form — choices depend on who is logged in
  newUsername = '';
  newPassword = '';
  newRole = 'Employee';
  readonly roleChoices: string[];

  // Inline password reset
  passwordResetId: string | null = null;
  passwordResetValue = '';

  constructor(
    private userManagementService: UserManagementService,
    private authService: AuthService,
    private confirmService: ConfirmDialogService
  ) {
    // Owner sees Owner/Employee; Admin sees Admin/Employee (backend enforces the same rule)
    this.roleChoices = this.computeRoleChoices();
    this.newRole = this.roleChoices.includes('Employee') ? 'Employee' : this.roleChoices[0];
  }

  private computeRoleChoices(): string[] {
    if (this.authService.isOwner()) {
      return CREATABLE_ROLES['owner'];
    }
    if (this.authService.isAdmin()) {
      return CREATABLE_ROLES['admin'];
    }
    return [];
  }

  ngOnInit(): void {
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
        next: users => {
          this.users = users;
        },
        error: error => {
          this.errorMessage = this.extractMessage(error);
        }
      });
  }

  addAccount(): void {
    const username = this.newUsername.trim();
    if (!username || !this.newPassword) {
      this.errorMessage = 'Username and password are required';
      return;
    }

    this.isSaving = true;
    this.clearMessages();
    this.userManagementService.createUser({ username, password: this.newPassword, role: this.newRole })
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.errorMessage = this.extractMessage(error);
          return throwError(() => error);
        }),
        finalize(() => (this.isSaving = false))
      )
      .subscribe({
        next: () => {
          this.showSuccess(`Account '${username}' created`);
          this.newUsername = '';
          this.newPassword = '';
          this.newRole = 'Employee';
          this.loadUsers();
        }
      });
  }

  startPasswordReset(user: UserAccount): void {
    this.passwordResetId = user.id;
    this.passwordResetValue = '';
  }

  cancelPasswordReset(): void {
    this.passwordResetId = null;
    this.passwordResetValue = '';
  }

  savePasswordReset(): void {
    if (!this.passwordResetId) {
      return;
    }

    this.isSaving = true;
    this.clearMessages();
    this.userManagementService.setUserPassword(this.passwordResetId, this.passwordResetValue)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.errorMessage = this.extractMessage(error);
          return throwError(() => error);
        }),
        finalize(() => (this.isSaving = false))
      )
      .subscribe({
        next: () => {
          this.showSuccess('Password updated');
          this.cancelPasswordReset();
        }
      });
  }

  async toggleActive(user: UserAccount): Promise<void> {
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

    this.isSaving = true;
    this.clearMessages();
    this.userManagementService.setUserStatus(user.id, !user.isActive)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.errorMessage = this.extractMessage(error);
          return throwError(() => error);
        }),
        finalize(() => (this.isSaving = false))
      )
      .subscribe({
        next: () => this.loadUsers()
      });
  }

  roleLabel(user: UserAccount): string {
    const role = user.role;
    if (typeof role === 'number') {
      return ALL_ROLE_CHOICES[role - 1] ?? String(role);
    }
    return String(role);
  }

  private extractMessage(error: any): string {
    return error?.error?.message ?? error?.error?.errors?.join(', ') ?? error?.message ?? 'Something went wrong';
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = null;
    }, 3000);
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
  }
}