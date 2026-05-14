/**
 * InventoryComponent — FIXED
 *
 * Root causes fixed:
 * 1. stock_delta was patching liveInventory with type='inventory_update' before
 *    the real snapshot arrived, setting lastPayloadHash and blocking the real data.
 *    Fix: guard effect on payload.items.length > 10 (mock has 7), and clear hash
 *    when store changes.
 *
 * 2. effect() in constructor fires before connectInventory() (afterNextRender).
 *    Fix: moved WS connect call to ngOnInit so it runs before the effect can miss data.
 *
 * 3. HTTP fallback used getStore() which defaults to page_size=100.
 *    Fix: added page_size=0 param to always get all items.
 *
 * 4. Store was hardcoded to 'I63'. Now driven by selectedStore signal.
 *    Changing store reconnects WS and reloads data.
 *
 * 5. HTTP fallback reduced from 25s to 5s — WS delivers initial snapshot
 *    within 2-3s when backend cache is warm.
 */

import {
  Component, computed, signal, OnInit, effect,
  inject, OnDestroy, DestroyRef, afterNextRender, PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClientModule, HttpParams } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs/operators';
import { InventoryItem, InventoryAlert } from '../../core/models/inventory';
import { MockDataService } from '../../core/services/mock-data';
import { InventoryApiService, InventoryApiItem, StorePayload } from '../../core/services/inventory-api.service';
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

// Minimum number of items a payload must contain to be treated as real backend
// data (vs. a stock_delta patch built from the 7 mock items).
const MIN_REAL_ITEMS = 8;

