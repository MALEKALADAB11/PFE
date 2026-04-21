import { Injectable, signal, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  liveMetrics  = signal<any>(null);
  liveAdvisors = signal<any[]>([]);
  liveCoach    = signal<any>(null);
  connected    = signal(false);

  private storeWs:       WebSocket | null = null;
  private advisorWs:     WebSocket | null = null;
  private storeId        = '';
  private advisorId      = '';
  private reconnectTimer: any = null;
  private isBrowser      = false;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  connectStore(storeId: string) {
    // Ne pas connecter si pas dans le navigateur
    if (!this.isBrowser) return;

    // Éviter double connexion
    if (this.storeWs &&
        this.storeWs.readyState === WebSocket.OPEN) return;

    this.storeId = storeId;

    try {
      this.storeWs = new WebSocket(
        `ws://localhost:8000/ws/store/${storeId}`
      );

      this.storeWs.onopen = () => {
        this.connected.set(true);
        console.log('WS store connected');
        // Annuler le timer de reconnexion si actif
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.storeWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'metrics_update') {
            this.liveMetrics.set({
              ca_today:   data.ca_today,
              ca_target:  data.ca_target,
              attainment: data.attainment,
              visitors_h: data.visitors_h,
              niveau_urgence:   data.niveau_urgence,   // "HIGH" | "MEDIUM" | "LOW"
              ecart_objectif:   data.ecart_objectif,   // 52.7
              forecast_eod:     data.forecast_eod,     // 6348
              forecast_ci_low:  data.forecast_ci_low,
              forecast_mape:    data.forecast_mape,
              last_cycle_id:    data.last_cycle_id
            });
            if (data.advisors?.length) {
              this.liveAdvisors.set(data.advisors);
            }
          }
        } catch (e) {
          console.warn('WS parse error', e);
        }
      };

      this.storeWs.onerror = () => {
        this.connected.set(false);
      };

      this.storeWs.onclose = () => {
        this.connected.set(false);
        // Reconnexion avec délai exponentiel max 30s
        this.reconnectTimer = setTimeout(
          () => this.connectStore(this.storeId),
          5000
        );
      };

    } catch (e) {
      console.warn('WS connection failed', e);
    }
  }

  connectAdvisor(advisorId: string) {
    if (!this.isBrowser) return;

    // Éviter double connexion au même advisor
    if (this.advisorId === advisorId &&
        this.advisorWs?.readyState === WebSocket.OPEN) return;

    this.advisorId = advisorId;

    if (this.advisorWs) {
      this.advisorWs.close();
      this.advisorWs = null;
    }

    try {
      this.advisorWs = new WebSocket(
        `ws://localhost:8000/ws/advisor/${advisorId}`
      );

      this.advisorWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'coach_update') {
            this.liveCoach.set(data);
          }
        } catch (e) {}
      };

      this.advisorWs.onclose = () => {
        setTimeout(() => this.connectAdvisor(this.advisorId), 8000);
      };

    } catch (e) {
      console.warn('WS advisor failed', e);
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.storeWs?.close();
    this.advisorWs?.close();
    this.storeWs   = null;
    this.advisorWs = null;
    this.connected.set(false);
  }
}