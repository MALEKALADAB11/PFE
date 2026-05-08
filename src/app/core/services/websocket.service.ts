import { isPlatformBrowser } from '@angular/common';
import { Injectable, signal, inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  // ── Core signals ──────────────────────────────────────
  liveMetrics   = signal<any>(null);
  liveAdvisors  = signal<any[]>([]);
  liveCoach     = signal<any>(null);
  liveInventory = signal<any>(null);
  connected     = signal(false);

  // ── Agent Analyste ────────────────────────────────────
  analystNodes   = signal<AnalystNodes | null>(null);
  urgencyLevel   = signal<'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  urgencyScore   = signal<number>(0);
  gapPct         = signal<number>(0);
  gapAmount      = signal<number>(0);
  analystSummary = signal<string>('');
  forecastEod    = signal<number>(0);
  lastUpdated    = signal<string>('');

  // ── Agent Stratège ────────────────────────────────────
  strategie      = signal<string>('');
  strateActions  = signal<StrategeAction[]>([]);
  causeRacine    = signal<string>('');
  focusProduits  = signal<string[]>([]);
  messageManager = signal<string>('');
  contextSignals = signal<ContextSignal[]>([]);
  contextHeatmap = signal<any>({});
  weatherLabel   = signal<string>('');
  weatherIcon    = signal<string>('');
  weatherEffect  = signal<number>(0);
  isHolidayToday = signal<boolean>(false);
  nextHoliday    = signal<string>('');

  // ── Private state ─────────────────────────────────────
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

  // ── Délais de reconnexion (ms) ────────────────────────
  // Le cycle backend prend ~2min → on attend 30s avant retry
  private readonly RECONNECT_DELAY_NORMAL = 30000;
  private readonly RECONNECT_DELAY_BLOCK  = 60000; // code 1008 = double connexion bloquée
  private readonly CONNECT_TIMEOUT        = 15000;

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser   = isPlatformBrowser(platformId);
  }

  // ── Store WebSocket ───────────────────────────────────

  connectStore(storeId: string) {
    if (!this.isBrowser) return;

    // Déjà connecté au même store → skip
    if (
      this.storeWs &&
      (this.storeWs.readyState === WebSocket.OPEN ||
       this.storeWs.readyState === WebSocket.CONNECTING) &&
      this.storeId === storeId
    ) {
      console.log('[WS] Déjà connecté →', storeId, 'skip');
      return;
    }

    // Connexion déjà en cours → skip
    if (this._isConnecting) {
      console.log('[WS] Connexion en cours, skip');
      return;
    }

    this.storeId = storeId;

    // Annuler le timer de reconnexion en cours
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Fermer proprement l'ancien socket
    if (this.storeWs) {
      this.storeWs.onopen    = null;
      this.storeWs.onmessage = null;
      this.storeWs.onerror   = null;
      this.storeWs.onclose   = null;
      if (
        this.storeWs.readyState === WebSocket.OPEN ||
        this.storeWs.readyState === WebSocket.CONNECTING
      ) {
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

      // Timeout si la connexion ne s'ouvre pas
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('[WS] Timeout connexion → retry dans 30s');
          ws.onopen    = null;
          ws.onmessage = null;
          ws.onerror   = null;
          ws.onclose   = null;
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
          // Ignorer les pings
        } catch (e) {
          console.warn('[WS] Parse error', e);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        this._isConnecting = false;
        this.connected.set(false);
        console.warn('[WS] Erreur connexion');
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        this._isConnecting = false;
        this.connected.set(false);

        // Fermeture volontaire → pas de reconnexion
        if (event.code === 1000) {
          console.log('[WS] Fermeture volontaire');
          return;
        }

        // Code 1008 = double connexion bloquée côté backend
        // → attendre plus longtemps avant de réessayer
        const delay = event.code === 1008
          ? this.RECONNECT_DELAY_BLOCK
          : this.RECONNECT_DELAY_NORMAL;

        console.log(
          `[WS] Déconnecté (code=${event.code}) → retry dans ${delay / 1000}s`
        );
        this.reconnectTimer = setTimeout(
          () => this._doConnect(storeId),
          delay
        );
      };

    } catch (e) {
      this._isConnecting = false;
      console.warn('[WS] Connexion échouée', e);
      this.connected.set(false);
      this.reconnectTimer = setTimeout(
        () => this._doConnect(storeId),
        this.RECONNECT_DELAY_NORMAL
      );
    }
  }

  private _handleMetricsUpdate(data: any) {
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
      product_opportunities:  data.product_opportunities  ?? [],
      product_mix:            data.product_mix            ?? [],
      recommended_focus:      data.recommended_focus      ?? '',
      coach_opening_message:  data.coach_opening_message  ?? '',
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
      timestamp:              data.timestamp,
    });

    if (data.advisors?.length) {
      this.liveAdvisors.set(data.advisors);
    }

    // ── Analyste signals ──────────────────────────────────
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
      } catch {
        this.lastUpdated.set('--:--');
      }
    }

    if (data.analyst_nodes) {
      this.analystNodes.set(data.analyst_nodes);
    }

    // ── Stratège signals ──────────────────────────────────
    if (data.strategie)               this.strategie.set(data.strategie);
    if (data.strategie_actions?.length) this.strateActions.set(data.strategie_actions);
    if (data.cause_racine)            this.causeRacine.set(data.cause_racine);
    if (data.focus_produits?.length)  this.focusProduits.set(data.focus_produits);
    if (data.message_manager)         this.messageManager.set(data.message_manager);
    if (data.context_signals?.length) this.contextSignals.set(data.context_signals);
    if (data.context_heatmap && Object.keys(data.context_heatmap).length) {
      this.contextHeatmap.set(data.context_heatmap);
    }

    // ── Météo ─────────────────────────────────────────────
    const ctx = data.store_context ?? {};
    if (ctx.weather) {
      const parts = ctx.weather.split(' ');
      this.weatherIcon.set(parts[0] ?? '');
      this.weatherLabel.set(parts.slice(1).join(' ') ?? '');
    }

    // ── Jours fériés ──────────────────────────────────────
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
      `strategie=${data.strategie ? 'OK' : 'none'}`
    );
  }

  // ── Advisor WebSocket ─────────────────────────────────

  connectAdvisor(advisorId: string) {
    if (!this.isBrowser) return;
    if (this.advisorId === advisorId && this.advisorWs?.readyState === WebSocket.OPEN) return;

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
        } catch (e) {
          console.warn('[WS] Advisor parse error', e);
        }
      };

      // Reconnexion lente pour éviter la surcharge
      ws.onclose = () => {
        setTimeout(() => this.connectAdvisor(this.advisorId), 30000);
      };

      ws.onerror = () => {};

    } catch (e) {
      console.warn('[WS] Advisor connexion échouée', e);
    }
  }

  // ── Inventory WebSocket ───────────────────────────────

  connectInventory(storeId: string, objective = 'balanced') {
    if (!this.isBrowser) return;

    if (this.inventoryReconnectTimer) {
      clearTimeout(this.inventoryReconnectTimer);
      this.inventoryReconnectTimer = null;
    }

    if (this.inventoryWs) {
      console.log('[WS] Closing existing inventory WebSocket');
      const old = this.inventoryWs;
      this.inventoryWs = null;
      old.close();
    }

    this.inventoryStore     = storeId;
    this.inventoryObjective = objective;

    try {
      // const url = `ws://localhost:11434/api/inventory/ws/${storeId}?business_objective=${objective}`;
      const url = `ws://localhost:8000/api/inventory/ws/${storeId}?business_objective=${objective}`;
      console.log('[WS] Connecting to inventory WebSocket:', url);

      const ws = new WebSocket(url);
      this.inventoryWs = ws;

      ws.onopen = () => {
        console.log('[WS] ✅ Inventory WebSocket OPENED for:', storeId);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'heartbeat') return;

          if (data.type === 'inventory_update') {
            console.log('[WS] 📦 Inventory update:', data.items?.length, 'items');
            this.liveInventory.set(data);
          }
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] ❌ Inventory WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('[WS] 🔌 Inventory closed, code:', event.code);

        if (this.inventoryWs !== ws && this.inventoryWs !== null) return;
        if (this.inventoryWs === null) return;

        // Reconnexion lente pour éviter la surcharge
        this.inventoryReconnectTimer = setTimeout(
          () => this.connectInventory(this.inventoryStore, this.inventoryObjective),
          15000,
        );
      };

    } catch (e) {
      console.error('[WS] Inventory connection failed:', e);
    }
  }

  // ── Disconnect ────────────────────────────────────────

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.inventoryReconnectTimer) {
      clearTimeout(this.inventoryReconnectTimer);
      this.inventoryReconnectTimer = null;
    }

    this._isConnecting = false;

    if (this.storeWs) {
      this.storeWs.onopen    = null;
      this.storeWs.onmessage = null;
      this.storeWs.onerror   = null;
      this.storeWs.onclose   = null;
      this.storeWs.close(1000, 'disconnect');
      this.storeWs = null;
    }

    if (this.advisorWs) {
      this.advisorWs.onclose = null;
      this.advisorWs.onerror = null;
      this.advisorWs.close(1000, 'disconnect');
      this.advisorWs = null;
    }

    const inv = this.inventoryWs;
    this.inventoryWs = null;
    inv?.close(1000, 'disconnect');

    this.connected.set(false);
    console.log('[WS] Déconnexion volontaire');
  }
}