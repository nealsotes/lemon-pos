import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, PageSettings } from '../../../../core/services/settings.service';
import { AuthService } from '../../../../core/services/auth.service';
import { TopBarComponent } from '../../../../shared/ui/top-bar/top-bar.component';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TopBarComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  pageSettings: PageSettings[] = [];
  isOwner = false;
  isAdmin = false;
  successMessage: string | null = null;

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService,
    private confirmService: ConfirmDialogService
  ) { }

  ngOnInit(): void {
    this.isOwner = this.authService.isOwner();
    this.isAdmin = this.authService.isAdmin();
    this.settingsService.pageSettings$.subscribe(settings => {
      this.pageSettings = settings;
    });
  }

  togglePage(path: string): void {
    this.settingsService.togglePage(path);
    this.showSuccessMessage('Settings saved successfully!');
  }

  async resetToDefaults(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all page settings to defaults?',
      confirmLabel: 'Reset',
      variant: 'danger'
    });
    if (confirmed) {
      this.settingsService.resetToDefaults();
      this.showSuccessMessage('Settings reset to defaults!');
    }
  }

  isPageVisible(page: PageSettings): boolean {
    // Admin can see and toggle all pages
    if (this.isAdmin) {
      return true;
    }
    // If page requires owner, only show if user is owner
    if (page.requiresOwner && !this.isOwner) {
      return false;
    }
    return true;
  }

  private showSuccessMessage(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = null;
    }, 3000);
  }
}




