import {
  Component, computed, signal,
  OnInit, OnDestroy
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { RouterLink }    from '@angular/router';

import { Advisor, CoachingCard }    from '../../core/models/advisor';
import { ProductMix, StoreMetrics } from '../../core/models/store';
import { MockDataService }          from '../../core/services/mock-data';
import { ApiService }               from '../../core/services/api';
import { WebSocketService }         from '../../core/services/websocket.service';
import {
  FlipKpiCardComponent,
  FlipCardData
} from '../../shared/components/flip-kpi-card/flip-kpi-card';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card';

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
  imports:     [CommonModule, RouterLink, MetricCardComponent, FlipKpiCardComponent],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.scss'
})
export class Dashboard implements OnInit, OnDestroy {

  // ── Static mock (données pas encore connectées au backend) ──
  store!:     StoreMetrics;
  cards:      CoachingCard[] = [];
  productMix = signal<ProductMix[]>([]);

  // ── Config ───────────────────────────────────────────
  storeId = 'store-lac2';

  // ── Live data HTTP ───────────────────────────────────
  liveMetrics    = signal<any>(null);
  liveAdvisors   = signal<Advisor[]>([]);
  forecastEOD    = signal<any>(null);
  hourlyForecast = signal<any[]>([]);
  isLoading      = signal(true);

  // ── APP02 Agent data — depuis WebSocket ──────────────
  agentData = signal<{
    niveau_urgence:   string;
    ecart_objectif:   number;
    forecast_eod:     number;
    forecast_ci_low:  number;
    forecast_ci_high: number;
    forecast_mape:    number;
    last_cycle_id:    string | null;
  }>({
    niveau_urgence:   'LOW',
    ecart_objectif:   0,
    forecast_eod:     0,
    forecast_ci_low:  0,
    forecast_ci_high: 0,
    forecast_mape:    14.3,
    last_cycle_id:    null
  });

  // ── Advisors getter — template compatible ─────────────
  private _mockAdvisors: Advisor[] = [];

  get advisors(): Advisor[] {
    const live     = this.ws.liveAdvisors();
    const apiList  = this.liveAdvisors();
    const baseList = apiList.length ? apiList : this._mockAdvisors;

    if (!live.length) return baseList;

    return baseList.map(adv => {
      const wsData = live.find((l: any) => l.advisor_id === adv.id);
      if (!wsData) return adv;

      const ca   = Math.round(wsData.ca_today);
      const perf = Math.round((ca / (adv.caObjectif ?? 2000)) * 100);

      const status: 'top' | 'ok' | 'urgent' | 'attente' =
        perf >= 80 ? 'top' :
        perf >= 50 ? 'ok'  : 'urgent';

      return { ...adv, caRealized: ca, performance: perf, status };
    }).sort((a, b) => b.performance - a.performance);
  }

  // ── Computed KPIs ─────────────────────────────────────
  caToday = computed(() =>
    this.ws.liveMetrics()?.ca_today
    ?? this.liveMetrics()?.ca_today
    ?? this.store?.caJournalier
    ?? 0
  );

  caTarget = computed(() =>
    this.ws.liveMetrics()?.ca_target
    ?? this.liveMetrics()?.ca_target
    ?? this.store?.caObjectif
    ?? 8000
  );

  attainment = computed(() =>
    this.ws.liveMetrics()?.attainment
    ?? this.liveMetrics()?.attainment_pct
    ?? Math.round((this.caToday() / this.caTarget()) * 100)
  );

  // ── APP02 computed — urgence et forecast ─────────────
  niveauUrgence = computed(() =>
    this.ws.liveMetrics()?.niveau_urgence
    ?? this.agentData().niveau_urgence
    ?? 'LOW'
  );

  forecastEodAgent = computed(() =>
    this.ws.liveMetrics()?.forecast_eod
    ?? this.agentData().forecast_eod
    ?? this.forecastEOD()?.eod
    ?? 6800
  );

  ecartObjectif = computed(() =>
    this.ws.liveMetrics()?.ecart_objectif
    ?? this.agentData().ecart_objectif
    ?? this.forecastEOD()?.gap_pct
    ?? 0
  );

