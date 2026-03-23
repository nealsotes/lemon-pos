import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-container">
      <svg class="spinner" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-dasharray="31.416" stroke-dashoffset="31.416">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite" />
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite" />
        </circle>
      </svg>
      <p *ngIf="message" class="loading-text">{{ message }}</p>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 200px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }

    .spinner {
      width: 36px;
      height: 36px;
      color: var(--text-muted);
      animation: spin 1.2s linear infinite;
    }

    .loading-text {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin: 0;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoadingSpinnerComponent {
  @Input() message = '';
}
