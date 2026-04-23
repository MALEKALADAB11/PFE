// 
import { Component, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Agent } from '../../core/models/agent';
import { StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { ApiService } from '../../core/services/api';
import { WebSocketService } from '../../core/services/websocket.service';

interface HourlyPoint {
  hour:   string;
  actual: number | null;
  target: number;
}

@Component({
  selector:    'app-sidebar',
  standalone:  true,
  imports:     [CommonModule, RouterLink],
  templateUrl: './sidebar.html',
  styleUrl:    './sidebar.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {

  // ── Config ────────────────────────────────────────────
  storeId = 'store-lac2';

  // ── Static base ───────────────────────────────────────
  isCollapsed = signal(false);
  store       = signal<StoreMetrics>({} as StoreMetrics);
  agents      = signal<Agent[]>([]);

  // ── Live HTTP data ────────────────────────────────────
  liveMetrics  = signal<any>(null);
  forecastEOD  = signal<any>(null);
  isLoading    = signal(true);

  // ── Revenue mini-chart (12 hourly buckets 9 AM–8 PM) ─
  hourlyPoints = signal<HourlyPoint[]>([
    { hour: '9',  actual: null, target: 667 },
    { hour: '10', actual: null, target: 667 },
    { hour: '11', actual: null, target: 667 },
    { hour: '12', actual: null, target: 667 },
    { hour: '1',  actual: null, target: 667 },
    { hour: '2',  actual: null, target: 667 },
    { hour: '3',  actual: null, target: 667 },
    { hour: '4',  actual: null, target: 667 },
    { hour: '5',  actual: null, target: 667 },
    { hour: '6',  actual: null, target: 667 },
    { hour: '7',  actual: null, target: 667 },
    { hour: '8',  actual: null, target: 667 },
  ]);

  private _refreshInterval?: ReturnType<typeof setInterval>;

  // ── Computed KPIs ──────────────────────────────────────
  caToday = computed(() =>
    this.ws.liveMetrics()?.ca_today
    ?? this.liveMetrics()?.ca_today
    ?? this.store()?.caJournalier
    ?? 0
  );

  caTarget = computed(() =>
    this.ws.liveMetrics()?.ca_target
    ?? this.liveMetrics()?.ca_target
    ?? this.store()?.caObjectif
    ?? 8000
  );

  caPercent = computed(() => {
    const target = this.caTarget();
    if (!target) return 0;
    return Math.min(Math.round((this.caToday() / target) * 100), 100);
  });

  traficPercent = computed(() => {
    const s = this.store();
    if (!s?.traficCapacity) return 0;
    return Math.round((s.traficBoutique / s.traficCapacity) * 100);
  });

  // ── Forecast EOD ──────────────────────────────────────
  forecastEodValue = computed(() =>
    this.ws.liveMetrics()?.forecast_eod
    ?? this.forecastEOD()?.eod
    ?? null
  );

  forecastGapPct = computed(() =>
    this.ws.liveMetrics()?.ecart_objectif
    ?? this.forecastEOD()?.gap_pct
    ?? null
  );

  niveauUrgence = computed(() =>
    this.ws.liveMetrics()?.niveau_urgence
    ?? 'LOW'
  );

  // ── Revenue trend vs yesterday ─────────────────────────
  revenueTrend = computed(() => {
    const live = this.ws.liveMetrics();
    return live?.ca_yesterday_same_hour != null
      ? Math.round(((this.caToday() - live.ca_yesterday_same_hour) / live.ca_yesterday_same_hour) * 100)
      : null;
  });

  // ── Mini sparkline max for scaling ────────────────────
  sparkMax = computed(() => {
    const pts    = this.hourlyPoints();
    const values = pts.flatMap(p => [p.actual ?? 0, p.target]);
    return Math.max(...values, 100) * 1.1;
  });

  sparkBarH(val: number | null): number {
    if (val === null) return 0;
    return Math.round((val / this.sparkMax()) * 100);
  }

  sparkTargetH(val: number): number {
    return Math.round((val / this.sparkMax()) * 100);
  }

  // ── Urgence color ─────────────────────────────────────
  urgenceColor = computed(() => {
    const u = this.niveauUrgence();
    if (u === 'HIGH')   return '#E74C3C';
    if (u === 'MEDIUM') return '#F9A825';
    return '#00B894';
  });

  urgenceBg = computed(() => {
    const u = this.niveauUrgence();
    if (u === 'HIGH')   return '#FDEDEC';
    if (u === 'MEDIUM') return '#FFF8E1';
    return '#E0FAF4';
  });

  // ── Progress bar color ────────────────────────────────
  progressColor = computed(() => {
    const p = this.caPercent();
    if (p >= 80) return '#00B894';
    if (p >= 60) return '#F9A825';
    return '#E74C3C';
  });

  // ── Agent Status — /monitoring only ──────────────────
  showAgentStatus = computed(() =>
    this.router.url === '/monitoring'
  );

  constructor(
    private data:   MockDataService,
    private api:    ApiService,
    public  ws:     WebSocketService,
    private router: Router
  ) {
    this.store.set(this.data.getStoreMetrics());
    this.agents.set(this.data.getAgents());
  }

  ngOnInit() {
    // 1 — Load initial HTTP data
    this.loadData();

    // 2 — Connect WebSocket
    this.ws.connectStore(this.storeId);

    // 3 — Refresh every 60s (HTTP fallback)
    this._refreshInterval = setInterval(() => this.loadData(), 60_000);
  }

  ngOnDestroy() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    // Do NOT disconnect WS here — Dashboard owns the connection
  }

  toggle() { this.isCollapsed.update(v => !v); }

  private loadData() {
    // Store metrics
    this.api.getStoreMetrics(this.storeId).subscribe({
      next: (d: any) => {
        this.liveMetrics.set(d);
        this.isLoading.set(false);
        this._buildHourlyPoints(d);
      },
      error: () => this.isLoading.set(false)
    });

    // Forecast EOD
    this.api.getForecastEOD(this.storeId).subscribe({
      next: (d: any) => this.forecastEOD.set(d),
      error: () => {}
    });
  }

  private _buildHourlyPoints(metrics: any) {
    if (!metrics?.hourly_ca?.length) return;

    const hourlyCA: number[] = metrics.hourly_ca;   // array index 0 = 9 AM
    const dailyTarget = this.caTarget();
    const slotTarget  = Math.round(dailyTarget / 12);
    const currentHour = new Date().getHours();

    this.hourlyPoints.set(
      this.hourlyPoints().map((pt, i) => {
        const storeHour = 9 + i;
        return {
          ...pt,
          actual: storeHour < currentHour ? (hourlyCA[i] ?? 0) : null,
          target: slotTarget
        };
      })
    );
  }

  // ── Agent Status helpers ──────────────────────────────
  statusColor(status: string): string {
    const map: Record<string, string> = {
      LIVE:   '#00B894',
      ACTIVE: '#6C5CE7',
      DONE:   '#9CA3AF',
      RUN:    '#F9A825',
      ERROR:  '#E74C3C',
    };
    return map[status] ?? '#9CA3AF';
  }

  trackById(_: number, item: Agent): string { return item.id; }
}