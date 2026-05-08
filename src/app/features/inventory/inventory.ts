/**
 * InventoryComponent — WITH REAL-TIME FIXES
 */

import {
  Component, computed, signal, OnInit, effect,
  inject, OnDestroy, DestroyRef, afterNextRender, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { InventoryItem, InventoryAlert } from '../../core/models/inventory';
import { MockDataService } from '../../core/services/mock-data';
import { InventoryApiService, InventoryApiItem } from '../../core/services/inventory-api.service';
import { WebSocketService } from '../../core/services/websocket.service';

type FilterRisk = 'all' | 'critical' | 'high' | 'medium' | 'ok';
type SortKey    = 'risk' | 'stock' | 'coverage' | 'name';
type Decision   = 'approved' | 'rejected' | null;

const AGENT_ANALYSIS_FIELDS: (keyof InventoryApiItem)[] = [
  'riskLevel', 'riskScore', 'stock', 'stockMin', 'stockMax',
  'demandForecast24h', 'coverageRatio', 'trend', 'confidence', 'lastUpdated',
  'daysOfStock', 'leadTimeDays', 'overstockFlag', 'riskRationale',
  'reorderPoint', 'safetyStock', 'safetyStockCostDt', 'eoq',
  'formulaOrderQty', 'totalReplenishmentCost', 'holdingCostPerCycleDt',
  'effectiveServiceLevel', 'zScore', 'moqIsBinding', 'moqBindingNote',
  'highCostFlag', 'highHoldingFlag', 'analystNote', 'unitCost', 'moq',
];

@Component({
  selector:    'app-inventory',
  standalone:  true,
  imports:     [CommonModule, HttpClientModule],
  templateUrl: './inventory.html',
  styleUrl:    './inventory.scss',
})
export class InventoryComponent implements OnInit, OnDestroy {

  private ws         = inject(WebSocketService);
  private mock       = inject(MockDataService);
  private invApi     = inject(InventoryApiService);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  items  = signal<InventoryItem[]>([]);
  alerts = signal<InventoryAlert[]>([]);

  agentLoading = signal(false);
  agentError   = signal<string | null>(null);

  wsConnected = computed(() => this.ws.connected());
  lastUpdate  = signal<Date | null>(null);

  filterRisk = signal<FilterRisk>('all');
  sortKey    = signal<SortKey>('risk');
  flippedId  = signal<string | null>(null);
  decisions  = signal<Record<string, Decision>>({});

  private lastPayloadHash = '';

  // ── KPIs ──────────────────────────────────────────────────────────────────
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

  // ── Quadrant ──────────────────────────────────────────────────────────────
  quadrantStockMax = computed(() => {
    const vals = this.items().map(p => p.stock >= 999 ? 0 : p.stock);
    return Math.max(...vals, 1) * 1.1;
  });

  quadrantDemandMax = computed(() => {
    const vals = this.items().map(p => p.demandForecast24h);
    return Math.max(...vals, 1) * 1.1;
  });

  quadrantX(p: InventoryItem): number {
    const stock = p.stock >= 999 ? this.quadrantStockMax() : p.stock;
    return Math.min(Math.round((stock / this.quadrantStockMax()) * 90) + 2, 92);
  }

  quadrantY(p: InventoryItem): number {
    return Math.min(Math.round((p.demandForecast24h / this.quadrantDemandMax()) * 90) + 2, 92);
  }

  quadrantSize(p: InventoryItem): number { return Math.round(10 + p.riskScore * 18); }

  quadrantZone(p: InventoryItem): 'star' | 'stockout' | 'ok' | 'overstock' {
    const highStock  = this.quadrantX(p) >= 50;
    const highDemand = this.quadrantY(p) >= 50;
    if  (highStock && highDemand)  return 'star';
    if (!highStock && highDemand)  return 'stockout';
    if (!highStock && !highDemand) return 'ok';
    return 'overstock';
  }

  quadrantCounts = computed(() => {
    const counts = { star: 0, stockout: 0, ok: 0, overstock: 0 };
    for (const p of this.items()) counts[this.quadrantZone(p)]++;
    return counts;
  });

  displayItems = computed(() => {
    let list = [...this.items()];
    const f  = this.filterRisk();
    if (f !== 'all') list = list.filter(i => i.riskLevel === f);

    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, ok: 3 };
    switch (this.sortKey()) {
      case 'risk':     list.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]); break;
      case 'stock':    list.sort((a, b) => a.stock - b.stock); break;
      case 'coverage': list.sort((a, b) => a.coverageRatio - b.coverageRatio); break;
      case 'name':     list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  });

  filterCounts = computed(() => {
    const items = this.items();
    return {
      all:      items.length,
      critical: items.filter(i => i.riskLevel === 'critical').length,
      high:     items.filter(i => i.riskLevel === 'high').length,
      ok:       items.filter(i => i.riskLevel === 'ok').length,
    };
  });

  // ── Constructor ───────────────────────────────────────────────────────────
  constructor() {
    afterNextRender(() => {
      this.ws.connectInventory('STORE-001', 'balanced');
    });

    effect(() => {
      const payload = this.ws.liveInventory();

      if (!payload || payload.type !== 'inventory_update') return;

      if (!payload.items?.length) return;

      const hash = JSON.stringify(
        payload.items.map((i: InventoryApiItem) => i.sku + i.stock + i.riskLevel)
      );
      if (hash === this.lastPayloadHash) return;
      this.lastPayloadHash = hash;

      this._applyAgentPayload(payload);
      this.lastUpdate.set(new Date());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.items.set(this.mock.getInventoryItems());
    this.alerts.set(this.mock.getInventoryAlerts());

    if (isPlatformBrowser(this.platformId)) {
      this.loadAgentOverlay();
    }
  }

  ngOnDestroy(): void {
    this.ws.disconnect();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _applyAgentPayload(payload: { items: InventoryApiItem[], alerts: InventoryAlert[] }): void {

    // ── Capture stock BEFORE update so the diff log is accurate ──────────
    // If we read this.items() AFTER the update, we'd compare new vs new → always zero diff.
    const oldStock = new Map<string, number>(
      this.items().map(i => [i.sku, i.stock])
    );

    this.items.update(list =>
      list.map(mockItem => {
        const agentItem = payload.items.find(a => a.sku === mockItem.sku);
        if (!agentItem) return mockItem;

        const patch: Partial<InventoryItem> = {};

        // ── Copy all known agent fields directly ─────────────────────────
        for (const field of AGENT_ANALYSIS_FIELDS) {
          if (agentItem[field] !== undefined && agentItem[field] !== null) {
            (patch as Record<string, unknown>)[field] = agentItem[field];
          }
        }

        // ── FIX 1: Normalize riskLevel — backend sends lowercase already ─
        // InventoryItem only accepts 'critical' | 'high' | 'ok'
        if (agentItem.riskLevel) {
          const raw = (agentItem.riskLevel as string).toLowerCase();
          patch.riskLevel = (
            raw === 'critical' ? 'critical' :
            raw === 'high'     ? 'high'     :
            raw === 'medium'   ? 'high'     : // medium maps to high (no medium in UI type)
            'ok'
          ) as 'critical' | 'high' | 'ok';
        }

        // ── FIX 2: Derive coverageRatio from daysOfStock + leadTimeDays ──
        if (agentItem.daysOfStock !== undefined) {
          if (agentItem.leadTimeDays && agentItem.leadTimeDays > 0) {
            patch.coverageRatio = Math.min(agentItem.daysOfStock / agentItem.leadTimeDays, 5);
          } else {
            patch.coverageRatio = Math.min(agentItem.daysOfStock / 7, 5);
          }
        }

        // ── FIX 3: Map analystNote → recommendationDetail ────────────────
        if (agentItem.analystNote) {
          patch.recommendationDetail = agentItem.analystNote;
        }

        // ── FIX 4: Map formulaOrderQty → recommendation string ───────────
        if (agentItem.formulaOrderQty != null) {
          patch.recommendation = `Order ${agentItem.formulaOrderQty} units`;
        }

        return { ...mockItem, ...patch };
      })
    );

    this.alerts.set(payload.alerts as InventoryAlert[]);
    this.agentLoading.set(false);

    // ── Log what actually changed (compare payload vs pre-update snapshot) 
    const decreased = payload.items
      .filter(i => {
        const prev = oldStock.get(i.sku);
        return prev !== undefined && i.stock < prev;
      })
      .map(i => `${i.sku}: ${oldStock.get(i.sku)} → ${i.stock}`);

    if (decreased.length) {
      console.log('[Inventory] Stock sold:', decreased.join(' | '));
    }
  }

  private loadAgentOverlay(storeId = 'STORE-001', objective = 'balanced'): void {
    this.agentLoading.set(true);
    this.agentError.set(null);

    this.invApi.getStore(storeId, objective).subscribe({
      next: payload => {
        this._applyAgentPayload(payload);
      },
      error: err => {
        console.warn('[Inventory] Agent unavailable:', err);
        this.agentError.set('Agent offline — showing demo data');
        this.agentLoading.set(false);
      },
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  toggleFlip(id: string): void { this.flippedId.update(cur => cur === id ? null : id); }
  isFlipped(id: string): boolean { return this.flippedId() === id; }
  setFilter(f: string): void { this.filterRisk.set(f as FilterRisk); }
  setSort(s: string): void   { this.sortKey.set(s as SortKey); }

  getFilterCount(key: string): number {
    return (this.filterCounts() as Record<string, number>)[key] ?? 0;
  }

  getDecision(id: string): Decision { return this.decisions()[id] ?? null; }

  approveAlert(id: string, e: Event): void {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: 'approved' }));
  }

  rejectAlert(id: string, e: Event): void {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: 'rejected' }));
  }

  undoDecision(id: string, e: Event): void {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: null }));
  }

  dismissAlert(id: string): void {
    this.alerts.update(list => list.filter(a => a.id !== id));
  }

  riskColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#E74C3C', high: '#F9A825', medium: '#2D9CDB', ok: '#00B894', low: '#9CA3AF',
    };
    return m[r] ?? '#9CA3AF';
  }

  riskBg(r: string): string {
    const m: Record<string, string> = {
      critical: '#FDEDEC', high: '#FFF8E1', medium: '#E8F4FD', ok: '#E0FAF4', low: '#F2F4F8',
    };
    return m[r] ?? '#F2F4F8';
  }

  riskLabel(r: string): string {
    const m: Record<string, string> = {
      critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', ok: 'OK', low: 'LOW',
    };
    return m[r] ?? 'N/A';
  }

  riskBackColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#C0392B', high: '#B45309', medium: '#1A6FA8', ok: '#007A63', low: '#6B7280',
    };
    return m[r] ?? '#6B7280';
  }

  coverageWidth(ratio: number): number { return Math.min(Math.round((ratio / 3) * 100), 100); }

  coverageColor(ratio: number): string {
    if (ratio < 0.5) return '#E74C3C';
    if (ratio < 1.0) return '#F9A825';
    return '#00B894';
  }

  trendIcon(t: string): string {
    if (t === 'up') return '↑'; if (t === 'down') return '↓'; return '→';
  }

  trendColor(t: string): string {
    if (t === 'up') return '#00B894'; if (t === 'down') return '#E74C3C'; return '#9CA3AF';
  }

  alertColor(u: string): string {
    return u === 'critical' ? '#E74C3C' : u === 'high' ? '#F9A825' : '#2D9CDB';
  }

  alertBg(u: string): string {
    return u === 'critical' ? '#FDEDEC' : u === 'high' ? '#FFF8E1' : '#E8F4FD';
  }

  alertIcon(type: string): string {
    if (type === 'rupture') return 'S'; if (type === 'redistribution') return 'T'; return 'O';
  }

  alertTypeLabel(type: string): string {
    if (type === 'rupture') return 'Stockout';
    if (type === 'redistribution') return 'Transfer';
    return 'Overstock';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}