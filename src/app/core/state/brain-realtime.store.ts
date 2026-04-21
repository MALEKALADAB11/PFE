import { Injectable, signal, computed } from '@angular/core';
import { AgentStreamMessage } from '../../shared/models/agent-stream.model';

export interface TimelineEntry {
  ts: number;
  runId: string;
  agent: string;
  patch: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class BrainRealtimeStore {
  private readonly _timeline = signal<TimelineEntry[]>([]);
  private readonly _state = signal<Record<string, unknown>>({});

  readonly timeline = computed(() => this._timeline());
  readonly state = computed(() => this._state());

  reset() {
    this._timeline.set([]);
    this._state.set({});
  }

  applyMessage(msg: AgentStreamMessage) {
    if (msg.type === 'agent_patch') {
      this._timeline.update((items) => [
        ...items,
        { ts: Date.now(), runId: msg.run_id, agent: msg.agent, patch: msg.patch },
      ]);

      // merge shallow (ok for MVP)
      this._state.update((s) => ({ ...s, ...msg.patch }));
    }

    if (msg.type === 'run_completed') {
      // keep final snapshot (optional)
      this._state.set(msg.final_state);
    }
  }
}