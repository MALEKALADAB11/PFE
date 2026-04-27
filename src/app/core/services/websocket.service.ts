import { isPlatformBrowser } from "@angular/common";
import { Injectable, signal, inject } from "@angular/core";
import { PLATFORM_ID } from "@angular/core";

export interface AnalystNodes {
  receive_pos:    { status: string; transactions?: number };
  compute_gap:    { status: string; gap_pct?: number; gap_amount?: number };
  call_timesfm:   { status: string; forecast_eod?: number };
  detect_urgency: { status: string; level?: string; score?: number };
  llm_summary:    { status: string; summary?: string };
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  liveMetrics  = signal<any>(null);
  liveAdvisors = signal<any[]>([]);
  liveCoach    = signal<any>(null);
  connected    = signal(false);

  analystNodes   = signal<AnalystNodes | null>(null);
  urgencyLevel   = signal<'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  urgencyScore   = signal<number>(0);
  gapPct         = signal<number>(0);
  gapAmount      = signal<number>(0);
  analystSummary = signal<string>('');
  forecastEod    = signal<number>(0);
  lastUpdated    = signal<string>('');

  private storeWs:        WebSocket | null = null;
  private advisorWs:      WebSocket | null = null;
  private storeId         = '';
  private advisorId       = '';
  private reconnectTimer: any = null;
  private isBrowser       = false;
  private _isConnecting   = false;

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser   = isPlatformBrowser(platformId);
  }

  connectStore(storeId: string) {
    if (!this.isBrowser) return;

    // ── Déjà connecté au même store → skip ───────────────
    if (this.storeWs &&
       (this.storeWs.readyState === WebSocket.OPEN ||
        this.storeWs.readyState === WebSocket.CONNECTING) &&
        this.storeId === storeId) {
      console.log('[WS] Déjà connecté →', storeId, 'skip');
      return;
    }

    // ── Connexion en cours → skip ─────────────────────────
    if (this._isConnecting) {
      console.log('[WS] Connexion en cours, skip');
      return;
    }

    this.storeId = storeId;

    // ── Annuler timer reconnexion ─────────────────────────
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // ── Fermer ancienne connexion proprement ──────────────
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

      // ── Timeout 15s ───────────────────────────────────
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.warn('[WS] Timeout — retry dans 20s');
          ws.onopen    = null;
          ws.onmessage = null;
          ws.onerror   = null;
          ws.onclose   = null;
          ws.close();
          this.storeWs       = null;
          this._isConnecting = false;
          this.connected.set(false);
          this.reconnectTimer = setTimeout(
            () => this._doConnect(storeId), 20000
          );
        }
      }, 15000);

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

        // Bloqué serveur (slot occupé) → attendre 30s
        // Autres → attendre 20s
        const delay = event.code === 1008 ? 30000 : 20000;
        console.log(
          `[WS] Déconnecté (code=${event.code}) → retry dans ${delay/1000}s`
        );
        this.reconnectTimer = setTimeout(
          () => this._doConnect(storeId), delay
        );
      };

    } catch (e) {
      this._isConnecting = false;
      console.warn('[WS] Connexion échouée', e);
      this.connected.set(false);
      this.reconnectTimer = setTimeout(
        () => this._doConnect(storeId), 20000
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
      timestamp:              data.timestamp,
    });

    if (data.advisors?.length) {
      this.liveAdvisors.set(data.advisors);
    }

    this.urgencyLevel.set(data.niveau_urgence   ?? 'LOW');
    this.urgencyScore.set(data.urgency_score    ?? 0);
    this.gapPct.set(data.ecart_objectif         ?? 0);
    this.gapAmount.set(data.gap_amount          ?? 0);
    this.forecastEod.set(data.forecast_eod      ?? 0);
    this.analystSummary.set(data.analyst_summary ?? '');

    if (data.timestamp) {
      try {
        this.lastUpdated.set(
          new Date(data.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit', minute: '2-digit'
          })
        );
      } catch {
        this.lastUpdated.set('--:--');
      }
    }

    if (data.analyst_nodes) {
      this.analystNodes.set(data.analyst_nodes);
    }

    console.log(
      `[WS] ✓ metrics_update | ` +
      `urgence=${data.niveau_urgence} | ` +
      `gap=${data.ecart_objectif}% | ` +
      `CA=${(data.ca_today ?? 0).toLocaleString()} TND`
    );
  }

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
      const ws = new WebSocket(
        `ws://localhost:8000/ws/advisor/${advisorId}`
      );
      this.advisorWs = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'coach_update') this.liveCoach.set(data);
        } catch (e) {
          console.warn('[WS] Advisor parse error', e);
        }
      };

      ws.onclose = () => {
        setTimeout(() => this.connectAdvisor(this.advisorId), 15000);
      };

      ws.onerror = () => {};

    } catch (e) {
      console.warn('[WS] Advisor connexion échouée', e);
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
    this.connected.set(false);
    console.log('[WS] Déconnexion volontaire');
  }
}