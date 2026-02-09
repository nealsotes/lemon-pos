import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom, isDevMode } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { ServiceWorkerModule } from '@angular/service-worker';
import { AppComponent } from './app/app.component';
import { routes } from './app/app-routing.module';
import { AuthInterceptor } from './app/interceptors/auth.interceptor';

// Remove initial loader when app is ready
const removeLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      loader.remove();
    }, 300);
  }
};

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      BrowserAnimationsModule,
      HttpClientModule,
      RouterModule.forRoot(routes),
      // TEMPORARILY DISABLED FOR TESTING - Service worker causing cache issues
      // TODO: Re-enable once cache issues are resolved
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled: false, // Temporarily disabled: !isDevMode(),
        registrationStrategy: 'registerImmediately'
      })
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ]
})
.then(() => {
  removeLoader();
})
.catch(err => {
  removeLoader();
});

// Build timestamp: 20251220-202931
