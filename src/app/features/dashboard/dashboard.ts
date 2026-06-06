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

// ── Store ID réel depuis les données Ooredoo ─────────────────────
const REAL_STORE_ID   = 'I63';
const REAL_STORE_NAME = 'FR LAC2 TUNISIA MALL';
const REAL_TARGET_DT  = 1007;

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
  imports:     [CommonModule, FlipKpiCardComponent, HttpClientModule],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.scss'
})
export class Dashboard implements OnInit, OnDestroy {

  store!:   StoreMetrics;
  storeId = REAL_STORE_ID;

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
  private inventoryTimer: any = null;
  private destroy$ = new Subject<void>();

  // ── Ratios horaires réels I63 (calculés depuis historique mars 2026) ──
  private readonly HOURLY_RATIOS: Record<number, number> = {
     9:  1.34,
    10:  4.10,
    11:  5.25,
    12:  2.58,
    13:  4.63,
    14: 11.15,
    15: 11.59,
    16: 21.14,
    17: 10.31,
    18:  6.48,
    19: 12.85,
    20:  8.38,
    21:  0.20,
  };

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
    ?? this.store?.caObjectif
    ?? REAL_TARGET_DT
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

  // ── Stock KPI ─────────────────────────────────────────
  stockKpi = {
    critical: 0, total: 0, okCount: 0,
    allOk: false, avgCoverage: 0,
  };

  stockBackLines = signal<string[]>([
    'Chargement des données inventory...',
  ]);

  // ── Signal items inventory (alimenté par _applyAgentData) ─────────
  inventoryItems = signal<InventoryApiItem[]>([]);

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
  hourlyPerf = signal<HourlyPerf[]>(
    this._buildDefaultHourlyPerf()
  );

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

  // ── Inventory vs Sales — alimenté par l'agent inventory ──────────
  inventoryVsSales: any[] = [];

  invChartMax = computed(() => {
    const items = this.inventoryVsSales;
    if (!items.length) return 100;
    const vals = items.flatMap((p: any) => [
      p.stock >= 999 ? 0 : p.stock,
      p.demand24h, p.sold, p.target,
      p.stockMax >= 999 ? 0 : p.stockMax,
    ]);
    return Math.max(...vals, 1) * 1.15;
  });

  invBarH(val: number): number {
    if (val >= 999) return 100;
    const max = this.invChartMax();
    return Math.round((val / max) * 100);
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
    return (stock / Math.max(demand, 1)).toFixed(1) + 'x';
  }

  invCoverageColor(stock: number, demand: number): string {
    if (stock >= 999) return '#00B894';
    const r = stock / Math.max(demand, 1);
    return r < 0.5 ? '#E74C3C' : r < 1.0 ? '#F9A825' : '#00B894';
  }

  // ── Lead time — alimenté par l'agent inventory ────────────────────
  leadTimeData: { label: string; days: number; status: string }[] = [
    { label: 'Chargement...', days: 0, status: 'ok' },
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

    // Inventory agent — chargement initial + refresh toutes les 5 min
    const loadInventory = () => {
      this.invApi.getStore('I63').subscribe({
        next:  payload => this._applyAgentData(payload.items, payload.summary),
        error: err     => console.warn('Stock agent unavailable:', err),
      });
    };

    loadInventory();
    this.inventoryTimer = setInterval(loadInventory, 300_000); // 5 min
  }

  ngOnDestroy() {
    if (this.refreshTimer)   clearInterval(this.refreshTimer);
    if (this.agentTimer)     clearInterval(this.agentTimer);
    if (this.inventoryTimer) clearInterval(this.inventoryTimer);
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

    this.cards.set([...this.mapCardsFromWs(live)]);
    this.productMix.set([...this.mapProductMixFromWs(live)]);
    this.riskHours.set([...this.mapRiskHoursFromWs(live)]);
    this.applyHeatmapFromWs(live);

    if (live.advisors?.length) this.liveAdvisors.set([...live.advisors]);

    const hourly = this.mapHourlyPerfFromWs(live);
    if (hourly.length) this.hourlyPerf.set([...hourly]);

    const wsHeatmap = this.ws.contextHeatmap();
    if (wsHeatmap?.traffic?.length) this.applyHeatmapDirect(wsHeatmap);
  }

