import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConversationStorageService {

  private todayKey(): string {
    return `coach_sessions_${new Date().toISOString().slice(0, 10)}`;
  }

  save(conversations: any[]): void {
    try {
      const toStore = conversations.map(c => ({
        ...c,
        messages: (c.messages as any[]).slice(-40),
      }));
      localStorage.setItem(this.todayKey(), JSON.stringify(toStore));
    } catch {
      // quota exceeded — silently ignore
    }
  }

  load(): any[] {
    try {
      const raw = localStorage.getItem(this.todayKey());
      return raw ? (JSON.parse(raw) as any[]) : [];
    } catch {
      return [];
    }
  }

  /** Remove entries older than 7 days to avoid localStorage bloat. */
  cleanup(): void {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith('coach_sessions_')) continue;
      const dateStr = key.replace('coach_sessions_', '');
      if (new Date(dateStr).getTime() < cutoff) localStorage.removeItem(key);
    }
  }
}
