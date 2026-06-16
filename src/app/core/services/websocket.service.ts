import { isPlatformBrowser } from '@angular/common';
import { Injectable, signal, computed, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';

// ── Interfaces ─────────────────────────────────

export interface AnalystNodes {
  receive_pos:    { status: string; transactions?: number };
  compute_gap:    { status: string; gap_pct?: number; gap_amount?: number };
  call_timesfm:   { status: string; forecast_eod?: number };
  detect_urgency: { status: string; level?: string; score?: number };
  llm_summary:    { status: string; summary?: string };
}

export interface StrategeAction {
  priorite:       number;
  action:         string;
  produit_cible:  string;
  argument_vente: string;
  impact_estime:  string;
}

export interface ContextSignal {
  type:  string;
  level: string;
  label: string;
  value: number;
}

export interface CoachingCard {
  id:       string;
  advisor:  string;
  initials: string;
  gap:      number;
  urgency:  'HIGH' | 'MEDIUM' | 'LOW';
  context:  string;
  advice:   string;
  action:   string;
  produit:  string;
  status:   'pending' | 'approved' | 'done';
  priority: number;
}

export interface LiveAdvisor {
  id:         string;
  name:       string;
  revenue:    number;
  target:     number;
  attainment: number;
  nb_ventes:  number;
  status:     'Top' | 'OK' | 'Urgent';
  trend:      'up' | 'down';
  rank:       number;
}

// ══════════════════════════════════════════════════════════════════════════════

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  // ── Core ──────────────────────────────────────────────────────────────────
  liveMetrics   = signal<any>(null);
  liveAdvisors  = signal<LiveAdvisor[]>([]);
  liveCoach     = signal<any>(null);
  liveInventory = signal<any>(null);
  connected     = signal(false);

  // Emits true while the backend pipeline is running (inventory_loading received)
  inventoryLoading = signal(false);

  // ── Agent Analyste ─────────────────────────────────────────────────────────
  analystNodes   = signal<AnalystNodes | null>(null);
  urgencyLevel   = signal<'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  urgencyScore   = signal<number>(0);
  gapPct         = signal<number>(0);
  gapAmount      = signal<number>(0);
  analystSummary = signal<string>('');
  forecastEod    = signal<number>(0);
  lastUpdated    = signal<string>('');

  // ── Agent Stratège ─────────────────────────────────────────────────────────
  strategie      = signal<string>('');
  strateActions  = signal<StrategeAction[]>([]);
  causeRacine    = signal<string>('');
  focusProduits  = signal<string[]>([]);
  messageManager = signal<string>('');
  contextSignals = signal<ContextSignal[]>([]);
  contextHeatmap = signal<any>({});

  // ── Météo ──────────────────────────────────────────────────────────────────
  weatherLabel   = signal<string>('');
  weatherIcon    = signal<string>('');
  weatherEffect  = signal<number>(0);
  weatherTemp    = signal<string>('');

  // ── Fériés ─────────────────────────────────────────────────────────────────
  isHolidayToday = signal<boolean>(false);
  nextHoliday    = signal<string>('');

  // ── Agent Coach (NOUVEAU) ─────────────────────────────────────────────────
  coachingCards  = signal<CoachingCard[]>([]);
  ragUsed        = signal<boolean>(false);
  nbRagScripts   = signal<number>(0);

  // ── Computed ───────────────────────────────────────────────────────────────
  urgencyColor = computed(() => {
    const u = this.urgencyLevel();
    return u === 'HIGH' ? '#E74C3C' : u === 'MEDIUM' ? '#F9A825' : '#00B894';
  });

  urgencyBg = computed(() => {
    const u = this.urgencyLevel();
    return u === 'HIGH' ? '#FDEDEC' : u === 'MEDIUM' ? '#FFF8E1' : '#E0FAF4';
  });

  weatherFull = computed(() =>
    `${this.weatherIcon()} ${this.weatherLabel()} ${this.weatherTemp()}`.trim()
  );

  topAdvisor = computed(() => {
    const advisors = this.liveAdvisors();
    return advisors.length > 0 ? advisors[0] : null;
  });

  urgentAdvisors = computed(() =>
    this.liveAdvisors().filter(a => a.status === 'Urgent')
  );

  pendingCards = computed(() =>
    this.coachingCards().filter(c => c.status === 'pending')
  );

  highPriorityCards = computed(() =>
    this.coachingCards().filter(c => c.urgency === 'HIGH')
  );

  // ── Private ────────────────────────────────────────────────────────────────
  private storeWs:                 WebSocket | null = null;
  private advisorWs:               WebSocket | null = null;
  private inventoryWs:             WebSocket | null = null;
  private storeId                  = '';
  private advisorId                = '';
  private inventoryStore           = '';
  private inventoryObjective       = 'balanced';
  private reconnectTimer:          any = null;
  private inventoryReconnectTimer: any = null;
  private isBrowser                = false;
  private _isConnecting            = false;

  // How many real items we've received from the backend.
  // stock_delta patches are only applied AFTER a full snapshot has been received.
  private _inventoryItemCount      = 0;

  private readonly RECONNECT_DELAY_NORMAL = 30000;
  private readonly RECONNECT_DELAY_BLOCK  = 60000;
  private readonly CONNECT_TIMEOUT        = 15000;

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser   = isPlatformBrowser(platformId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Store WebSocket
  // ══════════════════════════════════════════════════════════════════════════

  connectStore(storeId: string) {
    if (!this.isBrowser) return;

    if (
      this.storeWs &&
      (this.storeWs.readyState === WebSocket.OPEN ||
       this.storeWs.readyState === WebSocket.CONNECTING) &&
      this.storeId === storeId
    ) return;

    if (this._isConnecting) {
      console.log('[WS] Connexion en cours, skip');
      return;
    }

    this.storeId = storeId;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.storeWs) {
      this.storeWs.onopen    = null;
      this.storeWs.onmessage = null;
      this.storeWs.onerror   = null;
      this.storeWs.onclose   = null;
      if (this.storeWs.readyState === WebSocket.OPEN ||
          this.storeWs.readyState === WebSocket.CONNECTING) {
        this.storeWs.close(1000, 'new-connection');
      }
      this.storeWs = null;
    }

    this._doConnect(storeId);
  }

  private _doConnect(storeId: string) {
    if (!this.isBrowser || this._isConnecting) return;

    this._isConnecting = true;
    console.log(`[WS] → Connexion ws://localhost:8000/ws/store/${storeId}`);

    try {
      const ws = new WebSocket(`ws://localhost:8000/ws/store/${storeId}`);
      this.storeWs = ws;

      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
          ws.close();
          this.storeWs       = null;
          this._isConnecting = false;
          this.connected.set(false);
          this.reconnectTimer = setTimeout(
            () => this._doConnect(storeId),
            this.RECONNECT_DELAY_NORMAL
          );
        }
      }, this.CONNECT_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timeout);
        this._isConnecting = false;
        this.connected.set(true);
        console.log('[WS] ✓ Connecté →', storeId);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'metrics_update') {
            this._handleMetricsUpdate(data);
          }
        } catch (e) {
          console.warn('[WS] Parse error', e);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        this._isConnecting = false;
        this.connected.set(false);
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        this._isConnecting = false;
        this.connected.set(false);

        if (event.code === 1000) {
          console.log('[WS] Fermeture volontaire');
          return;
        }

        const delay = event.code === 1008
          ? this.RECONNECT_DELAY_BLOCK
          : this.RECONNECT_DELAY_NORMAL;

        console.log(`[WS] Déconnecté (code=${event.code}) → retry dans ${delay/1000}s`);
        this.reconnectTimer = setTimeout(() => this._doConnect(storeId), delay);
      };

    } catch (e) {
      this._isConnecting = false;
      this.connected.set(false);
      this.reconnectTimer = setTimeout(
        () => this._doConnect(storeId),
        this.RECONNECT_DELAY_NORMAL
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Handler principal metrics_update
  // ══════════════════════════════════════════════════════════════════════════

  private _handleMetricsUpdate(data: any) {

    // ── liveMetrics complet ────────────────────────────────────────────────
    this.liveMetrics.set({
      ca_today:               data.ca_today,
      ca_target:              data.ca_target,
      attainment:             data.attainment,
      visitors_h:             data.visitors_h,
      agents_live:            data.agents_live,
      store_context:          data.store_context          ?? {},
      niveau_urgence:         data.niveau_urgence,
      ecart_objectif:         data.ecart_objectif,
      forecast_eod:           data.forecast_eod,
      forecast_ci_low:        data.forecast_ci_low,
      forecast_ci_high:       data.forecast_ci_high,
      forecast_mape:          data.forecast_mape,
      last_cycle_id:          data.last_cycle_id,
      risk_hours:             data.risk_hours             ?? [],
      context_signals:        data.context_signals        ?? [],
      advisor_priorities:     data.advisor_priorities     ?? [],
      product_mix:            data.product_mix            ?? [],
      hourly_performance:     data.hourly_performance     ?? [],
      ca_yesterday_same_hour: data.ca_yesterday_same_hour,
      analyst_summary:        data.analyst_summary        ?? '',
      advisors:               data.advisors               ?? [],
      strategie:              data.strategie              ?? '',
      strategie_actions:      data.strategie_actions      ?? [],
      cause_racine:           data.cause_racine           ?? '',
      focus_produits:         data.focus_produits         ?? [],
      message_manager:        data.message_manager        ?? '',
      coaching_cards:         data.coaching_cards         ?? [],
      context_heatmap:        data.context_heatmap        ?? {},
      // Nouveaux champs Agent Coach + RAG
      rag_used:               data.rag_used               ?? false,
      nb_rag_scripts:         data.nb_rag_scripts         ?? 0,
      timestamp:              data.timestamp,
    });

    // ── Advisors ───────────────────────────────────────────────────────────
    if (data.advisors?.length) {
      this.liveAdvisors.set(data.advisors);
    }

    // ── Coaching Cards (Agent Coach) ───────────────────────────────────────
    if (data.coaching_cards?.length) {
      this.coachingCards.set(data.coaching_cards);
    }

    // ── RAG ───────────────────────────────────────────────────────────────
    this.ragUsed.set(data.rag_used       ?? false);
    this.nbRagScripts.set(data.nb_rag_scripts ?? 0);

    // ── Analyste ───────────────────────────────────────────────────────────
    this.urgencyLevel.set(data.niveau_urgence    ?? 'LOW');
    this.urgencyScore.set(data.urgency_score     ?? 0);
    this.gapPct.set(data.ecart_objectif          ?? 0);
    this.gapAmount.set(data.gap_amount           ?? 0);
    this.forecastEod.set(data.forecast_eod       ?? 0);
    this.analystSummary.set(data.analyst_summary ?? '');

    if (data.timestamp) {
      try {
        this.lastUpdated.set(
          new Date(data.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit', minute: '2-digit',
          })
        );
      } catch { this.lastUpdated.set('--:--'); }
    }

    if (data.analyst_nodes) {
      this.analystNodes.set(data.analyst_nodes);
    }

    // ── Stratège ───────────────────────────────────────────────────────────
    if (data.strategie)                 this.strategie.set(data.strategie);
    if (data.strategie_actions?.length) this.strateActions.set(data.strategie_actions);
    if (data.cause_racine)              this.causeRacine.set(data.cause_racine);
    if (data.focus_produits?.length)    this.focusProduits.set(data.focus_produits);
    if (data.message_manager)           this.messageManager.set(data.message_manager);
    if (data.context_signals?.length)   this.contextSignals.set(data.context_signals);
    if (data.context_heatmap && Object.keys(data.context_heatmap).length) {
      this.contextHeatmap.set(data.context_heatmap);
    }

    // ── Météo ──────────────────────────────────────────────────────────────
    const ctx = data.store_context ?? {};
    if (ctx.weather) {
      const parts = ctx.weather.split(' ');
      this.weatherIcon.set(parts[0]  ?? '');
      this.weatherLabel.set(parts.slice(1).join(' ') ?? '');
    }
    if (ctx.temperature) {
      this.weatherTemp.set(ctx.temperature);
    }

    // ── Fériés ─────────────────────────────────────────────────────────────
    const holidaySignal = (data.context_signals ?? []).find(
      (s: any) => s.type === 'holiday'
    );
    this.isHolidayToday.set(
      (data.context_signals ?? []).some(
        (s: any) => s.type === 'holiday' && s.level === 'high'
      )
    );
    if (holidaySignal) {
      this.nextHoliday.set(holidaySignal.label ?? '');
    }

    console.log(
      `[WS] ✓ metrics_update | ` +
      `urgence=${data.niveau_urgence} | ` +
      `gap=${data.ecart_objectif}% | ` +
      `CA=${(data.ca_today ?? 0).toLocaleString()} TND | ` +
      `RAG=${data.rag_used ? '✓' : '✗'}(${data.nb_rag_scripts ?? 0}) | ` +
      `cards=${data.coaching_cards?.length ?? 0}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Advisor WebSocket
  // ══════════════════════════════════════════════════════════════════════════

  connectAdvisor(advisorId: string) {
    if (!this.isBrowser) return;
    if (this.advisorId === advisorId &&
        this.advisorWs?.readyState === WebSocket.OPEN) return;

    this.advisorId = advisorId;

    if (this.advisorWs) {
      this.advisorWs.onclose = null;
      this.advisorWs.onerror = null;
      this.advisorWs.close();
      this.advisorWs = null;
    }

    try {
      const ws = new WebSocket(`ws://localhost:8000/ws/advisor/${advisorId}`);
      this.advisorWs = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'coach_update') this.liveCoach.set(data);
        } catch { }
      };

      ws.onclose = () => {
        setTimeout(() => this.connectAdvisor(this.advisorId), 30000);
      };
      ws.onerror = () => {};

    } catch { }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Inventory WebSocket
  // ══════════════════════════════════════════════════════════════════════════

  connectInventory(storeId: string, objective = 'balanced') {
    if (!this.isBrowser) return;

    // Only reset snapshot state when switching to a DIFFERENT store.
    // When reconnecting to the same store (tab switch, network blip), we keep
    // liveInventory intact so the UI doesn't blank out while the new WS handshake
    // completes. The backend will either send a warm cache snapshot immediately
    // (patched in-memory by invalidate_store) or inventory_loading if the pipeline
    // is still running — in which case the existing data stays visible.
    if (storeId !== this.inventoryStore) {
      this._inventoryItemCount = 0;
      this.liveInventory.set(null);
    }
    // Note: _inventoryItemCount is NOT reset on same-store reconnect so that
    // incoming stock_delta patches continue to be applied against the existing snapshot.

    if (this.inventoryReconnectTimer) {
      clearTimeout(this.inventoryReconnectTimer);
      this.inventoryReconnectTimer = null;
    }

    if (this.inventoryWs) {
      const old = this.inventoryWs;
      this.inventoryWs = null;
      old.close();
    }

    this.inventoryStore     = storeId;
    this.inventoryObjective = objective;

    try {
      const url = `ws://localhost:8000/api/inventory/ws/${storeId}?business_objective=${objective}`;
      const ws  = new WebSocket(url);
      this.inventoryWs = ws;

      ws.onopen = () => console.log('[WS] ✅ Inventory WS ouvert:', storeId);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // ── heartbeat ────────────────────────────────────────────────────
          if (data.type === 'heartbeat') return;

          // ── pipeline still running — don't touch liveInventory ──────────
          if (data.type === 'inventory_loading') {
            // Only signal loading if we don't already have a usable snapshot.
            // On a tab-switch reconnect the backend may send inventory_loading
            // while the pipeline catches up, but we should keep showing the
            // existing (in-memory patched) data rather than blanking the UI.
            if (!this.liveInventory()) {
              console.log('[WS] ⏳ Backend pipeline running for', storeId, '— HTTP polling will pick it up');
              this.inventoryLoading.set(true);
            } else {
              console.log('[WS] ⏳ Pipeline running for', storeId, '— keeping existing snapshot visible');
            }
            return;
          }

          // ── stock_delta — ONLY apply if we already have a real snapshot ──
          // If _inventoryItemCount is 0 the snapshot hasn't arrived yet.
          // Applying the patch now would set liveInventory with 7 mock items
          // (from current = null fallback) and poison the first-load path.
          if (data.type === 'stock_delta') {
            console.log('[WS] ⚡ stock_delta:', data.sku, '→', data.new_stock, 'units | risk:', data.risk_level);

            const current = this.liveInventory();
            // Guard: only patch if we have a real snapshot (> 7 items)
            if (!current?.items?.length || current.items.length <= 7) {
              console.log('[WS] stock_delta skipped — no real snapshot yet');
              return;
            }

            const patchedItems = current.items.map((item: any) =>
              item.sku === data.sku
                ? {
                    ...item,
                    stock:          data.new_stock,
                    stockInTransit: data.stock_in_transit ?? item.stockInTransit,
                    daysOfStock:    data.days_of_stock,
                    coverageRatio:  data.coverage_ratio,
                    riskLevel:      data.risk_level,
                    riskRationale:  data.risk_rationale ?? item.riskRationale,
                    riskScore: (
                      data.risk_level === 'critical' ? 0.90 :
                      data.risk_level === 'high'     ? 0.72 :
                      data.risk_level === 'medium'   ? 0.45 : 0.10
                    ),
                  }
                : item
            );

            const patchedAlerts = patchedItems
              .filter((i: any) => i.riskLevel === 'critical' || i.riskLevel === 'high')
              .map((i: any) => ({
                id:      `alert-${i.riskLevel}-${i.sku}`,
                type:    'rupture',
                urgency: i.riskLevel,
                title:   `${i.riskLevel === 'critical' ? 'Stockout imminent' : 'Low stock'}: ${i.name}`,
                message: `${i.name} — ${i.stock} units left, ${i.daysOfStock}d coverage`,
                action:  null,
                time:    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              }));

            this.liveInventory.set({
              ...current,
              type:   'inventory_update',
              items:  patchedItems,
              alerts: patchedAlerts,
            });
            return;
          }

          // ── full snapshot ────────────────────────────────────────────────
          if (data.type === 'inventory_update') {
            const count = data.items?.length ?? 0;
            console.log('[WS] 📦 Inventory snapshot:', count, 'items for', storeId);
            this._inventoryItemCount = count;
            this.inventoryLoading.set(false);
            this.liveInventory.set(data);
          }

        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onerror  = () => {};
      ws.onclose  = (event) => {
        if (this.inventoryWs !== ws && this.inventoryWs !== null) return;
        if (this.inventoryWs === null) return;

        this.inventoryReconnectTimer = setTimeout(
          () => this.connectInventory(this.inventoryStore, this.inventoryObjective),
          15000,
        );
      };

    } catch { }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Disconnect
  // ══════════════════════════════════════════════════════════════════════════

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.inventoryReconnectTimer) { clearTimeout(this.inventoryReconnectTimer); this.inventoryReconnectTimer = null; }

    this._isConnecting = false;

    if (this.storeWs) {
      this.storeWs.onopen = this.storeWs.onmessage =
      this.storeWs.onerror = this.storeWs.onclose = null;
      this.storeWs.close(1000, 'disconnect');
      this.storeWs = null;
    }

    if (this.advisorWs) {
      this.advisorWs.onclose = this.advisorWs.onerror = null;
      this.advisorWs.close(1000, 'disconnect');
      this.advisorWs = null;
    }

    const inv = this.inventoryWs;
    this.inventoryWs = null;
    inv?.close(1000, 'disconnect');

    this.connected.set(false);
    this._inventoryItemCount = 0;
    console.log('[WS] Déconnexion volontaire');
  }
}