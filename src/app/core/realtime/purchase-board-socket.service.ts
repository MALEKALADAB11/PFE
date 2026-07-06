import { Injectable } from '@angular/core';
import { PurchaseBoardStore, PoStatusChangedMessage } from '../state/purchase-board.store';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PurchaseBoardSocketService {
  private ws?: WebSocket;
  private pingInterval?: ReturnType<typeof setInterval>;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private storeId?: string;
  private manuallyClosed = false;

  constructor(private store: PurchaseBoardStore) {}

  connect(storeId: string) {
    this.manuallyClosed = false;
    this.storeId = storeId;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(`${environment.wsUrl}/api/supply/ws/${storeId}`);

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as PoStatusChangedMessage;
        this.store.applyMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onopen = () => {
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
      }, 15000);
    };

    // A board session is expected to stay open for a whole work session —
    // reconnect automatically unless disconnect() was called explicitly.
    this.ws.onclose = () => {
      clearInterval(this.pingInterval);
      if (!this.manuallyClosed && this.storeId) {
        this.reconnectTimeout = setTimeout(() => this.connect(this.storeId!), 15000);
      }
    };
  }

  disconnect() {
    this.manuallyClosed = true;
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = undefined;
  }
}