  forecastMape = computed(() =>
    this.ws.liveMetrics()?.forecast_mape
    ?? this.agentData().forecast_mape
    ?? 14.3
  );

  lastCycleId = computed(() =>
    this.ws.liveMetrics()?.last_cycle_id
    ?? this.agentData().last_cycle_id
    ?? null
  );

  // ── Flip KPI cards — alimentées par APP02 ────────────
  get flipCards(): FlipCardData[] {
    const att     = this.attainment();
    const ca      = this.caToday();
    const target  = this.caTarget();
    const eod     = this.forecastEodAgent();
    const gap     = this.ecartObjectif();
    const urgence = this.niveauUrgence();
    const mape    = this.forecastMape();
    const cycleId = this.lastCycleId();

    return [
      // ── Card 1 : Visitors ──────────────────────────
      {
        label:      'Visitors / h',
        value:      '42',
        trend:      '▼ 22% vs forecast',
        trendDir:   'down',
        accentColor: 'blue',
        backTitle:  'Traffic analysis',
        backLines: [
          'Peak expected 5–7 PM: +60%',
          'Concert tonight 2km away',
          'Rain reduces spontaneous walk-ins'
        ]
      },

      // ── Card 2 : Revenue — données live ───────────
      {
        label:      'Revenue today',
        value:      Math.round(ca).toLocaleString(),
        suffix:     'DT',
        trend:      `▼ ${gap.toFixed(1)}% vs target`,
        trendDir:   'down',
        accentColor: gap > 25 ? 'red' : gap > 10 ? 'amber' : 'teal',
        backTitle:  'Revenue breakdown',
        backLines: [
          `CA today: ${Math.round(ca).toLocaleString()} DT`,
          `Target: ${Math.round(target).toLocaleString()} DT`,
          `Gap: ${Math.round(target - ca).toLocaleString()} DT remaining`
        ]
      },

      // ── Card 3 : Daily target — APP02 urgence ─────
      {
        label:      'Daily target',
        value:      att.toString(),
        suffix:     '%',
        // Urgence vient directement de APP02
        trend:      `${gap.toFixed(0)}% gap — ${urgence} risk`,
        trendDir:   'down',
        accentColor: urgence === 'HIGH'   ? 'red'
                   : urgence === 'MEDIUM' ? 'amber' : 'teal',
        backTitle:  'EOD projection — APP02 Agent',
        backLines: [
          `Forecast EOD: ${Math.round(eod).toLocaleString()} DT`,
          `Target: ${Math.round(target).toLocaleString()} DT`,
          `MAPE: ${mape}% · ${cycleId ?? 'No cycle yet'}`
        ]
      },

      // ── Card 4 : Stock ────────────────────────────
      {
        label:      'Stock health',
        value:      '2',
        suffix:     'critical',
        trend:      '3 / 6 SKUs optimal',
        trendDir:   'down',
        accentColor: 'red',
        backTitle:  'Inventory status',
        backLines: [
          'iPhone 16 Pro: 3 units — risk 91%',
          'Apple Watch S10: 2 units — risk 88%',
          'Avg. coverage ratio: 1.8x',
        ]
      },
    ];
  }

  // ── Urgence badge color ───────────────────────────────
  get urgenceBadgeColor(): string {
    const u = this.niveauUrgence();
    if (u === 'HIGH')   return '#E74C3C';
    if (u === 'MEDIUM') return '#F9A825';
    return '#00B894';
  }

  get urgenceBadgeBg(): string {
    const u = this.niveauUrgence();
    if (u === 'HIGH')   return '#FDEDEC';
    if (u === 'MEDIUM') return '#FFF8E1';
    return '#E0FAF4';
  }

  // ── Hourly sales chart ────────────────────────────────
  hourlyData = signal<HourlyPoint[]>([
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
  ]);

  maxChart = computed(() =>
    Math.max(...this.hourlyData().map(d =>
      Math.max(d.forecast, d.target, d.actual ?? 0)
    )) * 1.15
  );

  barHeight(val: number): number {
    return Math.round((val / this.maxChart()) * 100);
  }

