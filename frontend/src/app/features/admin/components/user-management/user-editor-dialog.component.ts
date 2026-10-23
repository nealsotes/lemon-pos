import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { UserAccount } from '../../../../shared/models/user.model';
import { UserManagementService } from '../../services/user-management.service';

export interface UserEditorDialogData {
  mode: 'create' | 'reset-password';
  account?: UserAccount;
  creatableRoles?: string[];
}

export interface UserEditorDialogResult {
  created?: boolean;
  saved?: boolean;
  username?: string;
}

@Component({
  selector: 'app-user-editor-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="user-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <h2>{{ data.mode === 'create' ? 'Add Account' : 'Reset Password' }}</h2>
        <button type="button" class="dialog-close-btn" (click)="onClose()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        <div class="dialog-context" *ngIf="data.mode === 'reset-password' && data.account">
          Set a new password for <strong>{{ data.account.username }}</strong>
        </div>

        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="form-group" *ngIf="data.mode === 'create'">
            <label for="username">Username *</label>
            <input type="text" id="username" formControlName="username" class="form-control"
              placeholder="e.g. barista1" autocomplete="off">
            <div class="error-message" *ngIf="showError('username')">
              <span *ngIf="form.get('username')?.errors?.['required']">Username is required</span>
              <span *ngIf="form.get('username')?.errors?.['pattern']">Letters, digits and _ . - only</span>
              <span *ngIf="form.get('username')?.errors?.['minlength']">At least 3 characters</span>
            </div>
          </div>

          <div class="form-group" *ngIf="data.mode === 'create'">
            <label for="role">Role *</label>
            <select id="role" formControlName="role" class="form-control form-select">
              <option *ngFor="let role of data.creatableRoles" [value]="role">{{ role }}</option>
            </select>
          </div>

          <div class="form-group">
            <label for="password">{{ data.mode === 'create' ? 'Password' : 'New Password' }} *</label>
            <div class="password-wrapper">
              <input [type]="showPassword ? 'text' : 'password'" id="password" formControlName="password"
                class="form-control" placeholder="Minimum 6 characters" autocomplete="new-password">
              <button type="button" class="password-toggle" (click)="showPassword = !showPassword"
                [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
                <svg *ngIf="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <svg *ngIf="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
            <div class="error-message" *ngIf="showError('password')">
              <span *ngIf="form.get('password')?.errors?.['required']">Password is required</span>
              <span *ngIf="form.get('password')?.errors?.['minlength']">At least 6 characters</span>
            </div>
          </div>

          <div class="dialog-error" *ngIf="serverError">{{ serverError }}</div>

          <!-- Actions -->
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" (click)="onClose()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="isSaving">
              {{ isSaving ? 'Saving...' : (data.mode === 'create' ? 'Create Account' : 'Update Password') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .user-dialog {
      display: flex;
      flex-direction: column;
      font-family: var(--font-ui);
      color: var(--text-primary);
      background: var(--bg-surface);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
    }

    .dialog-header h2 {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      margin: 0;
    }

    .dialog-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .dialog-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-primary);
      background: var(--bg-subtle);
    }

    .dialog-body {
      padding: 16px 20px 20px;
    }

    .dialog-context {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }

    .form-group label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .password-wrapper {
      position: relative;
    }

    .password-wrapper .form-control {
      width: 100%;
      padding-right: 40px;
    }

    .password-toggle {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--text-muted);
      cursor: pointer;
    }

    .password-toggle:hover {
      color: var(--text-primary);
      background: var(--bg-subtle);
    }

    .form-select {
      appearance: auto;
    }

    .error-message {
      color: var(--danger);
      font-size: 0.78rem;
    }

    .dialog-error {
      background: rgba(220, 38, 38, 0.08);
      color: var(--danger);
      font-size: 0.82rem;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      margin-bottom: 12px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `]
})
export class UserEditorDialogComponent {
  form: FormGroup;
  showPassword = false;
  isSaving = false;
  serverError: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<UserEditorDialogComponent, UserEditorDialogResult>,
    private userManagementService: UserManagementService,
    @Inject(MAT_DIALOG_DATA) public data: UserEditorDialogData
  ) {
    this.form = new FormBuilder().group({
      username: [
        '',
        data.mode === 'create'
          ? [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9._-]+$/)]
          : []
      ],
      role: [data.mode === 'create' ? this.defaultRole() : ''],
      password: [data.mode === 'create' ? '' : '', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]]
    });
  }

  showError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  onClose(): void {
    this.dialogRef.close({});
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.serverError = null;
    const password = this.form.get('password')?.value ?? '';

    const request$: Observable<void> = (this.data.mode === 'create'
      ? this.userManagementService.createUser({
          username: (this.form.get('username')?.value ?? '').trim(),
          password,
          role: this.form.get('role')?.value ?? 'Employee'
        })
      : this.userManagementService.setUserPassword(this.data.account!.id, password)) as Observable<void>;

    request$
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: () => {
          this.dialogRef.close(
            this.data.mode === 'create'
              ? { created: true, username: (this.form.get('username')?.value ?? '').trim() }
              : { saved: true }
          );
        },
        error: error => {
          this.serverError = error?.error?.message ?? error?.message ?? 'Something went wrong';
        }
      });
  }

  private defaultRole(): string {
    const roles = this.data.creatableRoles ?? [];
    return roles.includes('Employee') ? 'Employee' : (roles[0] ?? 'Employee');
  }
}