import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-container',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="page-container"><ng-content></ng-content></div>`,
  styles: [`
    .page-container {
      padding: 24px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    @media (max-width: 768px) {
      .page-container { padding: 16px; }
    }
  `]
})
export class PageContainerComponent {}
