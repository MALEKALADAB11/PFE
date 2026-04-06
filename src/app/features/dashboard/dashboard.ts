import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Advisor, CoachingCard } from '../../core/models/advisor';
import { ProductMix, StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { FlipKpiCardComponent, FlipCardData } from '../../shared/components/flip-kpi-card/flip-kpi-card';

interface HourlyPoint {
  hour: string;
  actual: number | null;
  forecast: number;
  target: number;
}

interface HeatCell {
  hour: string;
  traffic:  number;
  weather:  number;
  stock:    number;
  event:    number;
  risk:     number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FlipKpiCardComponent],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.scss'
})
export class DashboardComponent {

  store:    StoreMetrics  | undefined;
  advisors: Advisor[]     = [];
  cards:    CoachingCard[]= [];

  activeCardId = signal<string | null>(null);
  chartRange   = signal<'7J' | '30J' | '90J'>('30J');
  productMix = signal<ProductMix[]>([]);

  constructor(private data: MockDataService) {
    this.store = this.data.getStoreMetrics();
    this.advisors = this.data.getAdvisors();
    this.cards = this.data.getCoachingCards();
    this.productMix.set(this.data.getProductMix());
  }

  // ── Flip KPI cards ──
  flipCards: FlipCardData[] = [
    {
      label: 'Visitors / h', value: '42', trend: '▼ 22% vs forecast',
      trendDir: 'down', accentColor: 'blue',
      backTitle: 'Traffic Analysis',
      backLines: ['Expected peak 17h-19h: +60%', 'Concert 20h at 2km', 'Rain reduces spontaneous traffic']
    },
    {
      label: 'Revenue today', value: '4 250', suffix: 'DT',
      trend: '▼ 28.7% vs target', trendDir: 'down', accentColor: 'red',
      backTitle: 'Revenue Breakdown',
      backLines: ['Mobile Plans: 56%', 'Fiber / Box: 30%', 'Accessories: 14% (low)']
    },
    {
      label: 'Daily target', value: '53', suffix: '%',
      trend: '30% gap — HIGH risk', trendDir: 'down', accentColor: 'amber',
      backTitle: 'EOD Projection',
      backLines: ['Forecast: 6 800 DT', 'Target: 8 000 DT', 'Peak at 17h can close 800 DT gap']
    },
    {
      label: 'Active Agents', value: '4', suffix: '/ 4',
      trend: 'All operational', trendDir: 'up', accentColor: 'teal',
      backTitle: 'System State',
      backLines: ['Forecast MAPE : 14.3%', 'LLM latency p95 : 2.1s', 'Advice quality : 0.87']
    },
  ];

  // ── Hourly chart data ──
  hourlyData: HourlyPoint[] = [
    { hour: '09h', actual: 1,   forecast: 1.2, target: 2   },
    { hour: '10h', actual: 2,   forecast: 2.1, target: 2   },
    { hour: '11h', actual: 3,   forecast: 3.3, target: 2   },
    { hour: '12h', actual: 4,   forecast: 3.8, target: 2   },
    { hour: '13h', actual: 3.5, forecast: 3.4, target: 2   },
    { hour: '14h', actual: 4.2, forecast: 4.5, target: 2   },
    { hour: '15h', actual: null,forecast: 5.5, target: 2   },
    { hour: '16h', actual: null,forecast: 6.0, target: 2   },
    { hour: '17h', actual: null,forecast: 7.2, target: 2   },
    { hour: '18h', actual: null,forecast: 6.8, target: 2   },
    { hour: '19h', actual: null,forecast: 5.5, target: 2   },
    { hour: '20h', actual: null,forecast: 4.2, target: 2   },
  ];

  maxChart = computed(() =>
    Math.max(...this.hourlyData.map(d => Math.max(d.forecast, d.target, d.actual ?? 0))) * 1.15
  );

  barHeight(val: number): number {
    return Math.round((val / this.maxChart()) * 100);
  }

  // ── Heat map ──
  heatHours = ['09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h'];
  heatRows: { key: string; label: string }[] = [
    { key: 'traffic', label: 'Traffic' },
    { key: 'weather', label: 'Weather' },
    { key: 'stock',   label: 'Stock'   },
    { key: 'event',   label: 'Event'   },
    { key: 'risk',    label: 'Risk'    },
  ];

  heatData: Record<string, number[]> = {
    traffic: [2, 3, 4, 4, 3, 3, 4, 5, 5, 4, 3, 2],
    weather: [1, 1, 1, 2, 2, 3, 3, 3, 2, 2, 2, 1],
    stock:   [1, 1, 1, 1, 2, 3, 3, 4, 4, 3, 2, 1],
    event:   [1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 4, 3],
    risk:    [1, 1, 2, 2, 2, 3, 3, 4, 5, 4, 3, 2],
  };

  heatColor(val: number): string {
    const colors = ['#EAF3DE','#C0DD97','#EF9F27','#E74C3C','#A32D2D'];
    return colors[Math.min(val - 1, 4)];
  }

  heatLabel(val: number): string {
    return ['','Low','Med','High','Crit','Crit'][val] ?? '';
  }

  // ── Coaching cards ──
  priorityColor(p: string): string {
    return p === 'HIGH' ? '#E74C3C' : p === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(p: string): string {
    return p === 'HIGH' ? '#FDEDEC' : p === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(s: string): string {
    return s === 'pending' ? 'Pending' : s === 'approved' ? 'Approved' : 'Escalate';
  }

  approve(id: string)  { this.cards = this.cards.map(c => c.id === id ? { ...c, status: 'approved' as const } : c); }
  escalate(id: string) { this.cards = this.cards.map(c => c.id === id ? { ...c, status: 'escalate' as const } : c); }

  // ── Advisors ──
  perfColor(p: number): string {
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  }

  statusBadge(s: string): string {
    const m: Record<string, string> = {
      top: 'badge-teal', ok: 'badge-blue',
      urgent: 'badge-red', attente: 'badge-gray'
    };
    return m[s] ?? 'badge-gray';
  }

  statusText(s: string): string {
    const m: Record<string, string> = {
      top: 'Top', ok: 'OK', urgent: 'Urgent', attente: 'Waiting'
    };
    return m[s] ?? s;
  }

  trackById(_: number, item: { id: string }) { return item.id; }

  attainmentColor(actual: number, forecast: number): string {
  const ratio = actual / forecast;
  if (ratio >= 1)    return '#00B894';
  if (ratio >= 0.75) return '#F9A825';
  return '#E74C3C';
}

attainmentPct(actual: number, forecast: number): number {
  return Math.min(Math.round((actual / forecast) * 100), 150);
}

forecastBarWidth(val: number): number {
  const max = Math.max(...this.productMix().map(p => p.salesForecast));
  return Math.round((val / max) * 100);
}

actualBarWidth(val: number): number {
  const max = Math.max(...this.productMix().map(p => p.salesForecast));
  return Math.round((val / max) * 100);
}
}