import { Injectable, signal, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class WebSocketService {

  liveMetrics   = signal<any>(null);
  liveAdvisors  = signal<any[]>([]);
  liveCoach     = signal<any>(null);
  liveInventory = signal<any>(null);
  connected     = signal(false);

  private storeWs:       WebSocket | null = null;
  private advisorWs:     WebSocket | null = null;
  private inventoryWs:   WebSocket | null = null;
  private storeId        = '';
  private advisorId      = '';
  private inventoryStore = '';
  private inventoryObjective = 'balanced'; // FIX 1: store objective for reconnects
  private reconnectTimer:          any = null;
  private inventoryReconnectTimer: any = null; // FIX 2: separate timer for inventory
  private isBrowser = false;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
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
        console.log('[WS] Store connected');
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
              ca_today:        data.ca_today,
              ca_target:       data.ca_target,
              attainment:      data.attainment,
              visitors_h:      data.visitors_h,
              niveau_urgence:  data.niveau_urgence,
              ecart_objectif:  data.ecart_objectif,
              forecast_eod:    data.forecast_eod,
              forecast_ci_low: data.forecast_ci_low,
              forecast_mape:   data.forecast_mape,
              last_cycle_id:   data.last_cycle_id,
            });
            if (data.advisors?.length) {
              this.liveAdvisors.set(data.advisors);
            }
          }
        } catch (e) {
          console.warn('[WS] Parse error', e);
        }
      };

      this.storeWs.onerror = () => { this.connected.set(false); };

      this.storeWs.onclose = () => {
        this.connected.set(false);
        this.reconnectTimer = setTimeout(() => this.connectStore(this.storeId), 5000);
      };

    } catch (e) {
      console.warn('[WS] Connection failed', e);
    }
  }

  connectAdvisor(advisorId: string) {
    if (!this.isBrowser) return;
    if (this.advisorId === advisorId && this.advisorWs?.readyState === WebSocket.OPEN) return;

    this.advisorId = advisorId;

    if (this.advisorWs) {
      this.advisorWs.close();
      this.advisorWs = null;
    }

    try {
      this.advisorWs = new WebSocket(`ws://localhost:8000/ws/advisor/${advisorId}`);

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
      console.warn('[WS] Advisor failed', e);
    }
  }

  connectInventory(storeId: string, objective = 'balanced') {
    if (!this.isBrowser) return;

    // FIX 3: Clear any pending reconnect before opening a new connection
    if (this.inventoryReconnectTimer) {
      clearTimeout(this.inventoryReconnectTimer);
      this.inventoryReconnectTimer = null;
    }

    if (this.inventoryWs) {
      console.log('[WS] Closing existing inventory WebSocket');
      // Null out first so the onclose handler does NOT schedule a reconnect
      const old = this.inventoryWs;
      this.inventoryWs = null;
      old.close();
    }

    // FIX 1: Persist objective so reconnects use the same value
    this.inventoryStore     = storeId;
    this.inventoryObjective = objective;

    try {
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
          console.log('[WS] 📦 Received message type:', data.type);

          if (data.type === 'heartbeat') {
            console.log('[WS] 💓 Heartbeat received');
            return;
          }

          if (data.type === 'inventory_update') {
            console.log('[WS] 📊 Inventory update received, items:', data.items?.length);
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
        console.log('[WS] 🔌 Inventory WebSocket closed, code:', event.code, 'reason:', event.reason);

        // FIX 3: Only reconnect if this is still the active socket (not one we intentionally replaced)
        if (this.inventoryWs !== ws && this.inventoryWs !== null) {
          console.log('[WS] Stale socket closed, skipping reconnect');
          return;
        }

        // FIX 2: Use dedicated timer so disconnect() can cancel it
        this.inventoryReconnectTimer = setTimeout(
          () => this.connectInventory(this.inventoryStore, this.inventoryObjective),
          5000,
        );
      };

    } catch (e) {
      console.error('[WS] Inventory connection failed:', e);
    }
  }

  disconnect() {
    // FIX 2: Cancel both reconnect timers on explicit disconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.inventoryReconnectTimer) {
      clearTimeout(this.inventoryReconnectTimer);
      this.inventoryReconnectTimer = null;
    }

    this.storeWs?.close();
    this.advisorWs?.close();

    // Null before close so onclose does not schedule a reconnect
    const inv = this.inventoryWs;
    this.inventoryWs = null;
    inv?.close();

    this.storeWs   = null;
    this.advisorWs = null;
    this.connected.set(false);
  }
}