import {
  Component, computed, signal,
  OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Advisor } from '../../core/models/advisor';
import { StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { ApiService } from '../../core/services/api';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  FlipKpiCardComponent,
  FlipCardData
} from '../../shared/components/flip-kpi-card/flip-kpi-card';
import { MetricCardComponent } from '../../shared/components/metric-card/metric-card';

interface HourlyPerf {
  hour: string;
  actual: number;
  target: number;
  forecast: number;
  risk: boolean;
}

interface RiskHour {
  hour: string;
  actualPct: number;
  gap: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MetricCardComponent, FlipKpiCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit, OnDestroy {
  store!: StoreMetrics;
  storeId = 'store-lac2';

  liveMetrics = signal<any>(null);
  liveAdvisors = signal<Advisor[]>([]);
  forecastEOD = signal<any>(null);
  isLoading = signal(true);

  cards = signal<any[]>([]);
  productMix = signal<any[]>([]);
  riskHours = signal<RiskHour[]>([]);

  private _mockAdvisors: Advisor[] = [];
  private refreshTimer: any = null;
  private agentTimer: any = null;

  constructor(
    private data: MockDataService,
    private api: ApiService,
    public ws: WebSocketService
  ) {
    this.store = this.data.getStoreMetrics();
    this._mockAdvisors = this.data.getAdvisors();
  }

  get advisors(): Advisor[] {
    const live = this.ws.liveAdvisors();
    const apiList = this.liveAdvisors();
    const baseList = apiList.length ? apiList : this._mockAdvisors;

    if (!live.length) return baseList;

    return baseList.map(adv => {
      const wsData = live.find((l: any) => l.advisor_id === adv.id);
      if (!wsData) return adv;

      const ca = Math.round(wsData.ca_today);
      const perf = Math.round((ca / (adv.caObjectif ?? 2000)) * 100);
      const status: 'top' | 'ok' | 'urgent' | 'attente' =
        perf >= 80 ? 'top' : perf >= 50 ? 'ok' : 'urgent';

      return { ...adv, caRealized: ca, performance: perf, status };
    }).sort((a, b) => b.performance - a.performance);
  }

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
    ?? this.ws.liveMetrics()?.attainment_pct
    ?? this.liveMetrics()?.attainment_pct
    ?? Math.round((this.caToday() / this.caTarget()) * 100)
  );

  niveauUrgence = computed(() =>
    this.ws.liveMetrics()?.niveau_urgence ?? 'LOW'
  );

  forecastEodAgent = computed(() =>
    this.ws.liveMetrics()?.forecast_eod
    ?? this.forecastEOD()?.eod
    ?? 0
  );

  ecartObjectif = computed(() =>
    this.ws.liveMetrics()?.ecart_objectif
    ?? this.forecastEOD()?.gap_pct
    ?? 0
  );

  recommendedFocus = computed(() =>
    this.ws.liveMetrics()?.recommended_focus ?? 'No recommendation yet'
  );

  coachOpeningMessage = computed(() =>
    this.ws.liveMetrics()?.coach_opening_message ?? ''
  );

  contextSignals = computed(() =>
    this.ws.liveMetrics()?.context_signals ?? []
  );

  advisorPriorities = computed(() =>
    this.ws.liveMetrics()?.advisor_priorities ?? []
  );

  productOpportunities = computed(() =>
    this.ws.liveMetrics()?.product_opportunities ?? []
  );

  get flipCards(): FlipCardData[] {
    const att = this.attainment();
    const ca = this.caToday();
    const target = this.caTarget();
    const eod = this.forecastEodAgent();
    const gap = this.ecartObjectif();
    const urgence = this.niveauUrgence();
    const focus = this.recommendedFocus();

    return [
      {
        label: 'Visitors / h',
        value: String(this.ws.liveMetrics()?.visitors_h ?? 0),
        trend: `${this.ws.connected() ? 'LIVE' : 'Polling'} traffic`,
        trendDir: 'up',
        accentColor: 'blue',
        backTitle: 'Traffic analysis',
        backLines: [
          this.contextSignals()[0]?.label ?? 'No signal',
          this.contextSignals()[1]?.label ?? 'No signal',
          focus
        ]
      },
      {
        label: 'Revenue today',
        value: Math.round(ca).toLocaleString(),
        suffix: 'DT',
        trend: `▼ ${gap.toFixed(1)}% vs target`,
        trendDir: 'down',
        accentColor: gap > 25 ? 'red' : gap > 10 ? 'amber' : 'teal',
        backTitle: 'Revenue breakdown',
        backLines: [
          `CA today: ${Math.round(ca).toLocaleString()} DT`,
          `Target: ${Math.round(target).toLocaleString()} DT`,
          `Forecast EOD: ${Math.round(eod).toLocaleString()} DT`
        ]
      },
      {
        label: 'Daily target',
        value: att.toString(),
        suffix: '%',
        trend: `${gap.toFixed(0)}% gap — ${urgence} risk`,
        trendDir: 'down',
        accentColor: urgence === 'HIGH' ? 'red' : urgence === 'MEDIUM' ? 'amber' : 'teal',
        backTitle: 'APP02 Agent insight',
        backLines: [focus, this.coachOpeningMessage(), `Urgency: ${urgence}`]
      },
      {
        label: 'Agent focus',
        value: urgence,
        trend: focus,
        trendDir: 'up',
        accentColor: urgence === 'HIGH' ? 'red' : 'teal',
        backTitle: 'Coach opening',
        backLines: [this.coachOpeningMessage()]
      }
    ];
  }