  // ── Hourly performance chart ──────────────────────────
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

  riskHours = signal<RiskHour[]>([
    { hour: '12PM', actualPct: 73, gap: -32 },
    { hour: '1PM',  actualPct: 78, gap: -20 },
    { hour: '6PM',  actualPct: 82, gap: -22 },
  ]);

  perfMax = computed(() =>
    Math.max(...this.hourlyPerf.map(h =>
      Math.max(h.actual, h.target, h.forecast)
    )) * 1.1
  );

  perfBarHeight(val: number): number {
    return Math.round((val / this.perfMax()) * 100);
  }

  perfLineY(val: number, chartHeight = 200): number {
    return chartHeight - Math.round((val / this.perfMax()) * chartHeight);
  }

  targetPoints(): string {
    return this.hourlyPerf.map((h, i) => {
      const x = (i / (this.hourlyPerf.length - 1)) * 1200;
      return `${x},${this.perfLineY(h.target)}`;
    }).join(' ');
  }

  forecastPoints(): string {
    return this.hourlyPerf.map((h, i) => {
      const x = (i / (this.hourlyPerf.length - 1)) * 1200;
      return `${x},${this.perfLineY(h.forecast)}`;
    }).join(' ');
  }

  riskBarWidth(pct: number): number { return pct; }

  gapColor(gap: number): string {
    return gap < -25 ? '#E74C3C' : gap < -15 ? '#F9A825' : '#00B894';
  }

  // ── Heatmap ──────────────────────────────────────────
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

  // ── Lead time tracker ─────────────────────────────────
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

  // ── Stock KPI ─────────────────────────────────────────
  stockKpi = {
    critical: 2, total: 6, okCount: 3,
    allOk: false, avgCoverage: 1.8,
  };

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

