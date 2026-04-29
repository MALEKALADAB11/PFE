import {
  Component, computed, signal,
  OnInit, OnDestroy
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { RouterLink }       from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { Subject }          from 'rxjs';
import { takeUntil }        from 'rxjs/operators';

import { Advisor }        from '../../core/models/advisor';
import { StoreMetrics }   from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { ApiService }      from '../../core/services/api';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  FlipKpiCardComponent,
  FlipCardData
} from '../../shared/components/flip-kpi-card/flip-kpi-card';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card';
import {
  InventoryApiService,
  InventoryApiItem,
  InventorySummary
} from '../../core/services/inventory-api.service';

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
export class Dashboard implements OnInit, OnDestroy {

  store!:   StoreMetrics;
  storeId = 'store-lac2';

  liveMetrics  = signal<any>(null);
  liveAdvisors = signal<any[]>([]);
  forecastEOD  = signal<any>(null);
  isLoading    = signal(true);

  cards      = signal<any[]>([]);
  productMix = signal<any[]>([]);
  riskHours  = signal<RiskHour[]>([]);

  private _mockAdvisors: Advisor[] = [];
  private refreshTimer: any = null;
  private agentTimer:   any = null;
  private destroy$ = new Subject<void>();

  constructor(
    private data:   MockDataService,
    private api:    ApiService,
    public  ws:     WebSocketService,
    private invApi: InventoryApiService,
  ) {
    this.store         = this.data.getStoreMetrics();
    this._mockAdvisors = this.data.getAdvisors();
  }

  // ── Advisors ──────────────────────────────────────────
  get advisors(): any[] {
    const wsAdvisors = this.ws.liveMetrics()?.advisors;
    if (wsAdvisors?.length) {
      return wsAdvisors.map((a: any, i: number) => ({
        id:          a.id ?? a.name,
        name:        a.name,
        initials:    this.getInitials(a.name ?? ''),
        avatarColor: this.avatarColor(i),
        role:        `${a.nb_ventes ?? 0} ventes aujourd'hui`,
        caRealized:  a.revenue    ?? 0,
        caObjectif:  a.target     ?? 0,
        performance: a.attainment ?? 0,
        nbVentes:    a.nb_ventes  ?? 0,
        rank:        a.rank ?? i + 1,
        status:      (a.attainment ?? 0) >= 80 ? 'top'
                   : (a.attainment ?? 0) >= 50 ? 'ok'
                   : 'urgent',
        trend:       a.trend ?? 'stable',
      }));
    }
    const apiList = this.liveAdvisors();
    if (apiList.length) {
      return apiList.map((a: any, i: number) => ({
        ...a,
        initials:    this.getInitials(a.name ?? ''),
        avatarColor: this.avatarColor(i),
        role:        `${a.nb_ventes ?? 0} ventes aujourd'hui`,
        caRealized:  a.revenue    ?? a.caRealized  ?? 0,
        performance: a.attainment ?? a.performance ?? 0,
        status:      (a.attainment ?? 0) >= 80 ? 'top'
                   : (a.attainment ?? 0) >= 50 ? 'ok'
                   : 'urgent',
      }));
    }
    return this._mockAdvisors;
  }

  // ── Computed signals ──────────────────────────────────
  caToday = computed(() =>
    this.ws.liveMetrics()?.ca_today
    ?? this.liveMetrics()?.ca_today
    ?? this.store?.caJournalier ?? 0
  );

  caTarget = computed(() =>
    this.ws.liveMetrics()?.ca_target
    ?? this.liveMetrics()?.ca_target
    ?? this.store?.caObjectif ?? 18000
  );

  attainment = computed(() =>
    this.ws.liveMetrics()?.attainment
    ?? this.liveMetrics()?.attainment
    ?? Math.round((this.caToday() / Math.max(this.caTarget(), 1)) * 100)
  );

  niveauUrgence = computed(() => this.ws.urgencyLevel() ?? 'LOW');

  forecastEodAgent = computed(() =>
    this.ws.forecastEod()
    ?? this.ws.liveMetrics()?.forecast_eod
    ?? this.forecastEOD()?.eod ?? 0
  );