  hourlyPerf = signal<HourlyPerf[]>([
    { hour: '9AM', actual: 38, target: 60, forecast: 65, risk: false },
    { hour: '10AM', actual: 82, target: 95, forecast: 90, risk: false },
    { hour: '11AM', actual: 95, target: 110, forecast: 118, risk: false },
    { hour: '12PM', actual: 88, target: 120, forecast: 125, risk: true },
    { hour: '1PM', actual: 72, target: 92, forecast: 88, risk: true },
    { hour: '2PM', actual: 128, target: 115, forecast: 110, risk: false },
    { hour: '3PM', actual: 112, target: 118, forecast: 120, risk: false },
    { hour: '4PM', actual: 138, target: 135, forecast: 130, risk: false },
    { hour: '5PM', actual: 155, target: 148, forecast: 145, risk: false },
    { hour: '6PM', actual: 130, target: 125, forecast: 128, risk: false },
    { hour: '7PM', actual: 98, target: 110, forecast: 105, risk: false },
    { hour: '8PM', actual: 42, target: 50, forecast: 48, risk: false },
  ]);

  hourlyPerfFilter = signal<'all' | 'risk'>('all');

  perfMax = computed(() =>
    Math.max(...this.hourlyPerf().map(h => Math.max(h.actual, h.target, h.forecast))) * 1.1
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

  heatHours = ['11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM'];
  heatRows = [
    { key: 'traffic', label: 'Traffic' },
    { key: 'weather', label: 'Weather' },
    { key: 'stock', label: 'Stock' },
    { key: 'event', label: 'Event' },
    { key: 'risk', label: 'Risk' },
  ];

  heatData: Record<string, number[]> = {
    traffic: [4,4,3,3,4,5,5,4],
    weather: [1,1,1,1,1,1,1,1],
    stock:   [1,1,1,1,1,1,1,1],
    event:   [1,1,1,1,1,1,1,1],
    risk:    [2,2,2,2,2,2,2,2],
  };

  heatColor(val: number): string {
    const colors = ['#EAF3DE','#C0DD97','#EF9F27','#E74C3C','#A32D2D'];
    return colors[Math.min(val - 1, 4)];
  }

  heatLabel(val: number): string {
    return ['','Low','Med','High','Crit','Crit'][val] ?? '';
  }

  ngOnInit() {
    this.loadData();
    this.ws.connectStore(this.storeId);

    this.agentTimer = setInterval(() => {
      this.syncFromWs();
    }, 2000);

    this.refreshTimer = setInterval(() => this.loadData(), 60000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.agentTimer) clearInterval(this.agentTimer);
    this.ws.disconnect();
  }

  private loadData() {
    this.api.getStoreMetrics(this.storeId).subscribe({
      next: (d: any) => {
        this.liveMetrics.set(d);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });

    this.api.getAdvisors(this.storeId).subscribe({
      next: (d: any) => this.liveAdvisors.set(d.advisors ?? []),
      error: () => {}
    });

    this.api.getForecastEOD(this.storeId).subscribe({
      next: (d: any) => this.forecastEOD.set(d),
      error: () => {}
    });

    this.api.getLiveAnalysis(this.storeId).subscribe({
      next: (d: any) => {
        this.cards.set(this.mapCardsFromLiveAnalysis(d));
        this.productMix.set(this.mapProductMixFromLiveAnalysis(d));
        this.riskHours.set(this.mapRiskHoursFromLiveAnalysis(d));
        this.applyHeatmapFromLiveAnalysis(d);
      },
      error: () => {}
    });
  }

  private syncFromWs() {
    const live = this.ws.liveMetrics();
    if (!live) return;

    this.cards.set(this.mapCardsFromWs(live));
    this.productMix.set(this.mapProductMixFromWs(live));
    this.riskHours.set(this.mapRiskHoursFromWs(live));
    this.applyHeatmapFromWs(live);

    const hourly = this.mapHourlyPerfFromWs(live);
    if (hourly.length) {
      this.hourlyPerf.set(hourly);
    }
  }

  private mapRiskHoursFromLiveAnalysis(data: any): RiskHour[] {
    return (data?.risk_hours ?? []).map((r: any) => ({
      hour: r.hour,
      actualPct: Math.round(r.target_attainment ?? 0),
      gap: Math.round(r.gap_units ?? 0)
    }));
  }

  private mapRiskHoursFromWs(data: any): RiskHour[] {
    return (data?.risk_hours ?? []).map((r: any) => ({
      hour: r.hour,
      actualPct: Math.round(r.target_attainment ?? 0),
      gap: Math.round(r.gap_units ?? 0)
    }));
  }

  private mapCardsFromLiveAnalysis(data: any): any[] {
    return (data?.advisor_priorities ?? []).map((a: any, i: number) => ({
      id: a.advisor_id,
      advisorName: a.name,
      advisorInitials: this.getInitials(a.name),
      avatarColor: this.avatarColor(i),
      target: Math.round(a.performance ?? 0),
      priority: a.priority === 'TOP_CLOSE' ? 'OK' : a.priority === 'STABLE' ? 'MED' : 'HIGH',
      time: 'LIVE',
      gap: Math.max(0, 100 - Math.round(a.performance ?? 0)),
      context: a.reason,
      advice: a.action,
      status: 'pending'
    }));
  }

  private mapCardsFromWs(data: any): any[] {
    return (data?.advisor_priorities ?? []).map((a: any, i: number) => ({
      id: a.advisor_id,
      advisorName: a.name,
      advisorInitials: this.getInitials(a.name),
      avatarColor: this.avatarColor(i),
      target: Math.round(a.performance ?? 0),
      priority: a.priority === 'TOP_CLOSE' ? 'OK' : a.priority === 'STABLE' ? 'MED' : 'HIGH',
      time: 'LIVE',
      gap: Math.max(0, 100 - Math.round(a.performance ?? 0)),
      context: a.reason,
      advice: a.action,
      status: 'pending'
    }));
  }

  private mapProductMixFromLiveAnalysis(data: any): any[] {
    return (data?.product_opportunities ?? []).map((p: any, i: number) => ({
      id: p.sku,
      name: p.label,
      color: this.mixColor(i),
      unitsSold: 0,
      unitsForecast: 0,
      salesActual: p.priority === 'HIGH' ? 85 : p.priority === 'MEDIUM' ? 65 : 50,
      salesForecast: 100,
      stockUnits: p.stock ?? 0,
      stockMin: 3,
      stockRisk: p.risk_level === 'high' ? 'high' : p.risk_level === 'critical' ? 'critical' : 'low',
      revenue: 0,
      trend: 'up',
      trendVal: p.reason,
      alert: p.risk_level === 'critical' || p.risk_level === 'high'
    }));
  }

  private mapProductMixFromWs(data: any): any[] {
    return (data?.product_opportunities ?? []).map((p: any, i: number) => ({
      id: p.sku,
      name: p.label,
      color: this.mixColor(i),
      unitsSold: 0,
      unitsForecast: 0,
      salesActual: p.priority === 'HIGH' ? 85 : p.priority === 'MEDIUM' ? 65 : 50,
      salesForecast: 100,
      stockUnits: p.stock ?? 0,
      stockMin: 3,
      stockRisk: p.risk_level === 'high' ? 'high' : p.risk_level === 'critical' ? 'critical' : 'low',
      revenue: 0,
      trend: 'up',
      trendVal: p.reason,
      alert: p.risk_level === 'critical' || p.risk_level === 'high'
    }));
  }

  private applyHeatmapFromLiveAnalysis(data: any) {
    this.applySignalsToHeatmap(
      data?.context_signals ?? [],
      data?.risk_hours ?? []
    );
  }

  private applyHeatmapFromWs(data: any) {
    this.applySignalsToHeatmap(
      data?.context_signals ?? [],
      data?.risk_hours ?? []
    );
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
      if (s.type === 'stock') this.heatData['stock'] = [1,1,2,3,3,4,4,3];
      if (s.type === 'event') this.heatData['event'] = [1,1,1,2,3,4,5,4];
    });

    const riskMap: Record<string, number> = {};
    (riskHours ?? []).forEach((r: any) => {
      const key = this.normalizeHourLabel(r.hour);
      riskMap[key] = r.risk === 'HIGH' ? 5 : r.risk === 'MEDIUM' ? 4 : 2;
    });

    this.heatHours.forEach((h, i) => {
      this.heatData['risk'][i] = riskMap[h] ?? 2;
      this.heatData['traffic'][i] = Math.max(this.heatData['traffic'][i], (riskMap[h] ?? 2) - 1);
    });
  }

