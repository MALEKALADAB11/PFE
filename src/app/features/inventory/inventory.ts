import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryItem, InventoryAlert } from '../../core/models/inventory';
import { MockDataService } from '../../core/services/mock-data';

type FilterRisk    = 'all' | 'critical' | 'high' | 'medium' | 'ok';
type SortKey       = 'risk' | 'stock' | 'coverage' | 'name';
type AlertDecision = 'approved' | 'rejected' | null;

@Component({
  selector:    'app-inventory',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './inventory.html',
  styleUrl:    './inventory.scss'
})
export class InventoryComponent {

  items  = signal<InventoryItem[]>([]);
  alerts = signal<InventoryAlert[]>([]);

  filterRisk = signal<FilterRisk>('all');
  sortKey    = signal<SortKey>('risk');
  flippedId  = signal<string | null>(null);

  // ── Per-alert decision state: Map<alertId, 'approved'|'rejected'|null> ──
  alertDecisions = signal<Record<string, AlertDecision>>({});

  // ── Summary KPIs ──
  totalItems    = computed(() => this.items().length);
  criticalCount = computed(() => this.items().filter(i => i.riskLevel === 'critical').length);
  highCount     = computed(() => this.items().filter(i => i.riskLevel === 'high').length);
  okCount       = computed(() => this.items().filter(i => i.riskLevel === 'ok').length);

  avgCoverage = computed(() => {
    const valid = this.items().filter(i => i.coverageRatio < 5);
    const sum   = valid.reduce((a, b) => a + b.coverageRatio, 0);
    return valid.length ? (sum / valid.length).toFixed(2) : '—';
  });

  // ── Filtered + sorted items ──
  displayItems = computed(() => {
    let list = [...this.items()];
    const f  = this.filterRisk();
    if (f !== 'all') list = list.filter(i => i.riskLevel === f);

    const order: Record<string, number> = {
      critical: 0, high: 1, medium: 2, ok: 3
    };
    switch (this.sortKey()) {
      case 'risk':     list.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]); break;
      case 'stock':    list.sort((a, b) => a.stock - b.stock); break;
      case 'coverage': list.sort((a, b) => a.coverageRatio - b.coverageRatio); break;
      case 'name':     list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  });

  // ── Filter counts ──
  filterCounts = computed(() => {
    const items = this.items();
    return {
      all:      items.length,
      critical: items.filter(i => i.riskLevel === 'critical').length,
      high:     items.filter(i => i.riskLevel === 'high').length,
      ok:       items.filter(i => i.riskLevel === 'ok').length,
    };
  });

  // ── Decision counters for header badge ──
  approvedCount = computed(() =>
    Object.values(this.alertDecisions()).filter(v => v === 'approved').length
  );
  rejectedCount = computed(() =>
    Object.values(this.alertDecisions()).filter(v => v === 'rejected').length
  );

  constructor(private data: MockDataService) {
    this.items.set(this.data.getInventoryItems());
    this.alerts.set(this.data.getInventoryAlerts());
  }

  // ── Flip ──
  toggleFlip(id: string) {
    this.flippedId.update(cur => cur === id ? null : id);
  }
  isFlipped(id: string) { return this.flippedId() === id; }

  // ── Filters / Sort ──
  setFilter(f: string) { this.filterRisk.set(f as FilterRisk); }
  setSort(s: string)   { this.sortKey.set(s as SortKey); }

  getFilterCount(key: string): number {
    return (this.filterCounts() as Record<string, number>)[key] ?? 0;
  }

  // ── Alert decision actions ──
  getDecision(id: string): AlertDecision {
    return this.alertDecisions()[id] ?? null;
  }

  approveAlert(id: string, event: Event) {
    event.stopPropagation();
    this.alertDecisions.update(d => ({ ...d, [id]: 'approved' }));
    // Auto-dismiss after short delay to keep list clean
    setTimeout(() => this.dismissAlert(id), 1800);
  }

  rejectAlert(id: string, event: Event) {
    event.stopPropagation();
    this.alertDecisions.update(d => ({ ...d, [id]: 'rejected' }));
    // Keep rejected visible so manager sees what was declined
  }

  undoDecision(id: string, event: Event) {
    event.stopPropagation();
    this.alertDecisions.update(d => {
      const copy = { ...d };
      delete copy[id];
      return copy;
    });
  }

  dismissAlert(id: string) {
    this.alerts.update(list => list.filter(a => a.id !== id));
    this.alertDecisions.update(d => {
      const copy = { ...d };
      delete copy[id];
      return copy;
    });
  }

  // ── Risk styling ──
  riskColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#E74C3C', high: '#F9A825',
      medium:   '#2D9CDB', ok:   '#00B894', low: '#9CA3AF'
    };
    return m[r] ?? '#9CA3AF';
  }

  riskBg(r: string): string {
    const m: Record<string, string> = {
      critical: '#FDEDEC', high: '#FFF8E1',
      medium:   '#E8F4FD', ok:   '#E0FAF4', low: '#F2F4F8'
    };
    return m[r] ?? '#F2F4F8';
  }

  riskLabel(r: string): string {
    const m: Record<string, string> = {
      critical: 'CRITICAL', high: 'HIGH',
      medium:   'MEDIUM',   ok:   'OK',   low: 'LOW'
    };
    return m[r] ?? 'N/A';
  }

  riskBackColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#C0392B', high:   '#B45309',
      medium:   '#1A6FA8', ok:     '#007A63', low: '#6B7280'
    };
    return m[r] ?? '#6B7280';
  }

  // ── Coverage bar ──
  coverageWidth(ratio: number): number {
    return Math.min(Math.round((ratio / 3) * 100), 100);
  }

  coverageColor(ratio: number): string {
    if (ratio < 0.5) return '#E74C3C';
    if (ratio < 1.0) return '#F9A825';
    return '#00B894';
  }

  // ── Trend ──
  trendIcon(t: string): string {
    if (t === 'up')   return '↑';
    if (t === 'down') return '↓';
    return '→';
  }

  trendColor(t: string): string {
    if (t === 'up')   return '#00B894';
    if (t === 'down') return '#E74C3C';
    return '#9CA3AF';
  }

  // ── Alert styling ──
  alertColor(u: string): string {
    return u === 'critical' ? '#E74C3C' : u === 'high' ? '#F9A825' : '#2D9CDB';
  }

  alertBg(u: string): string {
    return u === 'critical' ? '#FDEDEC' : u === 'high' ? '#FFF8E1' : '#E8F4FD';
  }

  alertIcon(type: string): string {
    if (type === 'rupture')        return 'S';
    if (type === 'redistribution') return 'T';
    return 'O';
  }

  alertTypeLabel(type: string): string {
    if (type === 'rupture')        return 'Stockout';
    if (type === 'redistribution') return 'Transfer';
    return 'Overstock';
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}