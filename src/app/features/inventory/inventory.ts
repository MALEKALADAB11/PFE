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

  // True once backend data has replaced mock (any item has a real safetyStock)
  isLiveData = computed(() =>
    this.items().some((i: any) => i.safetyStock > 0 || i.riskRationale)
  );

  filterRisk = signal<FilterRisk>('all');
  sortKey    = signal<SortKey>('risk');
  searchText = signal<string>('');
  flippedId  = signal<string | null>(null);
  decisions  = signal<Record<string, Decision>>({});
  productDecisions = signal<Record<string, Decision>>({});
  analysisModal = signal<InventoryItem | null>(null);

  // SKUs whose stock just changed — cleared after 900ms — drives flash CSS class
  flashedSkus = signal<Set<string>>(new Set());

  private lastPayloadHash = '';
  private _pollingTimer:  any = null;
  private _refreshTimer:  any = null;

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
  //
  // X axis = stock units   (left=low stock,  right=high stock)
  // Y axis = daily demand  (bottom=low demand, top=high demand)
  //
  // Zones (match the 4 CSS bg quadrants exactly):
  //   top-left  (low stock,  high demand) → Stockout risk  ⚠
  //   top-right (high stock, high demand) → Best combo     ★
  //   bot-right (high stock, low demand)  → Overstock risk ↑
  //   bot-left  (low stock,  low demand)  → OK / slow      ✓
  //
  // Scale: p90 cap on each axis so a single outlier (e.g. 468 units of a
  // recharge card) doesn't compress all critical items (3-20 units) into the
  // leftmost 5%. Items above the cap clamp to 92% (still distinct on the right).
  //
  // Reactivity: every stock_delta patches items() signal → computed signals
  // recompute → [style.left.%] and [style.bottom.%] bindings update in DOM.

  quadrantStockMax = computed(() => {
    const vals = this.items()
      .map(p => p.stock >= 999 ? 0 : p.stock)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return 1;
    const idx = Math.min(Math.floor(vals.length * 0.9), vals.length - 1);
    return Math.max(vals[idx], 1) * 1.15;
  });

  quadrantDemandMax = computed(() => {
    const vals = this.items()
      .map(p => p.demandForecast24h)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return 1;
    const idx = Math.min(Math.floor(vals.length * 0.9), vals.length - 1);
    return Math.max(vals[idx], 1) * 1.15;
  });

  quadrantX(p: InventoryItem): number {
    if (p.stock >= 999) return 92;
    const capped = Math.min(p.stock, this.quadrantStockMax());
    return Math.min(Math.round((capped / this.quadrantStockMax()) * 88) + 2, 92);
  }

  quadrantY(p: InventoryItem): number {
    const capped = Math.min(p.demandForecast24h, this.quadrantDemandMax());
    return Math.min(Math.round((capped / this.quadrantDemandMax()) * 88) + 2, 92);
  }

  quadrantSize(p: InventoryItem): number { return Math.round(10 + p.riskScore * 18); }

  // Zone derived from visual position → footer counts always match the chart.
  quadrantZone(p: InventoryItem): 'star' | 'stockout' | 'ok' | 'overstock' {
    if (p.stock >= 999 || (p as any).overstockFlag) return 'overstock';
    const highStock  = this.quadrantX(p) >= 50;  // right half = high stock
    const highDemand = this.quadrantY(p) >= 50;  // top half  = high demand
    if  ( highStock &&  highDemand) return 'star';
    if  (!highStock &&  highDemand) return 'stockout';
    if  ( highStock && !highDemand) return 'overstock';
    return 'ok';
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
    
    // Apply search filter
    const search = this.searchText().toLowerCase().trim();
    if (search) {
      list = list.filter(i => 
        i.name.toLowerCase().includes(search) || 
        i.sku.toLowerCase().includes(search) ||
        i.category.toLowerCase().includes(search)
      );
    }

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

    // ── Effect WS inventory ───────────────────────────────────────────────
    effect(() => {
      const payload = this.ws.liveInventory();

      if (!payload || payload.type !== 'inventory_update') return;

      if (!payload.items?.length) return;

      const hash = JSON.stringify(
        payload.items.map((i: InventoryApiItem) => i.sku + i.stock + i.riskLevel)
      );
      if (hash === this.lastPayloadHash) return;
      this.lastPayloadHash = hash;

      console.log(
        '[Inventory] ✅ WS update —',
        payload.items.length, 'items |',
        new Date().toLocaleTimeString()
      );

      this._applyAgentPayload(payload);
      this.lastUpdate.set(new Date());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Seed mock so page is never blank — backend overlay replaces it.
    // Mock gives instant render; backend gives real data (15-20s first load,
    // instant after cache warms). Both paths call _applyAgentPayload which
    // full-replaces items() with backend data the moment it arrives.
    this.items.set(this.mock.getInventoryItems());
    this.alerts.set(this.mock.getInventoryAlerts());

    if (isPlatformBrowser(this.platformId)) {
      this.loadAgentOverlay();
      // HTTP fallback fires after 25s if WS hasn't delivered real data yet.
      // 25s > pipeline duration (~15-20s) so cache is warm by the time this fires.
      // If WS already delivered data, items() will have real data and we skip.
      setTimeout(() => {
        const hasRealData = this.items().some((i: any) => i.safetyStock > 0 || i.riskRationale);
        if (!hasRealData) {
          console.log('[Inventory] WS slow — falling back to HTTP');
          this.loadAgentOverlay();
        }
      }, 25000);
    }
  }

  ngOnDestroy(): void {
    this.ws.disconnect();
    // Nettoyer les timers
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    // ⚠️ NE PAS appeler ws.disconnect() — le service WS est singleton partagé
    // avec Dashboard et Conseiller — les déconnecter ici couperait tout.
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _applyAgentPayload(payload: { items: InventoryApiItem[], alerts: InventoryAlert[] }): void {

    // ── Capture stock BEFORE update so the diff log is accurate ──────────
    // If we read this.items() AFTER the update, we'd compare new vs new → always zero diff.
  

    if (!payload?.items?.length) return;

    // ── Capture stock BEFORE update for diff logging ──────────────────────
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
    // ── Build a mock fallback map for display fields (name, category, id) ──
    // We full-replace from backend data but fall back to mock for any field
    // the backend doesn't supply (e.g. name when product_master lookup fails).
    const mockMap = new Map<string, InventoryItem>(
      this.items().map(i => [i.sku, i])
    );

    const mapped: InventoryItem[] = payload.items
      .filter(a => !(a as any)['error'])
      .map(agentItem => {
        const fallback = mockMap.get(agentItem.sku);

        // Normalize riskLevel — backend may send 'medium' which has no UI type
        const rawRisk = ((agentItem.riskLevel as string) ?? '').toLowerCase();
        const riskLevel: 'critical' | 'high' | 'ok' = (
          rawRisk === 'critical' ? 'critical' :
          rawRisk === 'high'     ? 'high'     :
          rawRisk === 'medium'   ? 'high'     : // medium → high
          'ok'
        );

        // Derive coverageRatio from daysOfStock / leadTimeDays
        let coverageRatio = agentItem.coverageRatio ?? 0;
        if (!coverageRatio && agentItem.daysOfStock !== undefined) {
          const lt = agentItem.leadTimeDays || 7;
          coverageRatio = Math.min(+(agentItem.daysOfStock / lt).toFixed(2), 5);
        }

        // Spread agentItem first so all APICS fields (safetyStock, formulaOrderQty,
        // analystNote, riskRationale etc.) pass through, then overwrite with
        // normalized values. No duplicate-key issue since spread is first.
        return {
          ...(agentItem as any),
          // Prefer backend name/category; fall back to mock if backend has blanks
          id:                   agentItem.id          ?? fallback?.id       ?? `inv-${agentItem.sku}`,
          name:                 agentItem.name         ?? fallback?.name     ?? agentItem.sku,
          category:             agentItem.category     ?? fallback?.category ?? 'Unknown',
          // Normalized values always win
          riskLevel,
          coverageRatio,
          riskScore: agentItem.riskScore ?? (
            riskLevel === 'critical' ? 0.90 :
            riskLevel === 'high'     ? 0.72 : 0.10
          ),
          trend:       agentItem.trend      ?? fallback?.trend      ?? 'stable',
          confidence:  agentItem.confidence ?? fallback?.confidence ?? 0.85,
          // Map analystNote → recommendationDetail for flip card back
          recommendationDetail: agentItem.recommendationDetail
                                ?? agentItem.analystNote
                                ?? fallback?.recommendationDetail
                                ?? null,
          // Map formulaOrderQty → recommendation display string
          recommendation: agentItem.recommendation
                          ?? (agentItem.formulaOrderQty
                              ? `Order ${agentItem.formulaOrderQty} units`
                              : null),
        } as InventoryItem;
      });

    // If backend returned 0 matched items (all errored), keep current items
    if (mapped.length > 0) {
      this.items.set(mapped);
    }

    this.alerts.set(payload.alerts as InventoryAlert[]);
    this.agentLoading.set(false);

    // ── Log stock changes + flash dots ────────────────────────────────────────
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

 
  private loadAgentOverlay(
  storeId = 'STORE-001',
  objective = 'balanced'
): void {

  this.agentLoading.set(true);
  this.agentError.set(null);

  this.invApi.getStore(storeId, objective).subscribe({

    next: payload => {

      console.log(
        '[Inventory] 📦 HTTP load OK —',
        payload.items?.length ?? 0,
        'items'
      );

      this._applyAgentPayload(payload);

      this.lastUpdate.set(new Date());

      this.agentLoading.set(false);
    },

    error: err => {

      console.warn(
        '[Inventory] ⚠️ Agent unavailable, using mock data:',
        err
      );

      this.agentError.set(
        'Agent offline — showing demo data'
      );

      this.agentLoading.set(false);
    }

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
  
  // Search methods
  setSearch(text: string): void { this.searchText.set(text); }
  clearSearch(): void { this.searchText.set(''); }
  
  // Product decision methods
  getProductDecision(id: string): Decision { return this.productDecisions()[id] ?? null; }
  
  approveProduct(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: 'approved' }));
  }

  rejectProduct(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: 'rejected' }));
  }

  undoProductDecision(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: null }));
  }
  
  // Modal methods
  viewFullAnalysis(item: InventoryItem, e: Event): void {
    e.stopPropagation();
    this.analysisModal.set(item);
  }
  
  closeAnalysisModal(): void {
    this.analysisModal.set(null);
  }

  dismissAlert(id: string): void {
    this.alerts.update(list => list.filter(a => a.id !== id));
  }

  // ── Style helpers ──────────────────────────────────────────────────────────

  riskColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#E74C3C',
      high: '#F9A825',
      medium: '#2D9CDB',
      ok: '#00B894',
      low: '#9CA3AF',
    };
    return m[r] ?? '#9CA3AF';
  }

  riskBg(r: string): string {
    const m: Record<string, string> = {
      critical: '#FDEDEC',
      high: '#FFF8E1',
      medium: '#E8F4FD',
      ok: '#E0FAF4',
      low: '#F2F4F8',
    };
    return m[r] ?? '#F2F4F8';
  }

  riskLabel(r: string): string {
    const m: Record<string, string> = {
      critical: 'CRITICAL',
      high: 'HIGH',
      medium: 'MEDIUM',
      ok: 'OK',
      low: 'LOW',
    };
    return m[r] ?? 'N/A';
  }

  riskBackColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#C0392B',
      high: '#B45309',
      medium: '#1A6FA8',
      ok: '#007A63',
      low: '#6B7280',
    };
    return m[r] ?? '#6B7280';
  }

  coverageWidth(ratio: number): number {
    return Math.min(Math.round((ratio / 3) * 100), 100);
  }

  coverageColor(ratio: number): string {
    if (ratio < 0.5) return '#E74C3C';
    if (ratio < 1.0) return '#F9A825';
    return '#00B894';
  }

  trendIcon(t: string): string {
    if (t === 'up') return '↑';
    if (t === 'down') return '↓';
    return '→';
  }

  trendColor(t: string): string {
    if (t === 'up') return '#00B894';
    if (t === 'down') return '#E74C3C';
    return '#9CA3AF';
  }

  alertColor(u: string): string {
    if (u === 'critical') return '#E74C3C';
    if (u === 'high') return '#F9A825';
    return '#2D9CDB';
  }

  alertBg(u: string): string {
    if (u === 'critical') return '#FDEDEC';
    if (u === 'high') return '#FFF8E1';
    return '#E8F4FD';
  }

  alertIcon(type: string): string {
    if (type === 'rupture') return 'S';
    if (type === 'redistribution') return 'T';
    return 'O';
  }

  alertTypeLabel(type: string): string {
    if (type === 'rupture') return 'Stockout';
    if (type === 'redistribution') return 'Transfer';
    return 'Overstock';
  }

  // ── Flip card back helpers ────────────────────────────────────────────────

  safetyStockVal(item: InventoryItem): string {
    const v = (item as any).safetyStock;
    return v > 0 ? `${Math.round(v)} units` : '—';
  }

  orderQtyLabel(item: InventoryItem): string {
    const api = item as any;
    if (!api.formulaOrderQty) return '—';
    return api.moqIsBinding
      ? `${api.formulaOrderQty} units (MOQ: ${api.moq})`
      : `${api.formulaOrderQty} units`;
  }

  daysLabel(item: InventoryItem): string {
    const v = (item as any).daysOfStock;
    return v != null ? `${(+v).toFixed(1)}d` : '—';
  }

  reorderPointVal(item: InventoryItem): string {
    const v = (item as any).reorderPoint;
    return v != null && v > 0 ? `${Math.round(v)} units` : '—';
  }

  riskRationaleVal(item: InventoryItem): string | null {
    return (item as any).riskRationale ?? (item as any).analystNote ?? null;
  }

  hasDecision(item: InventoryItem): boolean {
    return !!(item as any).recommendation &&
      !(item as any).recommendation?.startsWith('Order ');
  }

  // ── Ask Coach ─────────────────────────────────────────────────────────────

  askChat(item: InventoryItem, e: Event): void {
    e.stopPropagation();
    const api = item as any;
    const msg =
      `⚠️ ${item.riskLevel.toUpperCase()} stock alert: ${item.name} ` +
      `has ${item.stock} units left (${api.daysOfStock?.toFixed?.(1) ?? '?'}d coverage). ` +
      (api.riskRationale ? `${api.riskRationale} ` : '') +
      (api.formulaOrderQty ? `Suggested order: ${api.formulaOrderQty} units. ` : '') +
      `What should I do?`;

    try {
      sessionStorage.setItem('chat_prefill', JSON.stringify({
        text: msg,
        mode: 'inventory',
        sku: item.sku,
        name: item.name,
      }));
    } catch {
      // ignore private browsing/sessionStorage errors
    }

    window.location.href = '/chat';
  }

  askChatFromAlert(alert: InventoryAlert, e: Event): void {
    e.stopPropagation();

    const item = this.items().find((i: InventoryItem) => i.sku === alert.sku);
    if (item) {
      this.askChat(item, e);
      return;
    }

    const msg =
      `⚠️ ${(alert.urgency ?? 'HIGH').toUpperCase()} inventory alert for ${alert.sku}: ` +
      `${alert.message} ` +
      (alert.action ? `AI recommendation: ${alert.action}` : '');

    try {
      sessionStorage.setItem('chat_prefill', JSON.stringify({
        text: msg,
        mode: 'inventory',
        sku: alert.sku,
      }));
    } catch {
      // ignore private browsing/sessionStorage errors
    }

    window.location.href = '/chat';
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

}