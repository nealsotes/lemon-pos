import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="top-bar">
      <h1 class="top-bar-title">{{ title }}</h1>
      <div class="top-bar-actions">
        <ng-content></ng-content>
      </div>
    </header>
  `,
  styleUrls: ['./top-bar.component.css']
})
export class TopBarComponent {
  @Input() title = '';
}