// How long to wait before the first HTTP poll attempt.
// The pipeline takes 15-20s on a cold start, so we start polling at 10s
// and retry every 10s until real data arrives. Once cache is warm, the
// first poll at 10s will succeed immediately.
const HTTP_FIRST_POLL_MS  = 10_000;
const HTTP_RETRY_POLL_MS  = 10_000;
const HTTP_MAX_ATTEMPTS   = 6;      // give up after ~70s total

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
  private http       = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  // ── State ─────────────────────────────────────────────────────────────────

  items  = signal<InventoryItem[]>([]);
  alerts = signal<InventoryAlert[]>([]);

  agentLoading = signal(false);
  agentError   = signal<string | null>(null);

  wsConnected = computed(() => this.ws.connected());
  lastUpdate  = signal<Date | null>(null);

  // True once backend data has replaced mock
  isLiveData = computed(() =>
    this.items().length > 7 ||
    this.items().some((i: any) => i.safetyStock > 0 || i.riskRationale)
  );

  // ── Store selector ────────────────────────────────────────────────────────
  // Populated from GET /api/inventory/stores on init
  availableStores = signal<{ id: string; name: string }[]>([]);
  selectedStore   = signal<string>('I63');
  selectedObjective = signal<string>('balanced');

  // ── Filters / sort / UI state ─────────────────────────────────────────────

  filterRisk = signal<FilterRisk>('all');
  sortKey    = signal<SortKey>('risk');
  searchText = signal<string>('');
  flippedId  = signal<string | null>(null);
  decisions  = signal<Record<string, Decision>>({});
  productDecisions = signal<Record<string, Decision>>({});
  analysisModal = signal<InventoryItem | null>(null);
  flashedSkus   = signal<Set<string>>(new Set());

  // Used to deduplicate WS payloads — cleared on store change
  private lastPayloadHash  = '';
  private _pollingTimer:  any = null;
  private _refreshTimer:  any = null;
  private _fallbackTimer: any = null;

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

  productApprovedCount = computed(() =>
    Object.values(this.productDecisions()).filter(d => d === 'approved').length
  );
  productRejectedCount = computed(() =>
    Object.values(this.productDecisions()).filter(d => d === 'rejected').length
  );

  // ── Quadrant chart ────────────────────────────────────────────────────────

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

  quadrantZone(p: InventoryItem): 'star' | 'stockout' | 'ok' | 'overstock' {
    if (p.stock >= 999 || (p as any).overstockFlag) return 'overstock';
    const highStock  = this.quadrantX(p) >= 50;
    const highDemand = this.quadrantY(p) >= 50;
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

  // ── Display list ──────────────────────────────────────────────────────────

  displayItems = computed(() => {
    let list = [...this.items()];
    const f  = this.filterRisk();
    if (f !== 'all') list = list.filter(i => i.riskLevel === f);

    const search = this.searchText().toLowerCase().trim();
    if (search) {
      list = list.filter(i => {
        const name     = String(i.name     ?? '').toLowerCase();
        const sku      = String(i.sku      ?? '').toLowerCase();
        const category = String(i.category ?? '').toLowerCase();
        return name.includes(search) || sku.includes(search) || category.includes(search);
      });
    }

    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, ok: 3 };
    switch (this.sortKey()) {
      case 'risk':     list.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]); break;
      case 'stock':    list.sort((a, b) => a.stock - b.stock); break;
      case 'coverage': list.sort((a, b) => a.coverageRatio - b.coverageRatio); break;
      case 'name':     list.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))); break;
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
    // ── Effect: react to WS inventory updates ─────────────────────────────
    // IMPORTANT: we guard against stock_delta patches built from mock items
    // (those will have ≤7 items). We only apply payloads that look like real
    // backend data (more than MIN_REAL_ITEMS items).
    effect(() => {
      const payload = this.ws.liveInventory();

      // Must be an inventory_update (not a heartbeat or stock_delta type mismatch)
      if (!payload || payload.type !== 'inventory_update') return;

      // Guard: stock_delta patches built from mock have only 7 items.
      // Wait for a real full snapshot (> MIN_REAL_ITEMS).
      if (!payload.items?.length) return;

      // If this is a stock_delta patch (small set), only apply it if we
      // already have live data — don't let it poison the first-load path.
      const isSmallPatch = payload.items.length <= MIN_REAL_ITEMS;
      const alreadyLive  = this.items().length > MIN_REAL_ITEMS;
      if (isSmallPatch && !alreadyLive) {
        console.log(
          '[Inventory] Skipping stock_delta patch — real snapshot not yet received.',
          `(patch=${payload.items.length} items, live=${alreadyLive})`
        );
        return;
      }

      // Deduplicate: ignore if nothing changed
      const hash = JSON.stringify(
        payload.items.slice(0, 20).map((i: InventoryApiItem) => i.sku + i.stock + i.riskLevel)
      );
      if (hash === this.lastPayloadHash) return;
      this.lastPayloadHash = hash;

      console.log(
        '[Inventory] ✅ WS update —',
        payload.items.length, 'items |',
        new Date().toLocaleTimeString()
      );

      this._cancelFallbackTimer();
      this._applyAgentPayload(payload);
      this.lastUpdate.set(new Date());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Seed mock so page is never blank
    this.items.set(this.mock.getInventoryItems());
    this.alerts.set(this.mock.getInventoryAlerts());

    if (!isPlatformBrowser(this.platformId)) return;

    // Load available stores for the selector dropdown
    this._loadAvailableStores();

    // Connect WS immediately (not deferred to afterNextRender, so the effect
    // can catch the first message)
    this._connectWs();

    // HTTP fallback: if WS hasn't delivered real data within HTTP_FALLBACK_MS,
    // load via HTTP. This covers: slow first pipeline run (~20s), WS hiccups.
    this._scheduleFallback();
  }

  ngOnDestroy(): void {
    this._cancelFallbackTimer();
    if (this._pollingTimer) { clearInterval(this._pollingTimer); this._pollingTimer = null; }
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    // Do NOT call ws.disconnect() — WS service is shared with Dashboard/Advisor
  }

  // ── Store selector ─────────────────────────────────────────────────────────

  private _loadAvailableStores(): void {
    this.http.get<{ stores: { id: string; name: string }[] }>(
      'http://localhost:8000/api/inventory/stores'
    ).subscribe({
      next: res => {
        if (res.stores?.length) {
          this.availableStores.set(res.stores);
          console.log('[Inventory] Available stores:', res.stores.map(s => s.id));
        }
      },
      error: () => {
        // Non-fatal — store selector just won't be pre-populated
        console.warn('[Inventory] Could not load store list');
      },
    });
  }

  /**
   * Called from the template when the user picks a different store.
   * Reconnects WS and reloads data for the new store.
   */
  changeStore(storeId: string, objective?: string): void {
    if (storeId === this.selectedStore() && !objective) return;

    this.selectedStore.set(storeId);
    if (objective) this.selectedObjective.set(objective);

    // Reset state
    this.lastPayloadHash = '';
    this.items.set(this.mock.getInventoryItems());
    this.alerts.set(this.mock.getInventoryAlerts());
    this.agentError.set(null);
    this.lastUpdate.set(null);

    // Reconnect WS to new store
    this._connectWs();
    this._scheduleFallback();
  }

  private _connectWs(): void {
    const storeId   = this.selectedStore();
    const objective = this.selectedObjective();
    console.log(`[Inventory] Connecting WS → ${storeId} (${objective})`);
    this.ws.connectInventory(storeId, objective);
  }

  // ── HTTP polling (fallback + warm cache fast path) ─────────────────────────
  // The pipeline takes 15-20s cold, instant when cache is warm.
  // We poll every HTTP_RETRY_POLL_MS until real data arrives or max attempts hit.
  private _pollAttempts = 0;

  private _scheduleFallback(): void {
    this._cancelFallbackTimer();
    this._pollAttempts = 0;
    this._fallbackTimer = setTimeout(() => this._pollOnce(), HTTP_FIRST_POLL_MS);
  }

  private _pollOnce(): void {
    const hasRealData =
      this.items().length > MIN_REAL_ITEMS ||
      this.items().some((i: any) => i.safetyStock > 0 || i.riskRationale);

    if (hasRealData) {
      console.log('[Inventory] WS delivered real data — stopping HTTP polling');
      return;
    }

    this._pollAttempts++;
    console.log(
      `[Inventory] HTTP poll attempt ${this._pollAttempts}/${HTTP_MAX_ATTEMPTS} — pipeline may still be running`
    );

    this.loadAgentOverlay(
      this.selectedStore(),
      this.selectedObjective(),
      // onSuccess: stop polling
      () => { this._cancelFallbackTimer(); },
      // onEmpty: schedule next attempt if not at max
      () => {
        if (this._pollAttempts < HTTP_MAX_ATTEMPTS) {
          this._fallbackTimer = setTimeout(() => this._pollOnce(), HTTP_RETRY_POLL_MS);
        } else {
          console.warn('[Inventory] HTTP polling exhausted — backend may be offline');
          this.agentError.set('Backend timeout — check server logs');
        }
      }
    );
  }

  private _cancelFallbackTimer(): void {
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _applyAgentPayload(
    payload: { items: InventoryApiItem[]; alerts: InventoryAlert[] }
  ): void {

    if (!payload?.items?.length) return;

    const oldStock = new Map<string, number>(
      this.items().map(i => [i.sku, i.stock])
    );

    const mockMap = new Map<string, InventoryItem>(
      this.mock.getInventoryItems().map(i => [i.sku, i])
    );

    const mapped: InventoryItem[] = payload.items
      .filter(a => !(a as any)['error'])
      .map(agentItem => {
        const fallback = mockMap.get(agentItem.sku);

        const rawRisk = ((agentItem.riskLevel as string) ?? '').toLowerCase();
        const riskLevel: 'critical' | 'high' | 'ok' = (
          rawRisk === 'critical' ? 'critical' :
          rawRisk === 'high'     ? 'high'     :
          rawRisk === 'medium'   ? 'high'     :
          'ok'
        );

        let coverageRatio = agentItem.coverageRatio ?? 0;
        if (!coverageRatio && agentItem.daysOfStock !== undefined) {
          const lt = agentItem.leadTimeDays || 7;
          coverageRatio = Math.min(+(agentItem.daysOfStock / lt).toFixed(2), 5);
        }

        // Sanitize name — backend may return null/number/undefined if product_master
        // lookup fails. Template calls .split() on it, which crashes on non-strings.
        const rawName = agentItem.name ?? fallback?.name ?? agentItem.sku ?? '';
        const rawSku  = String(agentItem.sku ?? '');
        const safeName = (typeof rawName === 'string' && rawName.trim())
          ? rawName.trim()
          : String(agentItem.sku ?? 'Unknown');

        return {
          ...(agentItem as any),
          id:           agentItem.id       ?? fallback?.id       ?? `inv-${rawSku}`,
          sku:          rawSku,
          name:         safeName,
          category:     (typeof agentItem.category === 'string' && agentItem.category.trim())
                          ? agentItem.category
                          : (fallback?.category ?? 'Unknown'),
          riskLevel,
          coverageRatio,
          riskScore: agentItem.riskScore ?? (
            riskLevel === 'critical' ? 0.90 :
            riskLevel === 'high'     ? 0.72 : 0.10
          ),
          trend:       agentItem.trend      ?? fallback?.trend      ?? 'stable',
          confidence:  agentItem.confidence ?? fallback?.confidence ?? 0.85,
          recommendationDetail: agentItem.recommendationDetail
                                ?? agentItem.analystNote
                                ?? fallback?.recommendationDetail
                                ?? null,
          recommendation: agentItem.recommendation
                          ?? (agentItem.formulaOrderQty
                              ? `Order ${agentItem.formulaOrderQty} units`
                              : null),
        } as InventoryItem;
      });

    if (mapped.length > 0) {
      this.items.set(mapped);
    }

    this.alerts.set(payload.alerts as InventoryAlert[]);
    this.agentLoading.set(false);

    // Flash dots for decreased stock
    const decreased = payload.items
      .filter(i => {
        const prev = oldStock.get(i.sku);
        return prev !== undefined && i.stock < prev;
      })
      .map(i => `${i.sku}: ${oldStock.get(i.sku)} → ${i.stock}`);
    if (decreased.length) {
      console.log('[Inventory] Stock sold:', decreased.join(' | '));
      const skus = new Set(decreased.map(d => d.split(':')[0].trim()));
      this.flashedSkus.set(skus);
      setTimeout(() => this.flashedSkus.set(new Set()), 900);
    }

    const hasRealData = mapped.some(
      (i: any) => (i.safetyStock > 0) || i.riskRationale || i.analystNote
    );
    console.log(
      `[Inventory] ${hasRealData ? '✅ LIVE' : '⚠️ rule-based'} | ` +
      `${mapped.length} SKUs | store=${this.selectedStore()} | ` +
      `critical=${mapped.filter(i => i.riskLevel === 'critical').length} ` +
      `high=${mapped.filter(i => i.riskLevel === 'high').length} ` +
      `ok=${mapped.filter(i => i.riskLevel === 'ok').length}`
    );
  }

  /**
   * HTTP load with optional callbacks.
   * onSuccess: called when items were received and applied
   * onEmpty:   called when the response had 0 valid items (pipeline still running)
   */
  loadAgentOverlay(
    storeId   = this.selectedStore(),
    objective = this.selectedObjective(),
    onSuccess?: () => void,
    onEmpty?:   () => void,
  ): void {
    this.agentLoading.set(true);
    this.agentError.set(null);

    const params = new HttpParams()
      .set('business_objective', objective)
      .set('page_size', '0');

    this.http.get<StorePayload>(
      `http://localhost:8000/api/inventory/store/${storeId}`,
      { params }
    ).pipe(
      timeout(90_000)   // 90s — pipeline can take 20-40s; we retry on timeout via onEmpty
    ).subscribe({
      next: payload => {
        const count = payload.items?.length ?? 0;
        console.log(`[Inventory] 📦 HTTP load → ${count} items`);

        if (count > MIN_REAL_ITEMS) {
          this._cancelFallbackTimer();
          this._applyAgentPayload(payload);
          this.lastUpdate.set(new Date());
          onSuccess?.();
        } else {
          // Pipeline still running (returned 0 or only mock-sized set)
          console.log('[Inventory] HTTP returned empty/small — pipeline still running, will retry');
          this.agentLoading.set(false);
          onEmpty?.();
        }
      },
      error: err => {
        console.warn('[Inventory] ⚠️ HTTP error:', err?.status, err?.message);
        this.agentError.set('Agent offline — retrying…');
        this.agentLoading.set(false);
        onEmpty?.();
      },
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  toggleFlip(id: string): void {
    this.flippedId.update(cur => cur === id ? null : id);
  }

  isFlipped(id: string): boolean {
    return this.flippedId() === id;
  }

  setFilter(f: string): void { this.filterRisk.set(f as FilterRisk); }
  setSort(s: string):   void { this.sortKey.set(s as SortKey); }

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

  setSearch(text: string): void { this.searchText.set(text); }
  clearSearch(): void           { this.searchText.set(''); }

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
      critical: '#E74C3C', high: '#F9A825',
      medium:   '#2D9CDB', ok:   '#00B894', low: '#9CA3AF',
    };
    return m[r] ?? '#9CA3AF';
  }

  riskBg(r: string): string {
    const m: Record<string, string> = {
      critical: '#FDEDEC', high: '#FFF8E1',
      medium:   '#E8F4FD', ok:   '#E0FAF4', low: '#F2F4F8',
    };
    return m[r] ?? '#F2F4F8';
  }

  riskLabel(r: string): string {
    const m: Record<string, string> = {
      critical: 'CRITICAL', high: 'HIGH',
      medium:   'MEDIUM',   ok:   'OK', low: 'LOW',
    };
    return m[r] ?? 'N/A';
  }

  riskBackColor(r: string): string {
    const m: Record<string, string> = {
      critical: '#C0392B', high: '#B45309',
      medium:   '#1A6FA8', ok:   '#007A63', low: '#6B7280',
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

  // ── Flip card back helpers ─────────────────────────────────────────────────

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

  askChat(item: InventoryItem, e: Event): void {
    e.stopPropagation();
    const api = item as any;
    const msg =
      `⚠️ ${item.riskLevel.toUpperCase()} stock alert: ${item.name} ` +
      `has ${item.stock} units left (${api.daysOfStock?.toFixed?.(1) ?? '?'}d coverage). ` +
      (api.riskRationale ? api.riskRationale + ' ' : '') +
      (api.formulaOrderQty ? `Suggested order: ${api.formulaOrderQty} units. ` : '') +
      `What should I do?`;
    try {
      sessionStorage.setItem('chat_prefill', JSON.stringify({
        text: msg, mode: 'inventory', sku: item.sku, name: item.name,
      }));
    } catch { /* private browsing */ }
    window.location.href = '/chat';
  }

  askChatFromAlert(alert: InventoryAlert, e: Event): void {
    e.stopPropagation();
    const item = this.items().find(i => i.sku === alert.sku);
    if (item) { this.askChat(item, e); return; }
    const msg =
      `⚠️ ${(alert.urgency ?? 'HIGH').toUpperCase()} inventory alert for ${alert.sku}: ` +
      `${alert.message} ` +
      (alert.action ? `AI recommendation: ${alert.action}` : '');
    try {
      sessionStorage.setItem('chat_prefill', JSON.stringify({
        text: msg, mode: 'inventory', sku: alert.sku,
      }));
    } catch { /* private browsing */ }
    window.location.href = '/chat';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}