  ecartObjectif = computed(() =>
    this.ws.gapPct()
    ?? this.ws.liveMetrics()?.ecart_objectif
    ?? this.forecastEOD()?.gap_pct ?? 0
  );

  analystSummary = computed(() => {
    const raw = this.ws.analystSummary()
             ?? this.ws.liveMetrics()?.analyst_summary
             ?? '';
    return this._extractSummary(raw);
  });

  visitorsH  = computed(() => this.ws.liveMetrics()?.visitors_h  ?? 0);
  agentsLive = computed(() => this.ws.liveMetrics()?.agents_live ?? 0);
  isLive     = computed(() => this.ws.connected());

  // ── Agent Stratège ────────────────────────────────────
  strategie = computed(() =>
    this.ws.strategie()
    || this.ws.liveMetrics()?.strategie
    || ''
  );

  strateActions = computed(() =>
    this.ws.strateActions()?.length
      ? this.ws.strateActions()
      : this.ws.liveMetrics()?.strategie_actions ?? []
  );

  causeRacine = computed(() =>
    this.ws.causeRacine()
    || this.ws.liveMetrics()?.cause_racine
    || ''
  );

  focusProduits = computed(() =>
    this.ws.focusProduits()?.length
      ? this.ws.focusProduits()
      : this.ws.liveMetrics()?.focus_produits ?? []
  );

  messageManager = computed(() =>
    this.ws.messageManager()
    || this.ws.liveMetrics()?.message_manager
    || ''
  );

  weatherLabel = computed(() => this.ws.weatherLabel() ?? '');
  weatherIcon  = computed(() => this.ws.weatherIcon()  ?? '');
  isHoliday    = computed(() => this.ws.isHolidayToday());
  nextHoliday  = computed(() => this.ws.nextHoliday()  ?? '');

  // ── Stock KPI — mock seeds, agent overwrites via ngOnInit ─────────────────
  stockKpi = {
    critical: 2, total: 6, okCount: 3,
    allOk: false, avgCoverage: 1.8,
  };

  stockBackLines = signal<string[]>([
    'iPhone 16 Pro: 3 units — risk 91%',
    'Apple Watch S10: 2 units — risk 88%',
    'Avg. coverage ratio: 1.8x',
  ]);

  // ── Flip Cards ────────────────────────────────────────
  flipCards = computed((): FlipCardData[] => {
    const att      = this.attainment();
    const ca       = this.caToday();
    const target   = this.caTarget();
    const eod      = this.forecastEodAgent();
    const gap      = this.ecartObjectif();
    const urgence  = this.niveauUrgence();
    const summary  = this.analystSummary();
    const live     = this.isLive();
    const visitors = this.visitorsH();

    const summaryShort = summary.length > 80
      ? summary.slice(0, 77) + '...'
      : summary || 'Analyse en cours...';

    return [
      {
        label:       'Visitors / h',
        value:       String(visitors),
        trend:       live ? '▲ LIVE traffic' : '○ Polling traffic',
        trendDir:    'up',
        accentColor: 'blue',
        backTitle:   'Traffic analysis',
        backLines:   [
          `Visiteurs/h   : ${visitors}`,
          `Agents actifs : ${this.agentsLive()}`,
          live ? '● Connecté en temps réel' : '○ Mode polling',
        ]
      },
      {
        label:       'Revenue today',
        value:       Math.round(ca).toLocaleString(),
        suffix:      'DT',
        trend:       `▼ ${Number(gap).toFixed(1)}% vs target`,
        trendDir:    'down',
        accentColor: gap > 25 ? 'red' : gap > 10 ? 'amber' : 'teal',
        backTitle:   'Revenue breakdown',
        backLines:   [
          `CA today     : ${Math.round(ca).toLocaleString()} DT`,
          `Target       : ${Math.round(target).toLocaleString()} DT`,
          `Forecast EOD : ${Math.round(eod).toLocaleString()} DT`,
        ]
      },
      {
        label:       'Daily target',
        value:       att.toString(),
        suffix:      '%',
        trend:       `${Number(gap).toFixed(0)}% gap — ${urgence} risk`,
        trendDir:    'down',
        accentColor: urgence === 'HIGH'   ? 'red'
                   : urgence === 'MEDIUM' ? 'amber' : 'teal',
        backTitle:   'Agent Analyste',
        backLines:   [
          summaryShort,
          `Urgency  : ${urgence}`,
          `Forecast : ${Math.round(eod).toLocaleString()} DT`,
        ]
      },
      // ── Card 4: Stock health — driven by live inventory agent ─────────────
      {
        label:       'Stock health',
        value:       String(this.stockKpi.critical),
        suffix:      'critical',
        trend:       `${this.stockKpi.okCount} / ${this.stockKpi.total} SKUs optimal`,
        trendDir:    (this.stockKpi.critical === 0 ? 'up' : 'down') as 'up' | 'down',
        accentColor: this.stockKpi.critical > 0 ? 'red' : 'teal',
        backTitle:   'Inventory status',
        backLines:   this.stockBackLines(),
      },
    ];
  });