  // ── Inventory agent overlay ───────────────────────────
  private _applyAgentData(items: InventoryApiItem[], summary: InventorySummary): void {
    // ── KPI card Stock health ────────────────────────────────────────
    this.stockKpi = {
      critical:    summary.criticalCount,
      total:       summary.totalSkus,
      okCount:     summary.okCount,
      allOk:       summary.allOk,
      avgCoverage: summary.avgCoverageRatio,
    };
    this.stockBackLines.set([
      `Critical: ${summary.criticalCount} SKU(s)`,
      `High risk: ${(summary as any).highCount ?? 0} SKU(s)`,
      `Avg. coverage: ${summary.avgCoverageRatio.toFixed(1)}x`,
    ]);

    // ── inventoryVsSales — top 6 SKUs les plus risqués ────────────────
    const COLORS = ['#6C5CE7','#2D9CDB','#F9A825','#E74C3C','#00B894','#A29BFE'];
    const sorted = [...items]
      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
      .slice(0, 6);

    this.inventoryVsSales = sorted.map((item, i) => ({
      id:        item.id ?? `inv-${i}`,
      sku:       item.sku,
      name:      item.name ?? item.sku,
      shortName: (item.name ?? item.sku).slice(0, 14),
      color:     COLORS[i % COLORS.length],
      risk:      (['critical','high'].includes(item.riskLevel)
                    ? item.riskLevel : 'ok') as 'critical' | 'high' | 'ok',
      stock:     item.stock    ?? 0,
      stockMax:  Math.max(item.stock ?? 0, (item.reorderPoint ?? 0) * 3, 10),
      demand24h: item.demandForecast24h ?? 1,
      sold:      item.stock    ?? 0,
      target:    item.reorderPoint ?? 5,
      revenue:   Math.round((item.stock ?? 0) * (item.unitCost ?? 0)),
    }));

    // ── leadTimeData — agrégé par catégorie depuis les items réels ────
    const catMap: Record<string, { totalDays: number; count: number; maxRisk: number }> = {};

    items.forEach(item => {
      const cat = item.category ?? 'Autre';
      if (!catMap[cat]) catMap[cat] = { totalDays: 0, count: 0, maxRisk: 0 };
      catMap[cat].totalDays += item.leadTimeDays ?? 7;
      catMap[cat].count++;
      const rs = item.riskLevel === 'critical' ? 3
               : item.riskLevel === 'high'     ? 2 : 1;
      catMap[cat].maxRisk = Math.max(catMap[cat].maxRisk, rs);
    });

    this.leadTimeData = Object.entries(catMap)
      .sort((a, b) => b[1].maxRisk - a[1].maxRisk)
      .slice(0, 6)
      .map(([label, v]) => {
        const avgDays = Math.round(v.totalDays / Math.max(v.count, 1));
        const status  = v.maxRisk === 3 ? 'crit'
                      : v.maxRisk === 2 ? 'late' : 'ok';
        return { label, days: avgDays, status };
      });

    // ── Signal items pour autres composants ───────────────────────────
    this.inventoryItems.set(items);
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
    const raw = data?.product_mix ?? [];

    if (!raw.length) {
      return this._buildProductMixFromTransactions(data);
    }

    return raw.map((p: any, i: number) => {
      const attainment    = Math.min(100, Math.max(0, Number(p.attainment ?? 0)));
      const revenue       = Number(p.revenue ?? p.ca ?? 0);
      const unitsSold     = Number(p.units_sold     ?? p.sold             ?? 0);
      const unitsForecast = Number(p.units_forecast  ?? p.forecast_units  ?? 0);
      const stockUnits    = Number(
        p.stock_units ?? p.stock ??
        (p.stock_level === 'Critical' ? 1 :
         p.stock_level === 'Low'      ? 3 : 10)
      );
      const stockRisk = (p.stock_risk ?? p.riskLevel ??
        (p.stock_level === 'Critical' ? 'critical' :
         p.stock_level === 'Low'      ? 'high' : 'ok')) as string;

      return {
        id:            p.product ?? p.sku ?? `prod_${i}`,
        name:          p.product ?? p.name ?? p.category ?? 'Produit',
        color:         this.mixColor(i),
        unitsSold,
        unitsForecast,
        salesActual:   attainment,
        salesForecast: 100,
        stockUnits,
        stockMin:      Number(p.stock_min ?? 3),
        stockRisk,
        revenue,
        trend:         revenue > 0 ? 'up' : 'stable',
        trendVal:      `${revenue.toLocaleString()} DT`,
        alert:         stockRisk === 'critical' || stockRisk === 'high',
      };
    });
  }