  private mapHourlyPerfFromWs(data: any): HourlyPerf[] {
    return (data?.hourly_performance ?? []).map((h: any) => ({
      hour: this.normalizeHourLabel(h.hour),
      actual: Number(h.actual ?? 0),
      target: Number(h.target ?? 0),
      forecast: Number(h.forecast ?? 0),
      risk: !!h.risk
    }));
  }

  private normalizeHourLabel(hour: string): string {
    if (!hour) return '';
    const m = hour.match(/^(\d{1,2})h$/);
    if (!m) return hour;
    const num = Number(m[1]);
    if (num === 12) return '12PM';
    if (num < 12) return `${num}AM`;
    return `${num - 12}PM`;
  }

  getInitials(name: string): string {
    return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  }

  avatarColor(i: number): string {
    const colors = ['#2D9CDB', '#9B51E0', '#27AE60', '#F2994A'];
    return colors[i % colors.length];
  }

  mixColor(i: number): string {
    const colors = ['#2D9CDB', '#27AE60', '#9B51E0', '#F2994A', '#E74C3C'];
    return colors[i % colors.length];
  }

  simulatePOS() {
    this.api.simulatePOS(this.storeId).subscribe({
      next: () => setTimeout(() => this.loadData(), 1000),
      error: () => {}
    });
  }

