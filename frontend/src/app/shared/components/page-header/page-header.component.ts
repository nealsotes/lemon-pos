import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shared page header used across POS, Reports, Products, Inventory, Cart, and Settings.
 * Same layout and visual style for consistency.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-header.component.html',
  styleUrls: ['./page-header.component.css']
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle: string | null = null;
}
