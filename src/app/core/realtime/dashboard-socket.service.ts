import { Injectable } from '@angular/core';
import { BrainRealtimeStore } from '../state/brain-realtime.store';
import { AgentStreamMessage } from '../../shared/models/agent-stream.model';

@Injectable({ providedIn: 'root' })
export class DashboardSocketService {
  private ws?: WebSocket;

  constructor(private store: BrainRealtimeStore) {}

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.ws = new WebSocket('ws://localhost:8000/ws/store/store-lac2');

    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as AgentStreamMessage;
      this.store.applyMessage(msg);
    };

    // optional keep-alive
    this.ws.onopen = () => {
      setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
      }, 15000);
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = undefined;
  }
}