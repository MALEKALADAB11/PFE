import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type MetricVariant = 'default' | 'purple' | 'teal' | 'amber' | 'red';
export type TrendDirection = 'up' | 'down' | 'neutral';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-card.html',
  styleUrl: './metric-card.scss'
})
export class MetricCardComponent {
  @Input() label       = '';
  @Input() value       = '';
  @Input() subValue    = '';
  @Input() trend       = '';
  @Input() trendDir: TrendDirection = 'neutral';
  @Input() variant: MetricVariant   = 'default';
  @Input() progress?: number;       // 0–100, optionnel
  @Input() progressColor = 'purple';
  @Input() icon        = '';
  @Input() suffix      = '';
  @Input() isNew       = false;
}