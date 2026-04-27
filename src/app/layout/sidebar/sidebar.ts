import { Component, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Agent } from '../../core/models/agent';
import { StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';
import { ApiService } from '../../core/services/api';
import { WebSocketService } from '../../core/services/websocket.service';

@Component({
  selector:    'app-sidebar',
  standalone:  true,
  imports:     [CommonModule, RouterLink],
  templateUrl: './sidebar.html',
  styleUrl:    './sidebar.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {

  storeId = 'store-lac2';

  isCollapsed = signal(false);
  store       = signal<StoreMetrics>({} as StoreMetrics);
  agents      = signal<Agent[]>([]);
  liveMetrics = signal<any>(null);
  forecastEOD = signal<any>(null);
  isLoading   = signal(true);

  private _refreshInterval?: ReturnType<typeof setInterval>;

  // ── KPIs depuis WS ────────────────────────────────────
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
    ?? 18000
  );

  caPercent = computed(() => {
    const target = this.caTarget();
    if (!target) return 0;
    return Math.min(Math.round((this.caToday() / target) * 100), 100);
  });

  visitorsH = computed(() =>
    this.ws.liveMetrics()?.visitors_h
    ?? this.store()?.traficBoutique
    ?? 0
  );

  traficPercent = computed(() => {
    const capacity = this.store()?.traficCapacity ?? 100;
    const visitors = this.visitorsH();
    return Math.min(Math.round((visitors / capacity) * 100), 100);
  });

  forecastEodValue = computed(() =>
    this.ws.liveMetrics()?.forecast_eod
    ?? this.forecastEOD()?.eod
    ?? null
  );

  forecastGapPct = computed(() =>
    this.ws.gapPct()
    ?? this.ws.liveMetrics()?.ecart_objectif
    ?? this.forecastEOD()?.gap_pct
    ?? null
  );

  niveauUrgence = computed(() => this.ws.urgencyLevel() ?? 'LOW');

  revenueTrend = computed(() => {
    const live = this.ws.liveMetrics();
    if (!live?.ca_yesterday_same_hour) return null;
    return Math.round(
      ((this.caToday() - live.ca_yesterday_same_hour)
        / live.ca_yesterday_same_hour) * 100
    );
  });

  storeContext = computed(() => {
    const wsCtx = this.ws.liveMetrics()?.store_context;
    if (wsCtx) return wsCtx;
    return this.store()?.context ?? {};
  });

  weatherInfo = computed(() =>
    this.storeContext()?.weather
    ?? this.store()?.context?.weather ?? ''
  );

  eventInfo = computed(() =>
    this.storeContext()?.event
    ?? this.store()?.context?.event ?? ''
  );

  stockAlert = computed(() =>
    this.storeContext()?.stock_alert
    ?? this.storeContext()?.stockAlert
    ?? this.store()?.context?.stockAlert
    ?? ''
  );

  progressColor = computed(() => {
    const p = this.caPercent();
    return p >= 80 ? '#00B894' : p >= 60 ? '#F9A825' : '#E74C3C';
  });

  urgenceColor = computed(() => {
    const u = this.niveauUrgence();
    return u === 'HIGH' ? '#E74C3C' : u === 'MEDIUM' ? '#F9A825' : '#00B894';
  });

  urgenceBg = computed(() => {
    const u = this.niveauUrgence();
    return u === 'HIGH' ? '#FDEDEC' : u === 'MEDIUM' ? '#FFF8E1' : '#E0FAF4';
  });

  showAgentStatus = computed(() => this.router.url === '/monitoring');

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
    this.loadData();
    // ── La sidebar ne gère PAS la connexion WS ────────────
    // Le dashboard est le seul responsable de connectStore()
    this._refreshInterval = setInterval(() => this.loadData(), 60_000);
  }

  ngOnDestroy() {
    if (this._refreshInterval) clearInterval(this._refreshInterval);
    // ── Ne pas déconnecter le WS ici ─────────────────────
  }

  toggle() { this.isCollapsed.update(v => !v); }

  private loadData() {
    this.api.getStoreMetrics(this.storeId).subscribe({
      next:  (d: any) => {
        this.liveMetrics.set(d);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
    this.api.getForecastEOD(this.storeId).subscribe({
      next:  (d: any) => this.forecastEOD.set(d),
      error: () => {}
    });
  }

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