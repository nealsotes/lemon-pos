import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KpiCardComponent } from '../kpi-card/kpi-card.component';

export interface KpiItem {
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
}

@Component({
  selector: 'app-kpi-strip',
  standalone: true,
  imports: [CommonModule, KpiCardComponent],
  template: `
    <div class="kpi-strip">
      <app-kpi-card
        *ngFor="let kpi of kpis"
        [label]="kpi.label"
        [value]="kpi.value"
        [trend]="kpi.trend || ''"
        [trendDirection]="kpi.trendDirection || 'neutral'">
      </app-kpi-card>
    </div>
  `,
  styles: [`
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
  `]
})
export class KpiStripComponent {
  @Input() kpis: KpiItem[] = [];
}
