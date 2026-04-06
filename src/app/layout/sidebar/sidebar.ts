import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Agent } from '../../core/models/agent';
import { StoreMetrics } from '../../core/models/store';
import { MockDataService } from '../../core/services/mock-data';


@Component({
  selector:    'app-sidebar',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl:    './sidebar.scss'
})
export class SidebarComponent {

  isCollapsed = signal(false);
  store       = signal<StoreMetrics>({} as StoreMetrics);
  agents      = signal<Agent[]>([]);

  caPercent = computed(() => {
    const s = this.store();
    if (!s?.caObjectif) return 0;
    return Math.round((s.caJournalier / s.caObjectif) * 100);
  });

  traficPercent = computed(() => {
    const s = this.store();
    if (!s?.traficCapacity) return 0;
    return Math.round((s.traficBoutique / s.traficCapacity) * 100);
  });

  // ── Affiche agent status seulement sur /monitoring ──
  showAgentStatus = computed(() =>
    this.router.url === '/monitoring'
  );

  constructor(
    private data:   MockDataService,
    private router: Router
  ) {
    this.store.set(this.data.getStoreMetrics());
    this.agents.set(this.data.getAgents());
  }

  toggle() { this.isCollapsed.update(v => !v); }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      LIVE:   '#00B894',
      ACTIVE: '#6C5CE7',
      DONE:   '#9CA3AF',
      RUN:    '#F9A825',
      ERROR:  '#E74C3C',
    };
    return map[status] ?? '#9CA3AF';
  }

  trackById(_: number, item: Agent): string { return item.id; }
}