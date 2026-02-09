import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService, PageSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
    private authService: AuthService
  ) {}

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

  resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all page settings to defaults?')) {
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