  // ── Hourly performance ────────────────────────────────
  hourlyPerf = signal<HourlyPerf[]>([
    { hour: '9AM',  actual: 1875, target: 1636, forecast: 1700, risk: false },
    { hour: '10AM', actual: 2709, target: 1636, forecast: 1800, risk: false },
    { hour: '11AM', actual: 830,  target: 1636, forecast: 1600, risk: true  },
    { hour: '12PM', actual: 351,  target: 1636, forecast: 1900, risk: true  },
    { hour: '1PM',  actual: 3054, target: 1636, forecast: 1700, risk: false },
    { hour: '2PM',  actual: 132,  target: 1636, forecast: 1600, risk: true  },
    { hour: '3PM',  actual: 2500, target: 1636, forecast: 1800, risk: false },
    { hour: '4PM',  actual: 0,    target: 1636, forecast: 2000, risk: false },
    { hour: '5PM',  actual: 0,    target: 1636, forecast: 2200, risk: false },
    { hour: '6PM',  actual: 0,    target: 1636, forecast: 1800, risk: false },
    { hour: '7PM',  actual: 0,    target: 1636, forecast: 1400, risk: false },
    { hour: '8PM',  actual: 0,    target: 1636, forecast: 900,  risk: false },
  ]);

  hourlyPerfFilter = signal<'all' | 'risk'>('all');

  perfMax = computed(() => {
    const arr = this.hourlyPerf();
    if (!arr.length) return 3000;
    const vals = arr.flatMap(h => [
      isFinite(h.actual)   && h.actual   > 0 ? h.actual   : 0,
      isFinite(h.target)   && h.target   > 0 ? h.target   : 0,
      isFinite(h.forecast) && h.forecast > 0 ? h.forecast : 0,
    ]).filter(v => v > 0);
    return vals.length ? Math.max(...vals) * 1.15 : 3000;
  });

  perfBarHeight(val: number): number {
    const max = this.perfMax();
    if (!max || !val || !isFinite(val) || val <= 0) return 0;
    return Math.min(100, Math.round((val / max) * 100));
  }

  perfLineY(val: number, chartHeight = 200): number {
    const max = this.perfMax();
    if (!max || !val || !isFinite(val) || val <= 0) return chartHeight;
    return Math.max(0, chartHeight - Math.round((val / max) * chartHeight));
  }

  targetPoints(): string {
    const arr = this.hourlyPerf();
    if (arr.length < 2) return '';
    return arr.map((h, i) => {
      const x = Math.round((i / (arr.length - 1)) * 1200);
      return `${x},${this.perfLineY(h.target || 0)}`;
    }).join(' ');
  }

  forecastPoints(): string {
    const arr = this.hourlyPerf();
    if (arr.length < 2) return '';
    return arr.map((h, i) => {
      const x = Math.round((i / (arr.length - 1)) * 1200);
      return `${x},${this.perfLineY(h.forecast || 0)}`;
    }).join(' ');
  }

  circleX(i: number): number {
    const arr = this.hourlyPerf();
    if (arr.length < 2) return 0;
    return Math.round((i / (arr.length - 1)) * 1200);
  }

