import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FlipCardData {
  label:       string;
  value:       string;
  suffix?:     string;
  trend?:      string;
  trendDir?:   'up' | 'down' | 'neutral';
  backTitle:   string;
  backLines:   string[];
  accentColor: 'purple' | 'teal' | 'amber' | 'red' | 'blue';
  icon?:       string;
}

@Component({
  selector: 'app-flip-kpi-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './flip-kpi-card.html',
  styleUrl: './flip-kpi-card.scss'
})
export class FlipKpiCardComponent {
  @Input({ required: true }) data!: FlipCardData;
  @Input() height = 140;

  flipped = signal(false);

  toggle() {
    this.flipped.update(v => !v);
  }

  get accentVar(): string {
    const map: Record<string, string> = {
      purple: 'var(--color-purple)',
      teal:   'var(--color-teal)',
      amber:  'var(--color-amber)',
      red:    'var(--color-red)',
      blue:   'var(--color-blue)',
    };
    return map[this.data.accentColor] ?? 'var(--color-purple)';
  }

  get accentLightVar(): string {
    const map: Record<string, string> = {
      purple: 'var(--color-purple-light)',
      teal:   'var(--color-teal-light)',
      amber:  'var(--color-amber-light)',
      red:    'var(--color-red-light)',
      blue:   'var(--color-blue-light)',
    };
    return map[this.data.accentColor] ?? 'var(--color-purple-light)';
  }
}