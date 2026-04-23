import { isPlatformBrowser } from "@angular/common";
import { Injectable, signal, inject } from "@angular/core";
import { PLATFORM_ID } from "@angular/core";

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  liveMetrics = signal<any>(null);
  liveAdvisors = signal<any[]>([]);
  liveCoach = signal<any>(null);
  connected = signal(false);

  private storeWs: WebSocket | null = null;
  private advisorWs: WebSocket | null = null;
  private storeId = '';
  private advisorId = '';
  private reconnectTimer: any = null;
  private isBrowser = false;

  constructor() {
    const platformId = inject(PLATFORM_ID);
    this.isBrowser = isPlatformBrowser(platformId);
  }

  connectStore(storeId: string) {
    if (!this.isBrowser) return;

    if (this.storeWs && this.storeWs.readyState === WebSocket.OPEN) return;

    this.storeId = storeId;

    try {
      this.storeWs = new WebSocket(`ws://localhost:8000/ws/store/${storeId}`);

      this.storeWs.onopen = () => {
        this.connected.set(true);
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
              ca_today: data.ca_today,
              ca_target: data.ca_target,
              attainment: data.attainment,
              visitors_h: data.visitors_h,
              agents_live: data.agents_live,
              store_context: data.store_context ?? {},

              niveau_urgence: data.niveau_urgence,
              ecart_objectif: data.ecart_objectif,
              forecast_eod: data.forecast_eod,
              forecast_ci_low: data.forecast_ci_low,
              forecast_ci_high: data.forecast_ci_high,
              forecast_mape: data.forecast_mape,
              last_cycle_id: data.last_cycle_id,

              risk_hours: data.risk_hours ?? [],
              context_signals: data.context_signals ?? [],
              advisor_priorities: data.advisor_priorities ?? [],
              product_opportunities: data.product_opportunities ?? [],
              recommended_focus: data.recommended_focus ?? '',
              coach_opening_message: data.coach_opening_message ?? '',
              hourly_performance: data.hourly_performance ?? [],
              timestamp: data.timestamp
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

    if (
      this.advisorId === advisorId &&
      this.advisorWs?.readyState === WebSocket.OPEN
    ) {
      return;
    }

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
        } catch (e) {
          console.warn('WS advisor parse error', e);
        }
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
    this.storeWs = null;
    this.advisorWs = null;
    this.connected.set(false);
  }
}