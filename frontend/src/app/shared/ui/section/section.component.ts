import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="ui-section">
      <div *ngIf="title" class="section-header">
        <h3 class="section-title">{{ title }}</h3>
        <p *ngIf="subtitle" class="section-subtitle">{{ subtitle }}</p>
      </div>
      <ng-content></ng-content>
    </section>
  `,
  styles: [`
    .ui-section {
      margin-bottom: var(--spacing-md);
    }

    .section-header {
      margin-bottom: var(--spacing-md);
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0;
    }

    .section-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
      margin-bottom: 0;
    }
  `]
})
export class SectionComponent {
  @Input() title = '';
  @Input() subtitle = '';
}