  circleY(h: HourlyPerf): number { return this.perfLineY(h.forecast || 0); }

  riskBarWidth(pct: number): number { return Math.min(100, Math.max(0, pct || 0)); }

  gapColor(gap: number): string {
    return gap < -25 ? '#E74C3C' : gap < -15 ? '#F9A825' : '#00B894';
  }

  // ── Heatmap ───────────────────────────────────────────
  heatHours = ['11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM'];
  heatRows  = [
    { key: 'traffic', label: 'Traffic' },
    { key: 'weather', label: 'Weather' },
    { key: 'stock',   label: 'Stock'   },
    { key: 'event',   label: 'Event'   },
    { key: 'risk',    label: 'Risk'    },
  ];

  heatData: Record<string, number[]> = {
    traffic: [2,2,2,2,2,2,2,2],
    weather: [1,1,1,1,1,1,1,1],
    stock:   [1,1,1,1,1,1,1,1],
    event:   [1,1,1,1,1,1,1,1],
    risk:    [1,1,1,1,1,1,1,1],
  };

  heatColor(val: number): string {
    const colors = ['#EAF3DE','#C0DD97','#EF9F27','#E74C3C','#A32D2D'];
    return colors[Math.min(Math.max((val || 1) - 1, 0), 4)];
  }

  heatLabel(val: number): string {
    return ['','Low','Med','High','Crit','Crit'][val] ?? '';
  }

  // ── Inventory vs Sales ────────────────────────────────
  inventoryVsSales = [
    {
      id: 'p1', sku: 'IPH16PRO',  name: 'iPhone 16 Pro',    shortName: 'iPhone 16',
      color: '#6C5CE7', risk: 'critical' as const,
      stock: 3,   stockMax: 40,  demand24h: 11, sold: 14, target: 18, revenue: 2380
    },
    {
      id: 'p2', sku: 'SAMA55',    name: 'Samsung A55',       shortName: 'Samsung A55',
      color: '#2D9CDB', risk: 'ok' as const,
      stock: 24,  stockMax: 35,  demand24h: 8,  sold: 9,  target: 8,  revenue: 1470
    },
    {
      id: 'p3', sku: 'AIRPDP3',   name: 'AirPods Pro 3',     shortName: 'AirPods',
      color: '#F9A825', risk: 'high' as const,
      stock: 7,   stockMax: 25,  demand24h: 9,  sold: 4,  target: 9,  revenue: 420
    },
    {
      id: 'p4', sku: 'APLWTCH',   name: 'Apple Watch S10',   shortName: 'Watch S10',
      color: '#E74C3C', risk: 'critical' as const,
      stock: 2,   stockMax: 20,  demand24h: 6,  sold: 3,  target: 6,  revenue: 1347
    },
    {
      id: 'p5', sku: 'FIB2GPRO',  name: 'Fiber Box 2G Pro',  shortName: 'Fiber 2G',
      color: '#00B894', risk: 'ok' as const,
      stock: 18,  stockMax: 30,  demand24h: 5,  sold: 9,  target: 8,  revenue: 1470
    },
    {
      id: 'p6', sku: 'ASRPREM',   name: 'Premium Insurance', shortName: 'Insurance',
      color: '#A29BFE', risk: 'ok' as const,
      stock: 999, stockMax: 999, demand24h: 12, sold: 7,  target: 10, revenue: 630
    },
  ];