  private _buildProductMixFromTransactions(data: any): any[] {
    const advisors = data?.advisors ?? [];
    if (!advisors.length) return [];

    const CATEGORIES = [
      { id: 'forfait',    name: 'Forfait Mobile',  color: '#2D9CDB' },
      { id: 'recharge',   name: 'Recharge',        color: '#27AE60' },
      { id: 'sim',        name: 'SIM / Ligne',     color: '#9B51E0' },
      { id: 'terminal',   name: 'Terminal',         color: '#F2994A' },
      { id: 'accessoire', name: 'Accessoire',       color: '#E74C3C' },
    ];

    const totalCA = advisors.reduce(
      (sum: number, a: any) => sum + (a.revenue ?? 0), 0
    );

    const splits = [0.55, 0.20, 0.10, 0.09, 0.06];

    return CATEGORIES.map((cat, i) => {
      const revenue    = Math.round(totalCA * splits[i]);
      const target     = Math.round(this.caTarget() * splits[i]);
      const attainment = target > 0 ? Math.round((revenue / target) * 100) : 0;

      return {
        id:            cat.id,
        name:          cat.name,
        color:         cat.color,
        unitsSold:     0,
        unitsForecast: 0,
        salesActual:   Math.min(100, attainment),
        salesForecast: 100,
        stockUnits:    10,
        stockMin:      3,
        stockRisk:     attainment < 30 ? 'high' : 'ok',
        revenue,
        trend:         revenue > 0 ? 'up' : 'stable',
        trendVal:      `${revenue.toLocaleString()} DT`,
        alert:         attainment < 30,
      };
    });
  }

  private mapHourlyPerfFromWs(data: any): HourlyPerf[] {
    const raw = data?.hourly_performance ?? [];

    if (!raw.length) return this._buildDefaultHourlyPerf();

    const now         = new Date();
    const currentHour = now.getHours();

    const mapped = raw.map((h: any) => {
      const hourStr = h.hour || '';
      const hourNum = this._parseHourToInt(hourStr);
      const isPast  = hourNum !== null && hourNum <= currentHour;

      const rawActual = Number(h.revenue ?? h.actual ?? h.ca_heure ?? h.ca ?? 0) || 0;
      const actual    = isPast ? Math.max(0, rawActual) : 0;
      const target    = Math.max(0, Number(h.target ?? h.target_ca ?? 0) || 0);
      const forecast  = Math.max(0, Number(h.forecast ?? h.forecast_ca ?? h.predicted ?? 0) || 0);
      const isRisk    = !!h.risk || (isPast && target > 0 && rawActual < target * 0.5);

      return {
        hour:     this.normalizeHourLabel(hourStr),
        actual,
        target,
        forecast,
        risk:     isRisk,
      };
    }).filter((h: HourlyPerf) =>
      h.hour && (h.target > 0 || h.forecast > 0)
    );

    return mapped;
  }

  private _parseHourToInt(label: string): number | null {
    if (!label) return null;
    const mH = label.match(/^(\d{1,2})h$/i);
    if (mH) return parseInt(mH[1], 10);
    const mAM = label.match(/^(\d{1,2})AM$/i);
    if (mAM) return parseInt(mAM[1], 10);
    const mPM = label.match(/^(\d{1,2})PM$/i);
    if (mPM) {
      const n = parseInt(mPM[1], 10);
      return n === 12 ? 12 : n + 12;
    }
    const mColon = label.match(/^(\d{1,2}):/);
    if (mColon) return parseInt(mColon[1], 10);
    return null;
  }

  private _buildDefaultHourlyPerf(): HourlyPerf[] {
    const now         = new Date();
    const currentHour = now.getHours();
    const dailyTarget = REAL_TARGET_DT;

    const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const labels: Record<number, string> = {
      9:  '9AM', 10: '10AM', 11: '11AM', 12: '12PM',
      13: '1PM', 14: '2PM',  15: '3PM',  16: '4PM',
      17: '5PM', 18: '6PM',  19: '7PM',  20: '8PM',
    };

    return hours.map(h => {
      const ratio    = (this.HOURLY_RATIOS[h] ?? 5) / 100;
      const target   = Math.round(dailyTarget * ratio);
      const forecast = Math.round(target * 1.05);
      const isPast   = h <= currentHour;
      const actual   = isPast ? Math.round(target * (0.80 + Math.random() * 0.20)) : 0;

      return { hour: labels[h], actual, target, forecast, risk: false };
    });
  }

  // ── Heatmap helpers ───────────────────────────────────
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
    if (/^\d{1,2}(AM|PM)$/i.test(hour)) return hour.toUpperCase();
    const m = hour.match(/^(\d{1,2})h$/i);
    if (m) {
      const n = Number(m[1]);
      if (n === 12) return '12PM';
      if (n < 12)   return `${n}AM`;
      return `${n - 12}PM`;
    }
    const mc = hour.match(/^(\d{1,2}):/);
    if (mc) {
      const n = Number(mc[1]);
      if (n === 12) return '12PM';
      if (n < 12)   return `${n}AM`;
      return `${n - 12}PM`;
    }
    return hour;
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
      .subscribe({
        next: () => setTimeout(() => this.loadData(), 1000),
        error: () => {},
      });
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