import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryItem, InventoryAlert } from '../../core/models/inventory';
import { MockDataService } from '../../core/services/mock-data';


type FilterRisk = 'all' | 'critical' | 'high' | 'medium' | 'ok';
type SortKey    = 'risk' | 'stock' | 'coverage' | 'name';
type Decision   = 'approved' | 'rejected' | null;

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

  // alert decisions map
  decisions = signal<Record<string, Decision>>({});

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

  approvedCount = computed(() =>
    Object.values(this.decisions()).filter(d => d === 'approved').length
  );

  rejectedCount = computed(() =>
    Object.values(this.decisions()).filter(d => d === 'rejected').length
  );

  // ── Quadrant cloud: axis ranges ──
  maxDemand = computed(() => Math.max(...this.items().map(i => i.demandForecast24h), 1));
  maxStock  = computed(() => Math.max(...this.items().filter(i => i.stock < 999).map(i => i.stock), 1));

  /**
   * X position (%) = demand / maxDemand * 85 + 5
   * Maps low demand → left (5%), high demand → right (90%)
   */
  getQuadrantX(item: InventoryItem): number {
    const normalized = item.demandForecast24h / this.maxDemand();
    return Math.round(normalized * 82 + 5);
  }

  /**
   * Y position (%) from bottom = stock / maxStock * 82 + 5
   * Maps low stock → bottom (5%), high stock → top (87%)
   */
  getQuadrantY(item: InventoryItem): number {
    const stock = item.stock >= 999 ? this.maxStock() : item.stock;
    const normalized = stock / this.maxStock();
    return Math.round(normalized * 80 + 5);
  }

  /**
   * Bubble diameter in px based on riskScore (20–52px)
   */
  getBubbleSize(item: InventoryItem): number {
    return Math.round(20 + item.riskScore * 32);
  }

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

  constructor(private data: MockDataService) {
    this.items.set(this.data.getInventoryItems());
    this.alerts.set(this.data.getInventoryAlerts());
  }

  // ── Flip ──
  toggleFlip(id: string) {
    this.flippedId.update(cur => cur === id ? null : id);
  }
  isFlipped(id: string) { return this.flippedId() === id; }

  // ── Filters ──
  setFilter(f: string) { this.filterRisk.set(f as FilterRisk); }
  setSort(s: string)   { this.sortKey.set(s as SortKey); }

  getFilterCount(key: string): number {
    return (this.filterCounts() as Record<string, number>)[key] ?? 0;
  }

  // ── Alert decisions ──
  getDecision(id: string): Decision {
    return this.decisions()[id] ?? null;
  }

  approveAlert(id: string, e: Event) {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: 'approved' }));
  }

  rejectAlert(id: string, e: Event) {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: 'rejected' }));
  }

  undoDecision(id: string, e: Event) {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: null }));
  }

  dismissAlert(id: string) {
    this.alerts.update(list => list.filter(a => a.id !== id));
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
      medium:   'MEDIUM',   ok:   'OK',  low: 'LOW'
    };
    return m[r] ?? 'N/A';
  }

  riskBackColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#C0392B', high: '#B45309',
      medium:   '#1A6FA8', ok:   '#007A63', low: '#6B7280'
    };
    return m[r] ?? '#6B7280';
  }

  // ── Coverage ──
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