  invChartMax = computed(() => {
    const vals = this.inventoryVsSales.flatMap(p => [
      p.stock >= 999 ? 0 : p.stock,
      p.demand24h, p.sold, p.target,
      p.stockMax >= 999 ? 0 : p.stockMax,
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

  // ── Lead time ─────────────────────────────────────────
  leadTimeData = [
    { label: 'Top-up',      days: 4, status: 'ok'   },
    { label: 'Smartphones', days: 7, status: 'late'  },
    { label: 'SIM',         days: 5, status: 'ok'    },
    { label: 'Accessories', days: 9, status: 'crit'  },
    { label: 'Routers',     days: 6, status: 'late'  },
    { label: 'Tablets',     days: 3, status: 'ok'    },
  ];

  leadTimeBarHeight(days: number): number { return Math.min(100, ((days || 0) / 12) * 100); }

  leadTimeColor(s: string): string {
    return s === 'crit' ? '#E74C3C' : s === 'late' ? '#F9A825' : '#2D9CDB';
  }

  leadTimeBg(s: string): string {
    return s === 'crit' ? '#FDEDEC' : s === 'late' ? '#FFF8E1' : '#EAF4FE';
  }

  targetLineBottom(): number { return (5 / 12) * 100; }

  // ── Lifecycle ─────────────────────────────────────────
  ngOnInit() {
    this.loadData();
    this.ws.connectStore(this.storeId);
    this.agentTimer   = setInterval(() => this.syncFromWs(), 3000);
    this.refreshTimer = setInterval(() => this.loadData(), 120000);

    // Inventory agent overlay (APP08)
    this.invApi.getStore('STORE-001').subscribe({
      next:  payload => this._applyAgentData(payload.items, payload.summary),
      error: err     => console.warn('Stock agent unavailable, using mock data:', err),
    });
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.agentTimer)   clearInterval(this.agentTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── API loading ───────────────────────────────────────
  private loadData() {
    this.api.getStoreMetrics(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => { this.liveMetrics.set(d); this.isLoading.set(false); },
        error: ()       => this.isLoading.set(false),
      });

    this.api.getAdvisors(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => this.liveAdvisors.set(d.advisors ?? []),
        error: ()       => {},
      });

    this.api.getForecastEOD(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => this.forecastEOD.set(d),
        error: ()       => {},
      });

    this.api.getLiveAnalysis(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d: any) => {
          this.cards.set(this.mapCardsFromWs(d));
          this.productMix.set(this.mapProductMixFromWs(d));
          this.riskHours.set(this.mapRiskHoursFromWs(d));
          this.applyHeatmapFromWs(d);
          const hourly = this.mapHourlyPerfFromWs(d);
          if (hourly.length) this.hourlyPerf.set(hourly);
        },
        error: () => {},
      });
  }

  // ── WS sync every 3s ─────────────────────────────────
  private syncFromWs() {
    const live = this.ws.liveMetrics();
    if (!live) return;

    this.cards.set(this.mapCardsFromWs(live));
    this.productMix.set(this.mapProductMixFromWs(live));
    this.riskHours.set(this.mapRiskHoursFromWs(live));
    this.applyHeatmapFromWs(live);

    if (live.advisors?.length) this.liveAdvisors.set(live.advisors);

    const hourly = this.mapHourlyPerfFromWs(live);
    if (hourly.length) this.hourlyPerf.set(hourly);

    const wsHeatmap = this.ws.contextHeatmap();
    if (wsHeatmap?.traffic?.length) this.applyHeatmapDirect(wsHeatmap);
  }

