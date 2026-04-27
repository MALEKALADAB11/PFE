import {
  Component, computed, signal,
  OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Advisor } from '../../core/models/advisor';
import { StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { ApiService } from '../../core/services/api';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  FlipKpiCardComponent,
  FlipCardData
} from '../../shared/components/flip-kpi-card/flip-kpi-card';

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
  imports:     [CommonModule, FlipKpiCardComponent],
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
    private data: MockDataService,
    private api:  ApiService,
    public  ws:   WebSocketService
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
    ?? Math.round((this.caToday() / this.caTarget()) * 100)
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

  // ── Analyst summary — extrait proprement du JSON ──────
  analystSummary = computed(() => {
    const raw = this.ws.analystSummary()
             ?? this.ws.liveMetrics()?.analyst_summary
             ?? '';
    return this._extractSummary(raw);
  });

  visitorsH  = computed(() => this.ws.liveMetrics()?.visitors_h  ?? 0);
  agentsLive = computed(() => this.ws.liveMetrics()?.agents_live ?? 0);
  isLive     = computed(() => this.ws.connected());

  // ── Flip Cards — computed signal (réactif) ────────────
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
        trend:       `▼ ${gap.toFixed(1)}% vs target`,
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
        trend:       `${gap.toFixed(0)}% gap — ${urgence} risk`,
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
        label:       'Agent focus',
        value:       urgence,
        trend:       summaryShort,
        trendDir:    urgence === 'LOW' ? 'up' : 'down',
        accentColor: urgence === 'HIGH'   ? 'red'
                   : urgence === 'MEDIUM' ? 'amber' : 'teal',
        backTitle:   'Résumé analyste',
        backLines:   [
          summary || 'En attente de l\'analyse LLM...',
        ]
      }
    ];
  });

  // ── Hourly performance ────────────────────────────────
  hourlyPerf = signal<HourlyPerf[]>([
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
  ]);

  hourlyPerfFilter = signal<'all' | 'risk'>('all');

  perfMax = computed(() =>
    Math.max(
      ...this.hourlyPerf().map(h => Math.max(h.actual, h.target, h.forecast)), 1
    ) * 1.1
  );

  perfBarHeight(val: number): number {
    return Math.round((val / this.perfMax()) * 100);
  }

  perfLineY(val: number, chartHeight = 200): number {
    return chartHeight - Math.round((val / this.perfMax()) * chartHeight);
  }

  targetPoints(): string {
    const arr = this.hourlyPerf();
    return arr.map((h, i) => {
      const x = (i / (arr.length - 1)) * 1200;
      return `${x},${this.perfLineY(h.target)}`;
    }).join(' ');
  }

  forecastPoints(): string {
    const arr = this.hourlyPerf();
    return arr.map((h, i) => {
      const x = (i / (arr.length - 1)) * 1200;
      return `${x},${this.perfLineY(h.forecast)}`;
    }).join(' ');
  }

  riskBarWidth(pct: number): number { return pct; }

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
    return colors[Math.min(val - 1, 4)];
  }

  heatLabel(val: number): string {
    return ['','Low','Med','High','Crit','Crit'][val] ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────
  ngOnInit() {
    this.loadData();
    this.ws.connectStore(this.storeId);
    this.agentTimer   = setInterval(() => this.syncFromWs(), 3000);
    this.refreshTimer = setInterval(() => this.loadData(), 120000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.agentTimer)   clearInterval(this.agentTimer);
    this.destroy$.next();
    this.destroy$.complete();
    // ── NE PAS déconnecter le WS ─────────────────────────
    // La sidebar l'utilise aussi → pas de ws.disconnect() ici
  }

  // ── Chargement API ────────────────────────────────────
  private loadData() {
    this.api.getStoreMetrics(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => { this.liveMetrics.set(d); this.isLoading.set(false); },
        error: ()       => this.isLoading.set(false)
      });

    this.api.getAdvisors(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => this.liveAdvisors.set(d.advisors ?? []),
        error: ()       => {}
      });

    this.api.getForecastEOD(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  (d: any) => this.forecastEOD.set(d),
        error: ()       => {}
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
        error: () => {}
      });
  }

  // ── Sync WS toutes les 3s ─────────────────────────────
  private syncFromWs() {
    const live = this.ws.liveMetrics();
    if (!live) return;

    this.cards.set(this.mapCardsFromWs(live));
    this.productMix.set(this.mapProductMixFromWs(live));
    this.riskHours.set(this.mapRiskHoursFromWs(live));
    this.applyHeatmapFromWs(live);

    if (live.advisors?.length) {
      this.liveAdvisors.set(live.advisors);
    }

    const hourly = this.mapHourlyPerfFromWs(live);
    if (hourly.length) this.hourlyPerf.set(hourly);
  }

  // ── Mappers ───────────────────────────────────────────
  private mapRiskHoursFromWs(data: any): RiskHour[] {
    return (data?.risk_hours ?? []).map((r: any) => ({
      hour:      r.hour,
      actualPct: Math.round(r.target_pct ?? r.target_attainment ?? 0),
      gap:       Math.round(r.units_behind ?? r.gap_units ?? 0)
    }));
  }

  private mapCardsFromWs(data: any): any[] {
    const advisors = data?.advisors ?? [];
    return advisors.slice(0, 4).map((a: any, i: number) => ({
      id:              a.id ?? a.name,
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
      status:          'pending'
    }));
  }

  private mapProductMixFromWs(data: any): any[] {
    return (data?.product_mix ?? []).map((p: any, i: number) => ({
      id:            p.product ?? `prod_${i}`,
      name:          p.product ?? 'Produit',
      color:         this.mixColor(i),
      unitsSold:     0,
      unitsForecast: 0,
      salesActual:   Math.min(100, p.attainment ?? 0),
      salesForecast: 100,
      stockUnits:    p.stock_level === 'Low' ? 3 : 10,
      stockMin:      3,
      stockRisk:     p.stock_level === 'Low' ? 'high' : 'low',
      revenue:       p.revenue ?? 0,
      trend:         'up',
      trendVal:      `${(p.revenue ?? 0).toLocaleString()} TND`,
      alert:         p.stock_level === 'Low'
    }));
  }

  private mapHourlyPerfFromWs(data: any): HourlyPerf[] {
    return (data?.hourly_performance ?? []).map((h: any) => ({
      hour:     this.normalizeHourLabel(h.hour),
      actual:   Number(h.revenue  ?? h.actual   ?? 0),
      target:   Number(h.target   ?? 0),
      forecast: Number(h.forecast ?? 0),
      risk:     !!h.risk
    }));
  }

  private applyHeatmapFromWs(data: any) {
    const heatmap = data?.context_heatmap;
    if (heatmap && heatmap.traffic?.length) {
      this.applyHeatmapDirect(heatmap);
    } else {
      this.applySignalsToHeatmap(
        data?.context_signals ?? [],
        data?.risk_hours      ?? []
      );
    }
  }

  private applyHeatmapDirect(heatmap: any) {
    const lv: Record<string, number> = { low: 1, med: 2, high: 3, crit: 4 };
    const c = (arr: string[]): number[] => (arr ?? []).map(v => lv[v] ?? 1);
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
      this.heatData['traffic'][i] = Math.max(
        this.heatData['traffic'][i], (riskMap[h] ?? 2) - 1
      );
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

  // ── Extraction summary depuis JSON brut ───────────────
  private _extractSummary(raw: string): string {
    if (!raw) return '';
    const trimmed = raw.trim();

    if (trimmed.startsWith('{')) {
      // Tenter parse JSON complet
      try {
        const parsed = JSON.parse(trimmed);
        const s = parsed.analyst_summary ?? parsed.summary ?? '';
        if (s) return s.trim();
      } catch {
        // JSON tronqué → regex
        const match = trimmed.match(/"analyst_summary"\s*:\s*"([^"]+)"/);
        if (match) return match[1].trim();
      }
      // Si on ne peut pas extraire → fallback vide
      return '';
    }

    // Texte libre → retourner directement (max 400 chars)
    return trimmed.slice(0, 400);
  }

  // ── Helpers UI ────────────────────────────────────────
  getInitials(name: string): string {
    return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  }

  avatarColor(i: number): string {
    return ['#2D9CDB','#9B51E0','#27AE60','#F2994A'][i % 4];
  }

  mixColor(i: number): string {
    return ['#2D9CDB','#27AE60','#9B51E0','#F2994A','#E74C3C'][i % 5];
  }

  simulatePOS() {
    this.api.simulatePOS(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  () => setTimeout(() => this.loadData(), 1000),
        error: () => {}
      });
  }

  triggerAgent() {
    this.api.triggerCycle(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  () => setTimeout(() => this.loadData(), 1000),
        error: (e: any) => console.error('Cycle trigger error', e)
      });
  }

  trackById(_: number, item: any) { return item?.id ?? item?.name ?? _; }

  priorityColor(p: string): string {
    return p === 'HIGH' ? '#E74C3C' : p === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(p: string): string {
    return p === 'HIGH' ? '#FDEDEC' : p === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(s: string): string {
    return s === 'approved' ? 'Approved' : s === 'pending' ? 'Pending' : 'Done';
  }

  perfColor(p: number): string {
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  }

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
    return r === 'critical' ? 'Critical' : r === 'high'   ? 'High'
         : r === 'medium'   ? 'Medium'   : 'Good';
  }

  stockBarWidth(stock: number, min: number): number {
    return Math.min(100, Math.round((stock / Math.max(min * 3, 1)) * 100));
  }

  forecastBarWidth(v: number): number { return Math.min(100, v); }
  actualBarWidth(v: number):   number { return Math.min(100, v); }

  attainmentColor(actual: number, forecast: number): string {
    const pct = forecast > 0 ? (actual / forecast) * 100 : 0;
    return pct < 75 ? '#E74C3C' : pct < 90 ? '#F9A825' : '#00B894';
  }

  attainmentPct(actual: number, forecast: number): number {
    return forecast > 0 ? Math.round((actual / forecast) * 100) : 0;
  }

  leadTimeData = [
    { label: 'Top-up',      days: 4, status: 'ok'   },
    { label: 'Smartphones', days: 7, status: 'late'  },
    { label: 'SIM',         days: 5, status: 'ok'    },
    { label: 'Accessories', days: 9, status: 'crit'  },
    { label: 'Routers',     days: 6, status: 'late'  },
    { label: 'Tablets',     days: 3, status: 'ok'    },
  ];

  leadTimeBarHeight(days: number): number {
    return Math.min(100, (days / 12) * 100);
  }

  leadTimeColor(s: string): string {
    return s === 'crit' ? '#E74C3C' : s === 'late' ? '#F9A825' : '#2D9CDB';
  }

  leadTimeBg(s: string): string {
    return s === 'crit' ? '#FDEDEC' : s === 'late' ? '#FFF8E1' : '#EAF4FE';
  }

  targetLineBottom(): number { return (5 / 12) * 100; }

  escalate(_: string) {}
  approve(_: string)  {}
}