  // ── Coaching cards ────────────────────────────────────
  priorityColor(p: string): string {
    return p === 'HIGH' ? '#E74C3C' : p === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(p: string): string {
    return p === 'HIGH' ? '#FDEDEC' : p === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(s: string): string {
    return s === 'pending' ? 'Pending'
         : s === 'approved' ? 'Approved' : 'Escalated';
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

  // ── Team ranking helpers ──────────────────────────────
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

  // ── Product Mix ──────────────────────────────────────
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

  // ── Inventory histogram ───────────────────────────────
  inventoryVsSales = [
    {
      id: 'p1', name: 'iPhone 16 Pro',    shortName: 'iPhone 16',
      color: '#6C5CE7', risk: 'critical' as const,
      stock: 3,   stockMax: 40,  demand24h: 11,
      sold: 14,   target: 18,    revenue: 2380
    },
    {
      id: 'p2', name: 'Samsung A55',       shortName: 'Samsung A55',
      color: '#2D9CDB', risk: 'ok' as const,
      stock: 24,  stockMax: 35,  demand24h: 8,
      sold: 9,    target: 8,     revenue: 1470
    },
    {
      id: 'p3', name: 'AirPods Pro 3',     shortName: 'AirPods',
      color: '#F9A825', risk: 'high' as const,
      stock: 7,   stockMax: 25,  demand24h: 9,
      sold: 4,    target: 9,     revenue: 420
    },
    {
      id: 'p4', name: 'Apple Watch S10',   shortName: 'Watch S10',
      color: '#E74C3C', risk: 'critical' as const,
      stock: 2,   stockMax: 20,  demand24h: 6,
      sold: 3,    target: 6,     revenue: 1347
    },
    {
      id: 'p5', name: 'Fiber Box 2G Pro',  shortName: 'Fiber 2G',
      color: '#00B894', risk: 'ok' as const,
      stock: 18,  stockMax: 30,  demand24h: 5,
      sold: 9,    target: 8,     revenue: 1470
    },
    {
      id: 'p6', name: 'Premium Insurance', shortName: 'Insurance',
      color: '#A29BFE', risk: 'ok' as const,
      stock: 999, stockMax: 999, demand24h: 12,
      sold: 7,    target: 10,    revenue: 630
    },
  ];

  invChartMax = computed(() => {
    const vals = this.inventoryVsSales.flatMap(p => [
      p.stock >= 999 ? 0 : p.stock,
      p.demand24h, p.sold, p.target,
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

  // ── Simulate POS ─────────────────────────────────────
  simulatePOS() {
    this.api.simulatePOS(this.storeId).subscribe({
      next: () => setTimeout(() => this.loadData(), 1000),
      error: () => {}
    });
  }

  // ── Trigger APP02 manuellement ───────────────────────
  triggerAgent() {
    this.api.triggerCycle(this.storeId).subscribe({
      next: (result: any) => {
        this.agentData.set({
          niveau_urgence:   result.niveau_urgence   ?? 'LOW',
          ecart_objectif:   result.ecart_objectif   ?? 0,
          forecast_eod:     result.forecast_eod     ?? 0,
          forecast_ci_low:  result.forecast_ci_low  ?? 0,
          forecast_ci_high: result.forecast_ci_high ?? 0,
          forecast_mape:    result.forecast_mape    ?? 14.3,
          last_cycle_id:    result.cycle_id         ?? null
        });
        console.log('APP02 cycle result:', result);
      },
      error: (e: any) => console.error('Cycle trigger error', e)
    });
  }

  // ── Constructor + Lifecycle ───────────────────────────
  constructor(
    private data: MockDataService,
    private api:  ApiService,
    public  ws:   WebSocketService
  ) {
    this.store    = this.data.getStoreMetrics();
    this.cards    = this.data.getCoachingCards();
    this.productMix.set(this.data.getProductMix());
    this._mockAdvisors = this.data.getAdvisors();
  }

  ngOnInit() {
    // 1 — Charger données initiales HTTP
    this.loadData();

    // 2 — WebSocket store — reçoit aussi les données APP02
    this.ws.connectStore(this.storeId);

    // 3 — Écouter les données APP02 depuis WebSocket
    this._watchAgentData();

    // 4 — Refresh HTTP toutes les 60s (fallback)
    setInterval(() => this.loadData(), 60000);
  }

  ngOnDestroy() {
    this.ws.disconnect();
  }

  private _watchAgentData() {
    // Effect — surveille liveMetrics du WS pour extraire données APP02
    const interval = setInterval(() => {
      const live = this.ws.liveMetrics();
      if (live?.niveau_urgence) {
        this.agentData.set({
          niveau_urgence:   live.niveau_urgence   ?? 'LOW',
          ecart_objectif:   live.ecart_objectif   ?? 0,
          forecast_eod:     live.forecast_eod     ?? 0,
          forecast_ci_low:  live.forecast_ci_low  ?? 0,
          forecast_ci_high: live.forecast_ci_high ?? 0,
          forecast_mape:    live.forecast_mape    ?? 14.3,
          last_cycle_id:    live.last_cycle_id    ?? null
        });
      }
    }, 5000);

    // Nettoyer à la destruction
    const orig = this.ngOnDestroy.bind(this);
    this.ngOnDestroy = () => {
      clearInterval(interval);
      orig();
    };
  }

  private loadData() {
    // Métriques boutique
    this.api.getStoreMetrics(this.storeId).subscribe({
      next: (d: any) => {
        this.liveMetrics.set(d);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });

    // Advisors
    this.api.getAdvisors(this.storeId).subscribe({
      next: (d: any) => this.liveAdvisors.set(d.advisors ?? []),
      error: () => {}
    });

    // Forecast EOD depuis APP02 via API
    this.api.getForecastEOD(this.storeId).subscribe({
      next: (d: any) => this.forecastEOD.set(d),
      error: () => {}
    });

    // Forecast horaire — met à jour le chart
    this.api.getForecastHourly(this.storeId).subscribe({
      next: (d: any) => {
        if (d.hours?.length) {
          const hour = new Date().getHours();
          this.hourlyData.update(current =>
            current.map((pt, i) => {
              const fc = d.hours[i];
              if (!fc) return pt;
              return {
                ...pt,
                forecast: fc.forecast,
                actual: i < hour - 9 ? pt.actual : null
              };
            })
          );
        }
      },
      error: () => {}
    });
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}