  // ── Inventory agent overlay ───────────────────────────
  private _applyAgentData(items: InventoryApiItem[], summary: InventorySummary): void {
    this.stockKpi = {
      critical:    summary.criticalCount,
      total:       summary.totalSkus,
      okCount:     summary.okCount,
      allOk:       summary.allOk,
      avgCoverage: summary.avgCoverageRatio,
    };

    this.stockBackLines.set([
      ...summary.backLines,
      `Avg. coverage ratio: ${summary.avgCoverageRatio.toFixed(1)}x`,
    ]);

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

  // ── Mappers ───────────────────────────────────────────
  private mapRiskHoursFromWs(data: any): RiskHour[] {
    return (data?.risk_hours ?? []).map((r: any) => ({
      hour:      r.hour || '',
      actualPct: Math.max(0, Math.min(100, Math.round(r.target_pct ?? r.target_attainment ?? 0))),
      gap:       Math.round(r.units_behind ?? r.gap_units ?? 0),
    }));
  }

  private mapCardsFromWs(data: any): any[] {
    const advisors      = data?.advisors ?? [];
    const strateActions = data?.strategie_actions ?? [];
    return advisors.slice(0, 4).map((a: any, i: number) => ({
      id:              a.id ?? a.name ?? `advisor_${i}`,
      advisorName:     a.name,
      advisorInitials: this.getInitials(a.name ?? ''),
      avatarColor:     this.avatarColor(i),
      target:          a.attainment ?? 0,
      priority:        (a.attainment ?? 0) >= 80 ? 'OK'
                     : (a.attainment ?? 0) >= 50 ? 'MED' : 'HIGH',
      time:            'LIVE',
      gap:             Math.max(0, 100 - (a.attainment ?? 0)),
      context:         `${a.nb_ventes ?? 0} ventes · ${(a.revenue ?? 0).toLocaleString()} DT`,
      advice:          (a.attainment ?? 0) < 50
                         ? `Urgent — gap ${100 - (a.attainment ?? 0)}% à combler`
                         : `En bonne voie — ${a.attainment ?? 0}% atteint`,
      status:          'pending',
      strateAction:    strateActions[i] ?? null,
    }));
  }

  private mapProductMixFromWs(data: any): any[] {
    return (data?.product_mix ?? []).map((p: any, i: number) => ({
      id:            p.product ?? `prod_${i}`,
      name:          p.product ?? 'Produit',
      color:         this.mixColor(i),
      unitsSold:     0,
      unitsForecast: 0,
      salesActual:   Math.min(100, Math.max(0, p.attainment ?? 0)),
      salesForecast: 100,
      stockUnits:    p.stock_level === 'Low' ? 3 : 10,
      stockMin:      3,
      stockRisk:     p.stock_level === 'Low' ? 'high' : 'low',
      revenue:       p.revenue ?? 0,
      trend:         'up',
      trendVal:      `${(p.revenue ?? 0).toLocaleString()} TND`,
      alert:         p.stock_level === 'Low',
    }));
  }

  private mapHourlyPerfFromWs(data: any): HourlyPerf[] {
    const raw = data?.hourly_performance ?? [];
    if (!raw.length) return [];
    return raw
      .map((h: any) => ({
        hour:     this.normalizeHourLabel(h.hour || ''),
        actual:   Math.max(0, Number(h.revenue  ?? h.actual   ?? 0) || 0),
        target:   Math.max(0, Number(h.target   ?? 0) || 0),
        forecast: Math.max(0, Number(h.forecast ?? 0) || 0),
        risk:     !!h.risk,
      }))
      .filter((h: HourlyPerf) =>
        h.hour && (h.target > 0 || h.forecast > 0 || h.actual > 0)
      );
  }

  private applyHeatmapFromWs(data: any) {
    const wsHeatmap = this.ws.contextHeatmap();
    if (wsHeatmap?.traffic?.length) { this.applyHeatmapDirect(wsHeatmap); return; }
    const heatmap = data?.context_heatmap;
    if (heatmap?.traffic?.length) {
      this.applyHeatmapDirect(heatmap);
    } else {
      this.applySignalsToHeatmap(data?.context_signals ?? [], data?.risk_hours ?? []);
    }
  }

  private applyHeatmapDirect(heatmap: any) {
    const lv: Record<string, number> = { low: 1, med: 2, high: 3, crit: 4 };
    const c = (arr: any[]): number[] => (arr ?? []).map(v => lv[String(v)] ?? 1);
    this.heatData = {
      traffic: c(heatmap.traffic),
      weather: c(heatmap.weather),
      stock:   c(heatmap.stock),
      event:   c(heatmap.event),
      risk:    c(heatmap.risk),
    };
  }

  private applySignalsToHeatmap(signals: any[], riskHours: any[] = []) {
    this.heatData = {
      traffic: [2,2,2,2,2,2,2,2],
      weather: [1,1,1,1,1,1,1,1],
      stock:   [1,1,1,1,1,1,1,1],
      event:   [1,1,1,1,1,1,1,1],
      risk:    [1,1,1,1,1,1,1,1],
    };
    signals.forEach((s: any) => {
      if (s.type === 'weather') this.heatData['weather'] = [1,1,2,3,3,2,2,2];
      if (s.type === 'stock')   this.heatData['stock']   = [1,1,2,3,3,4,4,3];
      if (s.type === 'event')   this.heatData['event']   = [1,1,1,2,3,4,5,4];
    });
    const riskMap: Record<string, number> = {};
    riskHours.forEach((r: any) => {
      riskMap[this.normalizeHourLabel(r.hour)] =
        r.risk === 'HIGH' ? 4 : r.risk === 'MEDIUM' ? 3 : 2;
    });
    this.heatHours.forEach((h, i) => {
      this.heatData['risk'][i]    = riskMap[h] ?? 2;
      this.heatData['traffic'][i] = Math.max(this.heatData['traffic'][i], (riskMap[h] ?? 2) - 1);
    });
  }

  private normalizeHourLabel(hour: string): string {
    if (!hour) return '';
    const m = hour.match(/^(\d{1,2})h$/);
    if (!m) return hour;
    const n = Number(m[1]);
    if (n === 12) return '12PM';
    if (n < 12)   return `${n}AM`;
    return `${n - 12}PM`;
  }

  private _extractSummary(raw: string): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const s = parsed.analyst_summary ?? parsed.summary ?? '';
        if (s) return s.trim();
      } catch {
        const match = trimmed.match(/"analyst_summary"\s*:\s*"([^"]+)"/);
        if (match) return match[1].trim();
      }
      return '';
    }
    return trimmed.slice(0, 400);
  }

  // ── UI helpers ────────────────────────────────────────
  getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  }

  avatarColor(i: number): string { return ['#2D9CDB','#9B51E0','#27AE60','#F2994A'][i % 4]; }
  mixColor(i: number):    string { return ['#2D9CDB','#27AE60','#9B51E0','#F2994A','#E74C3C'][i % 5]; }

  simulatePOS() {
    this.api.simulatePOS(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: () => setTimeout(() => this.loadData(), 1000), error: () => {} });
  }

  triggerAgent() {
    this.api.triggerCycle(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  () => setTimeout(() => this.loadData(), 1000),
        error: (e: any) => console.error('Cycle trigger error', e),
      });
  }

  trackById(i: number, item: any) { return item?.id ?? item?.advisorName ?? item?.name ?? i; }

  priorityColor(p: string): string {
    return p === 'HIGH' ? '#E74C3C' : p === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(p: string): string {
    return p === 'HIGH' ? '#FDEDEC' : p === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(s: string): string {
    return s === 'approved' ? 'Approved' : s === 'pending' ? 'Pending' : 'Done';
  }

  perfColor(p: number): string { return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C'; }

  statusBadge(s: string): string {
    return s === 'top' ? 'badge--success' : s === 'ok' ? 'badge--warning' : 'badge--danger';
  }

  statusText(s: string): string {
    return s === 'top' ? 'Top' : s === 'ok' ? 'On track' : 'Urgent';
  }

  stockRiskColor(r: string): string {
    return r === 'critical' ? '#E74C3C' : r === 'high'   ? '#F2994A'
         : r === 'medium'   ? '#F9A825' : '#00B894';
  }

  stockRiskBg(r: string): string {
    return r === 'critical' ? '#FDEDEC' : r === 'high'   ? '#FEF3E7'
         : r === 'medium'   ? '#FFF8E1' : '#E0FAF4';
  }

  stockRiskLabel(r: string): string {
    return r === 'critical' ? 'Critical' : r === 'high' ? 'High'
         : r === 'medium'   ? 'Medium'   : 'Good';
  }

  stockBarWidth(stock: number, min: number): number {
    return Math.min(100, Math.round((stock / Math.max(min * 3, 1)) * 100));
  }

  forecastBarWidth(v: number): number { return Math.min(100, Math.max(0, v || 0)); }
  actualBarWidth(v: number):   number { return Math.min(100, Math.max(0, v || 0)); }

  attainmentColor(actual: number, forecast: number): string {
    const pct = forecast > 0 ? (actual / forecast) * 100 : 0;
    return pct < 75 ? '#E74C3C' : pct < 90 ? '#F9A825' : '#00B894';
  }

  attainmentPct(actual: number, forecast: number): number {
    return forecast > 0 ? Math.round((actual / forecast) * 100) : 0;
  }

  escalate(_: string) {}
  approve(_: string)  {}
}