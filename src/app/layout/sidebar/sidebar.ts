import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Agent } from '../../core/models/agent';
import { MockDataService } from '../../core/services/mock-data';


@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent {

  isCollapsed = signal(false);
  store = signal({} as any);
  agents = signal<Agent[]>([]);

  caPercent = computed(() =>
    Math.round((this.store().caJournalier / this.store().caObjectif) * 100)
  );

  traficPercent = computed(() =>
    Math.round((this.store().traficBoutique / this.store().traficCapacity) * 100)
  );

  constructor(private data: MockDataService) {
    this.store.set(this.data.getStoreMetrics());
    this.agents.set(this.data.getAgents());
  }

  toggle() {
    this.isCollapsed.update(v => !v);
  }

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

  statusLabel(status: string): string {
    return status;
  }

  trackById(_: number, item: Agent) {
    return item.id;
  }
}