import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-install',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pwa-install-banner" *ngIf="showInstallBanner && !isInstalled">
      <div class="banner-content">
        <div class="banner-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="banner-text">
          <h3>Install QuickServe POS</h3>
          <p>Get quick access to your POS system with our app!</p>
        </div>
        <div class="banner-actions">
          <button class="install-btn" (click)="installApp()">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Install
          </button>
          <button class="dismiss-btn" (click)="dismissBanner()">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pwa-install-banner {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);
      z-index: 1000;
      animation: slideUp 0.3s ease-out;
      max-width: 400px;
      margin: 0 auto;
    }

    .banner-content {
      display: flex;
      align-items: center;
      padding: 16px;
      gap: 12px;
    }

    .banner-icon {
      width: 40px;
      height: 40px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .banner-icon svg {
      width: 24px;
      height: 24px;
    }

    .banner-text {
      flex: 1;
      min-width: 0;
    }

    .banner-text h3 {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .banner-text p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.4;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .install-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .install-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .install-btn svg {
      width: 16px;
      height: 16px;
    }

    .dismiss-btn {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .dismiss-btn svg {
      width: 16px;
      height: 16px;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @media (max-width: 480px) {
      .pwa-install-banner {
        left: 10px;
        right: 10px;
        bottom: 10px;
      }
      
      .banner-content {
        padding: 12px;
        gap: 8px;
      }
      
      .banner-text h3 {
        font-size: 14px;
      }
      
      .banner-text p {
        font-size: 12px;
      }
      
      .install-btn {
        padding: 6px 12px;
        font-size: 12px;
      }
    }
  `]
})
export class PwaInstallComponent implements OnInit, OnDestroy {
  showInstallBanner = false;
  isInstalled = false;
  canInstall = false;
  private installPromptShown = false;

  constructor(private pwaService: PwaService) {}

  ngOnInit() {
    this.checkInstallability();
    this.subscribeToPwaStatus();
  }

  ngOnDestroy() {
    // Clean up any listeners if needed
  }

  private checkInstallability() {
    // Check if we've already shown the prompt recently
    const lastShown = localStorage.getItem('pwa-install-prompt-shown');
    if (lastShown) {
      const lastShownDate = new Date(lastShown);
      const daysSinceLastShown = (Date.now() - lastShownDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastShown < 7) { // Don't show again for 7 days
        return;
      }
    }

    // Show banner after a delay
    setTimeout(() => {
      this.showInstallBanner = true;
    }, 3000);
  }

  private subscribeToPwaStatus() {
    this.pwaService.isInstalled$.subscribe(installed => {
      this.isInstalled = installed;
      if (installed) {
        this.showInstallBanner = false;
      }
    });

    this.pwaService.canInstall$.subscribe(canInstall => {
      this.canInstall = canInstall;
      if (canInstall && !this.isInstalled) {
        this.showInstallBanner = true;
      }
    });
  }

  async installApp() {
    const success = await this.pwaService.installApp();
    if (!success) {
      // Fallback for browsers that don't support the install prompt
      this.showInstallInstructions();
    }
    this.dismissBanner();
  }

  dismissBanner() {
    this.showInstallBanner = false;
    localStorage.setItem('pwa-install-prompt-shown', new Date().toISOString());
  }

  private showInstallInstructions() {
    const message = this.pwaService.getInstallInstructions();
    alert(message);
  }
}

