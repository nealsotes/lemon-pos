import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ui-card" [class.no-padding]="noPadding">
      <ng-content select="[card-header]"></ng-content>
      <ng-content></ng-content>
      <ng-content select="[card-footer]"></ng-content>
    </div>
  `,
  styles: [`
    .ui-card {
      background-color: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .ui-card:not(.no-padding) ::ng-deep > *:not([card-header]):not([card-footer]) {
      padding: var(--spacing-md);
    }

    .ui-card ::ng-deep [card-header] {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border);
    }

    .ui-card ::ng-deep [card-footer] {
      padding: var(--spacing-md);
      border-top: 1px solid var(--border);
    }
  `]
})
export class CardComponent {
  @Input() noPadding = false;
}
