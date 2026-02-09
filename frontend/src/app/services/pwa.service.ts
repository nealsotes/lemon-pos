import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private isInstalledSubject = new BehaviorSubject<boolean>(false);
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private canInstallSubject = new BehaviorSubject<boolean>(false);
  private deferredPrompt: any = null;

  constructor() {
    this.checkInstallStatus();
    this.setupEventListeners();
  }

  get isInstalled$(): Observable<boolean> {
    return this.isInstalledSubject.asObservable();
  }

  get isOnline$(): Observable<boolean> {
    return this.isOnlineSubject.asObservable();
  }

  get canInstall$(): Observable<boolean> {
    return this.canInstallSubject.asObservable();
  }

  private checkInstallStatus(): void {
    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInApp = (window.navigator as any).standalone === true;
    const isPWA = isStandalone || isInApp;
    
    this.isInstalledSubject.next(isPWA);
  }

  private setupEventListeners(): void {
    // Listen for online/offline status
    window.addEventListener('online', () => {
      this.isOnlineSubject.next(true);
    });

    window.addEventListener('offline', () => {
      this.isOnlineSubject.next(false);
    });

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstallSubject.next(true);
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.isInstalledSubject.next(true);
      this.canInstallSubject.next(false);
      this.deferredPrompt = null;
    });

    // Listen for display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this.isInstalledSubject.next(e.matches);
    });
  }

  async installApp(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        this.canInstallSubject.next(false);
        this.deferredPrompt = null;
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  // Check if the app is running in standalone mode
  isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches;
  }

  // Check if the app is running on mobile
  isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Get device type
  getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const userAgent = navigator.userAgent;
    
    if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      return 'mobile';
    } else if (/iPad|Android(?=.*Mobile)/i.test(userAgent)) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }

  // Show install instructions for different platforms
  getInstallInstructions(): string {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      return 'To install this app on iOS, tap the Share button in Safari and select "Add to Home Screen".';
    } else if (isAndroid) {
      return 'To install this app on Android, tap the menu button in Chrome and select "Add to Home Screen".';
    } else {
      return 'To install this app, look for the "Install" button in your browser\'s address bar or menu.';
    }
  }

  // Check if the app can be installed
  canInstall(): boolean {
    return this.deferredPrompt !== null;
  }

  // Get app version from manifest
  getAppVersion(): string {
    return '1.0.0'; // This could be dynamically loaded from package.json
  }

  // Check if service worker is supported
  isServiceWorkerSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  // Register service worker
  async registerServiceWorker(): Promise<boolean> {
    if (!this.isServiceWorkerSupported()) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('/ngsw-worker.js');
      return true;
    } catch (error) {
      return false;
    }
  }

  // Check for app updates
  async checkForUpdates(): Promise<boolean> {
    if (!this.isServiceWorkerSupported()) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}






