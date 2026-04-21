import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { Advisor, CoachingCard } from '../../core/models/advisor';
import { ProductMix, StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { FlipKpiCardComponent, FlipCardData } from '../../shared/components/flip-kpi-card/flip-kpi-card';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card';
import { InventoryApiService, InventoryApiItem, InventorySummary } from '../../core/services/inventory-api.service';

interface HourlyPoint {
  hour:     string;
  actual:   number | null;
  forecast: number;
  target:   number;
}

interface HourlyPerf {
  hour:     string;
  actual:   number;
  target:   number;
  forecast: number;
  risk:     boolean;
}

interface RiskHour {
  hour:      string;
  actualPct: number;
  gap:       number;
}

@Component({
  selector:    'app-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterLink, MetricCardComponent, FlipKpiCardComponent, HttpClientModule],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.scss'
})
export class DashboardComponent implements OnInit {

  store!:     StoreMetrics;
  advisors:   Advisor[]      = [];
  cards:      CoachingCard[] = [];
  productMix = signal<ProductMix[]>([]);

  constructor(
    private data:   MockDataService,
    private invApi: InventoryApiService,
  ) {
    this.store      = this.data.getStoreMetrics();
    this.advisors   = this.data.getAdvisors();
    this.cards      = this.data.getCoachingCards();
    this.productMix.set(this.data.getProductMix());
  }

  ngOnInit(): void {
    this.invApi.getStore('STORE-001').subscribe({
      next:  payload => this._applyAgentData(payload.items, payload.summary),
      error: err     => console.warn('Stock agent unavailable, using mock data:', err),
    });
  }

  private _applyAgentData(items: InventoryApiItem[], summary: InventorySummary): void {
    // ── 1. Stock health flip card (index 3 only) ──────────────────────────
    this.flipCards = this.flipCards.map((card, i) => {
      if (i !== 3) return card;
      return {
        ...card,
        value:    String(summary.criticalCount),
        suffix:   'critical',
        trend:    `${summary.okCount} / ${summary.totalSkus} SKUs optimal`,
        trendDir: (summary.criticalCount === 0 ? 'up' : 'down') as 'up' | 'down',
        backTitle: 'Inventory status',
        backLines: summary.backLines,
      };
    });

    // ── 2. stockKpi block ─────────────────────────────────────────────────
    this.stockKpi = {
      critical:    summary.criticalCount,
      total:       summary.totalSkus,
      okCount:     summary.okCount,
      allOk:       summary.allOk,
      avgCoverage: summary.avgCoverageRatio,
    };

    // ── 3. inventoryVsSales — stock, demand24h, risk only ─────────────────
    this.inventoryVsSales = this.inventoryVsSales.map(entry => {
      const a = items.find(i => i.sku === entry.sku);
      if (!a) return entry;
      return {
        ...entry,
        stock:     a.stock,
        demand24h: a.demandForecast24h,
        risk:      a.riskLevel as 'critical' | 'high' | 'ok',
      };
    });
  }

  // ── Flip KPI cards ────────────────────────────────────────────────────────
  flipCards: FlipCardData[] = [
    {
      label: 'Visitors / h', value: '42',
      trend: '▼ 22% vs forecast', trendDir: 'down', accentColor: 'blue',
      backTitle: 'Traffic analysis',
      backLines: [
        'Peak expected 5–7 PM: +60%',
        'Concert tonight 2km away',
        'Rain reduces spontaneous walk-ins'
      ]
    },
    {
      label: 'Revenue today', value: '4,250', suffix: 'DT',
      trend: '▼ 28.7% vs target', trendDir: 'down', accentColor: 'red',
      backTitle: 'Revenue breakdown',
      backLines: [
        'Mobile plans: 56% of revenue',
        'Fiber / Box: 30%',
        'Accessories: 14% — underperforming'
      ]
    },
    {
      label: 'Daily target', value: '53', suffix: '%',
      trend: '30% gap — HIGH risk', trendDir: 'down', accentColor: 'amber',
      backTitle: 'EOD projection',
      backLines: [
        'Forecast: 6,800 DT',
        'Target: 8,000 DT',
        '5 PM peak could bridge ~800 DT'
      ]
    },
    {
      label: 'Stock health', value: '2', suffix: 'critical',
      trend: '3 / 6 SKUs optimal', trendDir: 'down', accentColor: 'red',
      backTitle: 'Inventory status',
      backLines: [
        'iPhone 16 Pro: 3 units — risk 91%',
        'Apple Watch S10: 2 units — risk 88%',
        'Avg. coverage ratio: 1.8x',
      ]
    },
  ];

  // ── Hourly sales chart ────────────────────────────────────────────────────
  hourlyData: HourlyPoint[] = [
    { hour: '9 AM',  actual: 1,    forecast: 1.2, target: 2 },
    { hour: '10 AM', actual: 2,    forecast: 2.1, target: 2 },
    { hour: '11 AM', actual: 3,    forecast: 3.3, target: 2 },
    { hour: '12 PM', actual: 4,    forecast: 3.8, target: 2 },
    { hour: '1 PM',  actual: 3.5,  forecast: 3.4, target: 2 },
    { hour: '2 PM',  actual: 4.2,  forecast: 4.5, target: 2 },
    { hour: '3 PM',  actual: null, forecast: 5.5, target: 2 },
    { hour: '4 PM',  actual: null, forecast: 6.0, target: 2 },
    { hour: '5 PM',  actual: null, forecast: 7.2, target: 2 },
    { hour: '6 PM',  actual: null, forecast: 6.8, target: 2 },
    { hour: '7 PM',  actual: null, forecast: 5.5, target: 2 },
    { hour: '8 PM',  actual: null, forecast: 4.2, target: 2 },
  ];

  maxChart = computed(() =>
    Math.max(...this.hourlyData.map(d =>
      Math.max(d.forecast, d.target, d.actual ?? 0)
    )) * 1.15
  );

  barHeight(val: number): number {
    return Math.round((val / this.maxChart()) * 100);
  }

  // ── Hourly performance chart ──────────────────────────────────────────────
  hourlyPerf: HourlyPerf[] = [
    { hour: '9AM',  actual: 38,  target: 60,  forecast: 65,  risk: false },
    { hour: '10AM', actual: 82,  target: 95,  forecast: 90,  risk: false },
    { hour: '11AM', actual: 95,  target: 110, forecast: 118, risk: false },
    { hour: '12PM', actual: 88,  target: 120, forecast: 125, risk: true  },
    { hour: '1PM',  actual: 72,  target: 92,  forecast: 88,  risk: true  },
    { hour: '2PM',  actual: 128, target: 115, forecast: 110, risk: false },
    { hour: '3PM',  actual: 112, target: 118, forecast: 120, risk: false },
    { hour: '4PM',  actual: 138, target: 135, forecast: 130, risk: false },
    { hour: '5PM',  actual: 155, target: 148, forecast: 145, risk: false },
    { hour: '6PM',  actual: 130, target: 125, forecast: 128, risk: false },
    { hour: '7PM',  actual: 98,  target: 110, forecast: 105, risk: false },
    { hour: '8PM',  actual: 42,  target: 50,  forecast: 48,  risk: false },
  ];

  hourlyPerfFilter = signal<'all' | 'risk'>('all');

  riskHours: RiskHour[] = [
    { hour: '12PM', actualPct: 73, gap: -32 },
    { hour: '1PM',  actualPct: 78, gap: -20 },
    { hour: '6PM',  actualPct: 82, gap: -22 },
  ];

  perfMax = computed(() =>
    Math.max(...this.hourlyPerf.map(h =>
      Math.max(h.actual, h.target, h.forecast)
    )) * 1.1
  );

  perfBarHeight(val: number): number {
    return Math.round((val / this.perfMax()) * 100);
  }

  perfLineY(val: number, chartHeight: number = 200): number {
    return chartHeight - Math.round((val / this.perfMax()) * chartHeight);
  }

  targetPoints(): string {
    return this.hourlyPerf.map((h, i) => {
      const x = (i / (this.hourlyPerf.length - 1)) * 1200;
      const y = this.perfLineY(h.target);
      return `${x},${y}`;
    }).join(' ');
  }

  forecastPoints(): string {
    return this.hourlyPerf.map((h, i) => {
      const x = (i / (this.hourlyPerf.length - 1)) * 1200;
      const y = this.perfLineY(h.forecast);
      return `${x},${y}`;
    }).join(' ');
  }

  riskBarWidth(pct: number): number { return pct; }

  gapColor(gap: number): string {
    return gap < -25 ? '#E74C3C' : gap < -15 ? '#F9A825' : '#00B894';
  }

  // ── Heatmap ───────────────────────────────────────────────────────────────
  heatHours = ['11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM'];

  heatRows: { key: string; label: string }[] = [
    { key: 'traffic', label: 'Traffic' },
    { key: 'weather', label: 'Weather' },
    { key: 'stock',   label: 'Stock'   },
    { key: 'event',   label: 'Event'   },
    { key: 'risk',    label: 'Risk'    },
  ];

  heatData: Record<string, number[]> = {
    traffic: [4, 4, 3, 3, 4, 5, 5, 4],
    weather: [1, 2, 2, 3, 3, 2, 2, 2],
    stock:   [1, 1, 2, 3, 3, 4, 4, 3],
    event:   [1, 1, 1, 2, 3, 4, 5, 4],
    risk:    [2, 2, 2, 3, 3, 4, 5, 4],
  };

  heatColor(val: number): string {
    const colors = ['#EAF3DE','#C0DD97','#EF9F27','#E74C3C','#A32D2D'];
    return colors[Math.min(val - 1, 4)];
  }

  heatLabel(val: number): string {
    return ['','Low','Med','High','Crit','Crit'][val] ?? '';
  }

  // ── Lead time tracker ─────────────────────────────────────────────────────
  leadTimeData = [
    { label: 'Top-up',      days: 4, status: 'ok'   },
    { label: 'Smartphones', days: 7, status: 'late'  },
    { label: 'SIM',         days: 5, status: 'ok'    },
    { label: 'Accessories', days: 9, status: 'crit'  },
    { label: 'Routers',     days: 6, status: 'late'  },
    { label: 'Tablets',     days: 8, status: 'crit'  },
  ];

  leadTimeTarget = 5;
  leadTimeMax    = 12;

  leadTimeBarHeight(days: number): number {
    return Math.round((days / this.leadTimeMax) * 100);
  }

  leadTimeColor(status: string): string {
    if (status === 'ok')   return '#2D9CDB';
    if (status === 'late') return '#F9A825';
    return '#E74C3C';
  }

  leadTimeBg(status: string): string {
    if (status === 'ok')   return '#E8F4FD';
    if (status === 'late') return '#FFF8E1';
    return '#FDEDEC';
  }

  targetLineBottom(): number {
    return Math.round((this.leadTimeTarget / this.leadTimeMax) * 100);
  }

  // ── Stock KPI — starts on mock, agent overwrites in ngOnInit ─────────────
  stockKpi = {
    critical:    2,
    total:       6,
    okCount:     3,
    allOk:       false,
    avgCoverage: 1.8,
  };

  // ── Stock risk helpers ────────────────────────────────────────────────────
  stockRiskColor(r: string): string {
    if (r === 'critical') return '#E74C3C';
    if (r === 'low')      return '#F9A825';
    return '#00B894';
  }

  stockRiskBg(r: string): string {
    if (r === 'critical') return '#FDEDEC';
    if (r === 'low')      return '#FFF8E1';
    return '#E0FAF4';
  }

  stockRiskLabel(r: string): string {
    if (r === 'critical') return 'Critical';
    if (r === 'low')      return 'Low';
    return 'OK';
  }

  stockBarWidth(units: number, min: number): number {
    if (units >= 999) return 100;
    const max = Math.max(units, min) * 1.5;
    return Math.min(Math.round((units / max) * 100), 100);
  }

  // ── Coaching cards ────────────────────────────────────────────────────────
  priorityColor(p: string): string {
    return p === 'HIGH' ? '#E74C3C' : p === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(p: string): string {
    return p === 'HIGH' ? '#FDEDEC' : p === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(s: string): string {
    return s === 'pending' ? 'Pending' : s === 'approved' ? 'Approved' : 'Escalated';
  }

  approve(id: string) {
    this.cards = this.cards.map(c =>
      c.id === id ? { ...c, status: 'approved' as const } : c
    );
  }

  escalate(id: string) {
    this.cards = this.cards.map(c =>
      c.id === id ? { ...c, status: 'escalate' as const } : c
    );
  }

  // ── Team ranking ──────────────────────────────────────────────────────────
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

  // ── Product Mix ───────────────────────────────────────────────────────────
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

  trackById(_: number, item: { id: string }) { return item.id; }

  // ── Inventory vs Sales histogram ──────────────────────────────────────────
  // sku added for agent matching. sold/target/revenue/color stay mock permanently.
  inventoryVsSales = [
    {
      id: 'p1', sku: 'IPH16PRO', name: 'iPhone 16 Pro', shortName: 'iPhone 16',
      color: '#6C5CE7', risk: 'critical' as const,
      stock: 3,   stockMax: 40,  demand24h: 11, sold: 14, target: 18, revenue: 2380
    },
    {
      id: 'p2', sku: 'SAMA55', name: 'Samsung A55', shortName: 'Samsung A55',
      color: '#2D9CDB', risk: 'ok' as const,
      stock: 24,  stockMax: 35,  demand24h: 8,  sold: 9,  target: 8,  revenue: 1470
    },
    {
      id: 'p3', sku: 'AIRPDP3', name: 'AirPods Pro 3', shortName: 'AirPods',
      color: '#F9A825', risk: 'high' as const,
      stock: 7,   stockMax: 25,  demand24h: 9,  sold: 4,  target: 9,  revenue: 420
    },
    {
      id: 'p4', sku: 'APLWTCH', name: 'Apple Watch S10', shortName: 'Watch S10',
      color: '#E74C3C', risk: 'critical' as const,
      stock: 2,   stockMax: 20,  demand24h: 6,  sold: 3,  target: 6,  revenue: 1347
    },
    {
      id: 'p5', sku: 'FIB2GPRO', name: 'Fiber Box 2G Pro', shortName: 'Fiber 2G',
      color: '#00B894', risk: 'ok' as const,
      stock: 18,  stockMax: 30,  demand24h: 5,  sold: 9,  target: 8,  revenue: 1470
    },
    {
      id: 'p6', sku: 'ASRPREM', name: 'Premium Insurance', shortName: 'Insurance',
      color: '#A29BFE', risk: 'ok' as const,
      stock: 999, stockMax: 999, demand24h: 12, sold: 7,  target: 10, revenue: 630
    },
  ];

  invChartMax = computed(() => {
    const vals = this.inventoryVsSales.flatMap(p => [
      p.stock >= 999 ? 0 : p.stock,
      p.demand24h,
      p.sold,
      p.target,
      p.stockMax >= 999 ? 0 : p.stockMax
    ]);
    return Math.max(...vals) * 1.15;
  });

  invBarH(val: number): number {
    if (val >= 999) return 100;
    return Math.round((val / this.invChartMax()) * 100);
  }

  invRiskColor(r: string): string {
    if (r === 'critical') return '#E74C3C';
    if (r === 'high')     return '#F9A825';
    return '#00B894';
  }

  invRiskBg(r: string): string {
    if (r === 'critical') return '#FDEDEC';
    if (r === 'high')     return '#FFF8E1';
    return '#E0FAF4';
  }

  invRiskLabel(r: string): string {
    if (r === 'critical') return 'Critical';
    if (r === 'high')     return 'High';
    return 'OK';
  }

  invCoverage(stock: number, demand: number): string {
    if (stock >= 999) return '∞';
    return (stock / demand).toFixed(1) + 'x';
  }

  invCoverageColor(stock: number, demand: number): string {
    if (stock >= 999) return '#00B894';
    const r = stock / demand;
    return r < 0.5 ? '#E74C3C' : r < 1.0 ? '#F9A825' : '#00B894';
  }
}