  triggerAgent() {
    this.api.triggerCycle(this.storeId).subscribe({
      next: () => setTimeout(() => this.loadData(), 1000),
      error: (e: any) => console.error('Cycle trigger error', e)
    });
  }

  trackById(_: number, item: { id: string }) { return item.id; }

  priorityColor(priority: string): string {
    return priority === 'HIGH' ? '#E74C3C' : priority === 'MED' ? '#F9A825' : '#00B894';
  }

  priorityBg(priority: string): string {
    return priority === 'HIGH' ? '#FDEDEC' : priority === 'MED' ? '#FFF8E1' : '#E0FAF4';
  }

  statusLabel(status: string): string {
    return status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending' : 'Done';
  }

  perfColor(perf: number): string {
    return perf >= 80 ? '#00B894' : perf >= 50 ? '#F9A825' : '#E74C3C';
  }

  statusBadge(status: string): string {
    return status === 'top'
      ? 'badge--success'
      : status === 'ok'
      ? 'badge--warning'
      : 'badge--danger';
  }

  statusText(status: string): string {
    return status === 'top' ? 'Top' : status === 'ok' ? 'On track' : 'Urgent';
  }

  stockRiskColor(risk: string): string {
    if (risk === 'critical') return '#E74C3C';
    if (risk === 'high') return '#F2994A';
    if (risk === 'medium') return '#F9A825';
    return '#00B894';
  }

  stockRiskBg(risk: string): string {
    if (risk === 'critical') return '#FDEDEC';
    if (risk === 'high') return '#FEF3E7';
    if (risk === 'medium') return '#FFF8E1';
    return '#E0FAF4';
  }

  stockRiskLabel(risk: string): string {
    if (risk === 'critical') return 'Critical';
    if (risk === 'high') return 'High';
    if (risk === 'medium') return 'Medium';
    return 'Good';
  }

  stockBarWidth(stock: number, min: number): number {
    return Math.min(100, Math.round((stock / Math.max(min * 3, 1)) * 100));
  }

  forecastBarWidth(v: number): number { return Math.min(100, v); }
  actualBarWidth(v: number): number { return Math.min(100, v); }

  attainmentColor(actual: number, forecast: number): string {
    const pct = forecast > 0 ? (actual / forecast) * 100 : 0;
    return pct < 75 ? '#E74C3C' : pct < 90 ? '#F9A825' : '#00B894';
  }

  attainmentPct(actual: number, forecast: number): number {
    return forecast > 0 ? Math.round((actual / forecast) * 100) : 0;
  }

  leadTimeData = [
    { label: 'Top-up', days: 4, status: 'ok' },
    { label: 'Smartphones', days: 7, status: 'late' },
    { label: 'SIM', days: 5, status: 'ok' },
    { label: 'Accessories', days: 9, status: 'crit' },
    { label: 'Routers', days: 6, status: 'late' },
    { label: 'Tablets', days: 3, status: 'ok' },
  ];

  leadTimeBarHeight(days: number): number {
    return Math.min(100, (days / 12) * 100);
  }

  leadTimeColor(status: string): string {
    if (status === 'crit') return '#E74C3C';
    if (status === 'late') return '#F9A825';
    return '#2D9CDB';
  }

  leadTimeBg(status: string): string {
    if (status === 'crit') return '#FDEDEC';
    if (status === 'late') return '#FFF8E1';
    return '#EAF4FE';
  }

  targetLineBottom(): number {
    return (5 / 12) * 100;
  }

  escalate(_: string) {}
  approve(_: string) {}
}