import { Component, computed, inject } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { BrainRealtimeStore } from '../../core/state/brain-realtime.store';
import { DashboardSocketService } from '../../core/realtime/dashboard-socket.service';

@Component({
  selector: 'app-agent-timeline',
  standalone: true,
  imports: [CommonModule, JsonPipe],
  template: `
    <section style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
      <button (click)="connect()">Connect WS</button>
      <button (click)="sendTest()">Trigger test event</button>
      <button (click)="reset()">Reset</button>
    </section>

    <h3>Timeline (agent → patch)</h3>
    <div *ngFor="let item of timeline(); trackBy: trackByTs"
         style="border:1px solid #ddd; padding:8px; margin-bottom:8px;">
      <div><b>run:</b> {{ item.runId }}</div>
      <div><b>agent:</b> {{ item.agent }}</div>
      <div><b>patch:</b> <pre>{{ item.patch | json }}</pre></div>
    </div>

    <h3>Current state (snapshot)</h3>
    <pre style="border:1px solid #ddd; padding:8px;">{{ state() | json }}</pre>
  `,
})
export class AgentTimelineComponent {
  private store = inject(BrainRealtimeStore);
  private socket = inject(DashboardSocketService);

  timeline = computed(() => this.store.timeline());
  state = computed(() => this.store.state());

  connect() {
    this.socket.connect();
  }

  reset() {
    this.store.reset();
  }

  trackByTs = (_: number, x: { ts: number }) => x.ts;

  async sendTest() {
    await fetch('http://localhost:8000/dev/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
    });
  }
}