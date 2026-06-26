import {
  Component, computed, signal, OnInit, effect,
  inject, OnDestroy, DestroyRef, PLATFORM_ID,
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
  // Decision agent fields
  'recommendation', 'recommendationDetail', 'recommendationId',
  'finalOrderQty', 'orderTiming',
  'decisionConfidence', 'escalateToHuman', 'escalationReason', 'tradeOffs',
];

// Minimum number of items a payload must contain to be treated as real backend
// data (vs. a stock_delta patch built from the 7 mock items).
const MIN_REAL_ITEMS = 8;

// How long to wait before the first HTTP poll attempt.
// Pre-warm starts at server startup so cache may be warm within ~5-30s.
// Poll every 15s. 12 attempts = up to 3 min total before giving up.
const HTTP_FIRST_POLL_MS  = 8_000;
const HTTP_RETRY_POLL_MS  = 15_000;
const HTTP_MAX_ATTEMPTS   = 12;

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

  // ── Business Objectives ───────────────────────────────────────────────────
  availableObjectives = signal<{ 
    label: string; 
    is_active: boolean; 
    metadata?: any;
    priority?: number;
  }[]>([]);

  // ── Filters / sort / UI state ─────────────────────────────────────────────

  filterRisk = signal<FilterRisk>('all');
  sortKey    = signal<SortKey>('risk');
  searchText = signal<string>('');
  flippedId  = signal<string | null>(null);
  decisions  = signal<Record<string, Decision>>({});
  productDecisions = signal<Record<string, Decision>>({});

  /**
   * Per-alert status right after a user action.
   * Set immediately, cleared once the timed removal fires (or on undo).
   * Values: 'validated' | 'rejected' | 'error'
   */
  alertStatuses = signal<Record<string, string>>({});

  /** Timers for auto-removing decided alerts. Cancelled if user clicks Undo. */
  private _alertRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** How long (ms) the decided badge + Undo button stay visible before auto-remove. */
  private readonly ALERT_UNDO_MS = 4_000;
  analysisModal = signal<InventoryItem | null>(null);
  flashedSkus   = signal<Set<string>>(new Set());

  // Used to deduplicate WS payloads — cleared on store change
  private lastPayloadHash  = '';
  private _pollingTimer:  any = null;
  private _refreshTimer:  any = null;
  private _fallbackTimer: any = null;
  private _activeHttpSub: any = null;  // tracks in-flight HTTP poll — cancelled before each new attempt

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

    // Load available business objectives
    this._loadObjectives();

    // Connect WS immediately (not deferred to afterNextRender, so the effect
    // can catch the first message)
    this._connectWs();

    // Load DB alerts immediately — don't wait for the pipeline to finish
    this._loadDbAlerts();

    // HTTP fallback: if WS hasn't delivered real data within HTTP_FALLBACK_MS,
    // load via HTTP. This covers: slow first pipeline run (~20s), WS hiccups.
    this._scheduleFallback();
  }

  ngOnDestroy(): void {
    this._cancelFallbackTimer();
    if (this._pollingTimer) { clearInterval(this._pollingTimer); this._pollingTimer = null; }
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    // Clear any pending alert-removal timers
    this._alertRemovalTimers.forEach(t => clearTimeout(t));
    this._alertRemovalTimers.clear();
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

  private _loadObjectives(): void {
    this.invApi.getObjectives().subscribe({
      next: res => {
        this.availableObjectives.set(res.objectives ?? []);
        const active = res.objectives?.find((o: any) => o.is_active);
        if (active) {
          this.selectedObjective.set(active.label);
          console.log('[Inventory] Active objective:', active.label);
        }
      },
      error: () => {
        console.warn('[Inventory] Could not load objectives — using default');
      },
    });
  }

  /**
   * Called when user selects a different business objective from dropdown.
   * Switches the active objective in DB and reloads inventory with new thresholds.
   */
  changeObjective(label: string): void {
    if (label === this.selectedObjective()) return;

    console.log('[Inventory] Switching to objective:', label);
    this.invApi.setActiveObjective(label).subscribe({
      next: () => {
        this.selectedObjective.set(label);
        // Reload inventory with new objective
        this.changeStore(this.selectedStore(), label);
      },
      error: err => {
        console.warn('[Inventory] Could not set objective:', err);
        // Optionally show error to user
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
    // Cancel any in-flight removal timers before clearing state
    this._alertRemovalTimers.forEach(t => clearTimeout(t));
    this._alertRemovalTimers.clear();
    this.alertStatuses.set({});
    this.decisions.set({});

    // Reconnect WS to new store
    this._connectWs();
    this._scheduleFallback();

    // Reload DB alerts for the new store
    this._loadDbAlerts();
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
    // Cancel any previous in-flight request so requests don't pile up.
    if (this._activeHttpSub) {
      this._activeHttpSub.unsubscribe();
      this._activeHttpSub = null;
    }

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

    this._activeHttpSub = this.loadAgentOverlay(
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

  private _applyAgentPayload(payload: { items: InventoryApiItem[], alerts: InventoryAlert[] }): void {

    // ── Capture stock BEFORE update so the diff log is accurate ──────────
    // If we read this.items() AFTER the update, we'd compare new vs new → always zero diff.
  

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
          // recommendation comes from the decision agent (ORDER/EXPEDITE/MONITOR/HOLD).
          // Only fall back to the formula string when the decision agent didn't run
          // (fast/rule-based path with no decision_result).
          recommendation: agentItem.recommendation
                          ?? (agentItem.formulaOrderQty
                              ? `Order ${agentItem.formulaOrderQty} units`
                              : null),
          // Pass-through new decision agent fields — backend always sets these
          // (null when decision agent didn't run, which is fine).
          finalOrderQty:      agentItem.finalOrderQty      ?? null,
          orderTiming:        agentItem.orderTiming        ?? null,
          decisionConfidence: agentItem.decisionConfidence ?? null,
          escalateToHuman:    agentItem.escalateToHuman    ?? false,
          escalationReason:   agentItem.escalationReason   ?? null,
          tradeOffs:          agentItem.tradeOffs          ?? null,
          recommendationId:   agentItem.recommendationId   ?? null,
        } as InventoryItem;
      });

    if (mapped.length > 0) {
      this.items.set(mapped);

      // Rehydrate productDecisions from DB-backed recommendationStatus so
      // approve/reject state survives navigation and page refresh.
      // Only overwrite entries that have a real non-pending decision.
      const rehydrated: Record<string, Decision> = {};
      for (const item of mapped) {
        const recStatus = (item as any).recommendationStatus as string | null;
        if (item.id && recStatus && recStatus !== 'pending') {
          rehydrated[item.id] = recStatus as Decision;
        }
      }
      if (Object.keys(rehydrated).length > 0) {
        this.productDecisions.update(d => ({ ...d, ...rehydrated }));
      }
    }

    this.agentLoading.set(false);

    // Apply alerts from the snapshot payload when present (they come straight
    // from _build_alerts() and already have real DB UUIDs where available).
    // Then always re-fetch from DB so the panel reflects the current pipeline
    // run — _loadDbAlerts() on init fires before the pipeline finishes, so
    // without this reload it would show stale data from the previous run.
    if (payload.alerts?.length) {
      this.alerts.set(payload.alerts as InventoryAlert[]);
    }
    this._loadDbAlerts();

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
  ): any {
    this.agentLoading.set(true);
    this.agentError.set(null);

    const params = new HttpParams()
      .set('business_objective', objective)
      .set('page_size', '0');

    return this.http.get<StorePayload>(
      `http://localhost:8000/api/inventory/store/${storeId}`,
      { params }
    ).pipe(
      timeout(60_000)  // 60s — if it takes longer the backend has a real problem
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

  // ── DB alert loader ──────────────────────────────────────────────────────

  /**
   * Load alerts from the DB via GET /api/inventory/alerts/{storeId}.
   * This is the single source of truth — alerts written by the analysis agent
   * with real UUIDs that the PATCH endpoint can update.
   *
   * Falls back silently if the DB is unavailable (alerts stay as-is).
   */
  private _loadDbAlerts(): void {
    this.invApi.getAlerts(this.selectedStore(), 'pending').subscribe({
      next: res => {
        const dbAlerts: InventoryAlert[] = (res.alerts ?? []).map((a: any) => {
          // routes.py remaps alert_type → type ('rupture'|'redistribution'|'overstock')
          // Always read the remapped 'type' — never fall back to raw 'alert_type'.
          const type    = a.type    ?? 'redistribution';
          const urgency = a.severity ?? a.urgency ?? 'high';
          const name    = a.product_name ?? a.name ?? a.sku ?? '';

          let title: string;
          if (a.title) {
            title = a.title;
          } else if (type === 'rupture') {
            title = `Stockout imminent: ${name}`;
          } else if (type === 'redistribution') {
            title = `Low stock: ${name}`;
          } else {
            title = `Overstock: ${name}`;
          }

          return {
            id:      a.id,
            sku:     a.sku,
            type,
            urgency,
            title,
            message: title,
            action:  a.recommended_action ?? a.action ?? '',
            time:    a.triggered_at ?? a.created_at ?? a.time ?? '',
          };
        });

        // FIX: exclude any alert the user has already actioned locally
        // (validated / rejected / dismissed) — whether or not the removal
        // timer has fired yet.  Without this, a WS-triggered _loadDbAlerts()
        // call during the 4-second undo window causes actioned alerts to
        // reappear or be permanently stuck as "pending" in the UI.
        const currentStatuses  = this.alertStatuses();
        const decidedLocally   = new Set(
          Object.entries(currentStatuses)
            .filter(([, s]) => s === 'validated' || s === 'rejected' || s === 'dismissed')
            .map(([id]) => id)
        );

        const incomingIds     = new Set(dbAlerts.map(a => a.id));

        // Keep alerts still in the undo window that the DB no longer returns
        const preservedAlerts = this.alerts()
          .filter(a =>
            this._alertRemovalTimers.has(a.id) &&
            !incomingIds.has(a.id) &&
            !decidedLocally.has(a.id)   // don't preserve if already decided
          );

        // Filter out any db alert the user already decided locally
        const filteredDb = dbAlerts.filter(a => !decidedLocally.has(a.id));

        const merged = [...filteredDb, ...preservedAlerts];
        console.log(
          `[Inventory] 🔔 DB alerts: ${dbAlerts.length} pending` +
          (decidedLocally.size ? ` (${decidedLocally.size} suppressed — locally decided)` : '') +
          (preservedAlerts.length ? ` + ${preservedAlerts.length} in undo window` : '')
        );
        this.alerts.set(merged);
      },
      error: err => {
        console.warn('[Inventory] Could not load DB alerts:', err?.status);
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
    this.alertStatuses.update(s => ({ ...s, [id]: 'validated' }));
    this._scheduleAlertRemoval(id);   // auto-removes after ALERT_UNDO_MS

    this.invApi.acknowledgeAlert(id, 'validated').subscribe({
      next: (res: any) => {
        if (res?.skipped) {
          console.warn('[Alert] Skipped PATCH (fake id):', id);
        } else {
          console.log('[Alert] ✅ DB status → validated:', id);
        }
      },
      error: err => {
        // DB write failed — show error badge; cancel auto-removal so user sees it
        this._cancelAlertRemoval(id);
        this.alertStatuses.update(s => ({ ...s, [id]: 'error' }));
        this.decisions.update(d => ({ ...d, [id]: null }));
        console.warn('[Alert] PATCH failed (validate):', err?.status, id);
      },
    });
  }

  rejectAlert(id: string, e: Event): void {
    e.stopPropagation();
    this.decisions.update(d => ({ ...d, [id]: 'rejected' }));
    this.alertStatuses.update(s => ({ ...s, [id]: 'rejected' }));
    this._scheduleAlertRemoval(id);   // auto-removes after ALERT_UNDO_MS

    this.invApi.acknowledgeAlert(id, 'rejected').subscribe({
      next: (res: any) => {
        if (res?.skipped) {
          console.warn('[Alert] Skipped PATCH (fake id):', id);
        } else {
          console.log('[Alert] ✅ DB status → rejected:', id);
        }
      },
      error: err => {
        this._cancelAlertRemoval(id);
        this.alertStatuses.update(s => ({ ...s, [id]: 'error' }));
        this.decisions.update(d => ({ ...d, [id]: null }));
        console.warn('[Alert] PATCH failed (reject):', err?.status, id);
      },
    });
  }

  undoDecision(id: string, e: Event): void {
    e.stopPropagation();
    // Cancel the scheduled removal and clear local state
    this._cancelAlertRemoval(id);
    this.decisions.update(d => ({ ...d, [id]: null }));
    this.alertStatuses.update(s => {
      const copy = { ...s };
      delete copy[id];
      return copy;
    });
    // Revert DB status to 'acknowledged' so the alert stays in the pending queue
    if (id && !id.startsWith('alert-')) {
      this.invApi.acknowledgeAlert(id, 'acknowledged').subscribe({
        next: () => console.log('[Alert] Undone → acknowledged:', id),
        error: err => console.warn('[Alert] Undo PATCH failed:', err?.status, id),
      });
    }
  }

  setSearch(text: string): void { this.searchText.set(text); }
  clearSearch(): void           { this.searchText.set(''); }

  getProductDecision(id: string): Decision { return this.productDecisions()[id] ?? null; }

  approveProduct(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: 'approved' }));

    // id here is the item's sku-based id (inv-SKU). The recommendationId is on the item.
    const item = this.items().find(i => (i as any).id === id || i.sku === id);
    const recId: string | null = (item as any)?.recommendationId ?? null;

    if (!recId) {
      console.warn('[Recommendations] No recommendationId for item', id, '— local only');
      return;
    }

    this.invApi.updateRecommendation(recId, 'approved').subscribe({
      next: (res: any) => {
        if (res?.skipped) {
          console.warn('[Recommendations] Skipped PATCH (no id):', recId);
        } else {
          console.log('[Recommendations] ✅ DB status → approved:', recId);
        }
      },
      error: err => {
        // Roll back local state on failure
        this.productDecisions.update(d => ({ ...d, [id]: null }));
        console.warn('[Recommendations] PATCH failed (approve):', err?.status, recId);
      },
    });
  }

  rejectProduct(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: 'rejected' }));

    const item = this.items().find(i => (i as any).id === id || i.sku === id);
    const recId: string | null = (item as any)?.recommendationId ?? null;

    if (!recId) {
      console.warn('[Recommendations] No recommendationId for item', id, '— local only');
      return;
    }

    this.invApi.updateRecommendation(recId, 'rejected').subscribe({
      next: (res: any) => {
        if (res?.skipped) {
          console.warn('[Recommendations] Skipped PATCH (no id):', recId);
        } else {
          console.log('[Recommendations] ✅ DB status → rejected:', recId);
        }
      },
      error: err => {
        this.productDecisions.update(d => ({ ...d, [id]: null }));
        console.warn('[Recommendations] PATCH failed (reject):', err?.status, recId);
      },
    });
  }

  undoProductDecision(id: string, e: Event): void {
    e.stopPropagation();
    this.productDecisions.update(d => ({ ...d, [id]: null }));
    // No DB undo for recommendations — there is no 'pending' reset path on the backend.
    // The decision simply clears from local UI state.
  }

  viewFullAnalysis(item: InventoryItem, e: Event): void {
    e.stopPropagation();
    this.analysisModal.set(item);
  }

  closeAnalysisModal(): void {
    this.analysisModal.set(null);
  }

  dismissAlert(id: string): void {
    // X button = gone immediately, no undo
    this._cancelAlertRemoval(id);
    this.alertStatuses.update(s => {
      const copy = { ...s }; delete copy[id]; return copy;
    });
    this.decisions.update(d => {
      const copy = { ...d }; delete copy[id]; return copy;
    });
    this.alerts.update(list => list.filter(a => a.id !== id));
    this.invApi.acknowledgeAlert(id, 'dismissed').subscribe({
      next: (res: any) => {
        if (!res?.skipped) console.log('[Alert] ✅ DB status → dismissed:', id);
      },
      error: err => {
        if (err?.status !== 404) console.warn('[Alert] PATCH failed (dismiss):', err?.status, id);
      },
    });
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
    const api = item as any;
    // True when the decision agent produced a real action (not just a formula fallback).
    // ACTION values from the decision agent: ORDER, EXPEDITE, MONITOR, HOLD.
    const action = api.recommendation as string | null;
    return !!action && ['ORDER', 'EXPEDITE', 'MONITOR', 'HOLD'].includes(action);
  }

  /** Human label for the decision action badge. */
  actionLabel(item: InventoryItem): string {
    const labels: Record<string, string> = {
      ORDER:    'Order',
      EXPEDITE: 'Expedite',
      MONITOR:  'Monitor',
      HOLD:     'Hold',
    };
    return labels[(item as any).recommendation] ?? ((item as any).recommendation ?? '—');
  }

  /** Badge colour for the decision action. */
  actionColor(item: InventoryItem): string {
    const colors: Record<string, string> = {
      ORDER:    '#2D9CDB',
      EXPEDITE: '#E74C3C',
      MONITOR:  '#F9A825',
      HOLD:     '#9CA3AF',
    };
    return colors[(item as any).recommendation] ?? '#9CA3AF';
  }

  /** Badge background for the decision action. */
  actionBg(item: InventoryItem): string {
    const bgs: Record<string, string> = {
      ORDER:    '#E8F4FD',
      EXPEDITE: '#FDEDEC',
      MONITOR:  '#FFF8E1',
      HOLD:     '#F2F4F8',
    };
    return bgs[(item as any).recommendation] ?? '#F2F4F8';
  }

  /** Urgency label for orderTiming. */
  timingLabel(item: InventoryItem): string {
    const labels: Record<string, string> = {
      immediate:  '🔴 Immediate',
      this_week:  '🟠 This week',
      this_month: '🟡 This month',
      none:       '—',
    };
    return labels[(item as any).orderTiming] ?? ((item as any).orderTiming ?? '—');
  }


  // ── Alert timed-removal helpers ─────────────────────────────────────────────

  /**
   * Schedule auto-removal of an alert card after ALERT_UNDO_MS.
   * The user can cancel this by clicking Undo.
   */
  private _scheduleAlertRemoval(id: string): void {
    this._cancelAlertRemoval(id);  // clear any prior timer for this id
    const t = setTimeout(() => {
      this._alertRemovalTimers.delete(id);
      this.alerts.update(list => list.filter(a => a.id !== id));
      this.alertStatuses.update(s => { const c = { ...s }; delete c[id]; return c; });
      this.decisions.update(d => { const c = { ...d }; delete c[id]; return c; });
    }, this.ALERT_UNDO_MS);
    this._alertRemovalTimers.set(id, t);
  }

  /** Cancel a scheduled removal (e.g. user clicked Undo, or DB write failed). */
  private _cancelAlertRemoval(id: string): void {
    const t = this._alertRemovalTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this._alertRemovalTimers.delete(id);
    }
  }

  // ── Alert status / recommendation helpers ───────────────────────────────────────

  /** Returns the local decision status for an alert id, if any. */
  getAlertLocalStatus(id: string): string | null {
    return this.alertStatuses()[id] ?? null;
  }

  /** True when an alert has been acted on (validated, rejected, or error). */
  alertIsDecided(id: string): boolean {
    const s = this.alertStatuses()[id];
    return s === 'validated' || s === 'rejected' || s === 'error';
  }

  /**
   * Short AI recommendation for display on the alert card.
   * Comes from recommended_action (stored in alert.message by _loadDbAlerts).
   */
  alertRecommendation(alert: InventoryAlert): string | null {
    // action = recommended_action from DB (the AI suggestion text)
    const txt = (alert as any).action || (alert as any).message;
    if (!txt) return null;
    return txt.length > 90 ? txt.substring(0, 88) + '…' : txt;
  }

  /** Label + colours for the decided-status badge shown on an alert card. */
  alertStatusBadge(id: string): { label: string; color: string; bg: string; canUndo: boolean } | null {
    const s = this.alertStatuses()[id];
    if (!s) return null;
    switch (s) {
      case 'validated': return { label: '✓ Validated',   color: '#007A63', bg: '#E6FAF4', canUndo: true  };
      case 'rejected':  return { label: '✕ Rejected',    color: '#B45309', bg: '#FFF8E1', canUndo: true  };
      case 'error':     return { label: '⚠ Save failed', color: '#C0392B', bg: '#FDEDEC', canUndo: false };
      default:          return null;
    }
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

    // Mark alert as acknowledged in DB so it doesn't stay pending forever
    if (alert.id && !alert.id.startsWith('alert-')) {
      this.invApi.acknowledgeAlert(alert.id, 'acknowledged').subscribe({
        next: () => console.log('[Alert] acknowledged (ask chat):', alert.id),
        error: err => console.warn('[Alert] PATCH failed (ask chat):', err?.status, alert.id),
      });
    }

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

  // ── Overview dashboard signals ─────────────────────────────────────────────

  coveragePercent = computed(() => {
    const items = this.items();
    if (!items.length) return 0;
    return Math.round(items.filter(i => i.coverageRatio >= 1.0).length / items.length * 100);
  });

  coverageByCategory = computed(() => {
    const catMap = new Map<string, { total: number; count: number }>();
    for (const item of this.items()) {
      const cat = String((item as any).category || 'Autre');
      const prev = catMap.get(cat) ?? { total: 0, count: 0 };
      const days = (item as any).daysOfStock != null ? +(item as any).daysOfStock : item.coverageRatio * 7;
      catMap.set(cat, { total: prev.total + days, count: prev.count + 1 });
    }
    return Array.from(catMap.entries())
      .map(([category, { total, count }]) => {
        const avgDays = Math.round((total / count) * 10) / 10;
        return {
          category,
          avgDays,
          pct: Math.min(Math.round(avgDays / 12 * 100), 100),
          color: avgDays < 2 ? '#E74C3C' : avgDays < 5 ? '#F9A825' : '#27AE60',
        };
      })
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 5);
  });

  stockDonut = computed(() => {
    const items = this.items();
    const total = Math.max(items.length, 1);
    const critical = items.filter(i => i.riskLevel === 'critical').length;
    const high     = items.filter(i => i.riskLevel === 'high').length;
    const overstk  = items.filter(i => (i as any).overstockFlag || i.stock >= 999).length;
    const optimal  = items.filter(i => i.riskLevel === 'ok' && i.coverageRatio >= 1.5 && i.stock < 999).length;
    const faible   = Math.max(total - critical - high - overstk - optimal, 0);
    const R = 54;
    const C = 2 * Math.PI * R;
    const cats = [
      { label: 'Stock optimal',   count: optimal,  color: '#27AE60' },
      { label: 'Risque élevé',    count: high,     color: '#F9A825' },
      { label: 'Surstock',        count: overstk,  color: '#2D9CDB' },
      { label: 'Faible activité', count: faible,   color: '#CBD5E0' },
      { label: 'Rupture',         count: critical, color: '#E74C3C' },
    ];
    let cum = 0;
    return cats.filter(s => s.count > 0).map(s => {
      const arc = (s.count / total) * C;
      const dashOffset = (C - cum).toFixed(1);
      cum += arc;
      return { ...s, pct: Math.round(s.count / total * 100), dashArray: `${arc.toFixed(1)} ${C.toFixed(1)}`, dashOffset };
    });
  });

  topAtRisk = computed(() =>
    [...this.items()]
      .filter(i => i.stock < 999)
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, ok: 3 };
        const ra = order[a.riskLevel] ?? 3;
        const rb = order[b.riskLevel] ?? 3;
        return ra !== rb ? ra - rb : a.coverageRatio - b.coverageRatio;
      })
      .slice(0, 5)
  );

  invRecs = computed(() => {
    const items = this.items();
    const recs: { icon: string; title: string; desc: string }[] = [];
    const critical = items.filter(i => i.riskLevel === 'critical');
    const high     = items.filter(i => i.riskLevel === 'high');
    const overstk  = items.filter(i => (i as any).overstockFlag || i.stock >= 999);
    if (critical.length || high.length) {
      const item = critical[0] ?? high[0];
      recs.push({ icon: 'transfer', title: 'Transférer du stock', desc: `Transférer ${(item as any).formulaOrderQty || 5} unités de ${item.name} depuis FR LAC1 vers FR LAC2` });
    }
    if (high.length) {
      const item = high[0];
      recs.push({ icon: 'reorder', title: 'Réapprovisionnement recommandé', desc: `Commander ${(item as any).formulaOrderQty || 8} unités de ${item.name} (couverture < 2 jours)` });
    }
    if (overstk.length) {
      const item = overstk[0];
      recs.push({ icon: 'promo', title: 'Promouvoir pour écouler le surstock', desc: `Lancer une promo sur ${item.name} (${item.stock} unités en surstock)` });
    }
    if (!recs.length) recs.push({ icon: 'reorder', title: 'Stock sain', desc: 'Aucune action urgente. Surveillance habituelle recommandée.' });
    return recs;
  });

  lastUpdateTime = computed(() => {
    const lu = this.lastUpdate();
    return (lu ?? new Date()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  });

  coverageDays(item: InventoryItem): string {
    const d = (item as any).daysOfStock;
    return d != null ? `${(+d).toFixed(1)}j` : `${(item.coverageRatio * 7).toFixed(1)}j`;
  }

  alertBadgeFr(alert: InventoryAlert): string {
    if (alert.type === 'rupture') return 'Rupture probable';
    if (alert.type === 'overstock') return 'Surstock';
    return alert.urgency === 'critical' ? 'Stock critique' : alert.urgency === 'high' ? 'Risque élevé' : 'Stock faible';
  }

  formatAlertTime(timeStr: string): string {
    if (!timeStr) return '';
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {}
    return String(timeStr).substring(0, 5);
  }

  alertProductName(alert: InventoryAlert): string {
    const item = this.items().find(i => i.sku === alert.sku);
    if (item?.name) return item.name;
    const msg = String(alert.message ?? '');
    const idx = msg.indexOf(':');
    return idx > -1 ? msg.substring(idx + 1).trim() : msg;
  }

  alertSubFr(alert: InventoryAlert): string {
    const item = this.items().find(i => i.sku === alert.sku);
    if (!item) return alert.sku ?? '';
    if (alert.type === 'rupture') return `Stock disponible : ${item.stock} unité${item.stock !== 1 ? 's' : ''}`;
    if (alert.type === 'overstock') return `Surstock : ${item.stock} unités`;
    return `Couverture : ${this.coverageDays(item)}`;
  }

  productInitials(item: InventoryItem): string {
    const name = String(item.name ?? item.sku ?? '?');
    return name.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase();
  }

  // ── New design helpers ──────────────────────────────────────────────────────

  kpiStatus(type: 'critical' | 'high' | 'ok' | 'coverage' | 'total'): { label: string; color: string } {
    switch (type) {
      case 'critical': return this.criticalCount() === 0
        ? { label: 'Excellent', color: '#27AE60' }
        : { label: 'Critique', color: '#E74C3C' };
      case 'high': return this.highCount() === 0
        ? { label: 'Sous contrôle', color: '#27AE60' }
        : { label: 'Attention', color: '#F9A825' };
      case 'ok': return this.okCount() > 0
        ? { label: 'Excellent', color: '#27AE60' }
        : { label: 'Insuffisant', color: '#94A3B8' };
      case 'coverage': {
        const v = parseFloat(String(this.avgCoverage()));
        return isNaN(v) ? { label: '—', color: '#94A3B8' }
          : v >= 2.0 ? { label: 'Bon', color: '#27AE60' }
          : v >= 1.0 ? { label: 'Correct', color: '#F9A825' }
          : { label: 'Insuffisant', color: '#E74C3C' };
      }
      case 'total': return { label: '100%', color: '#6C5CE7' };
    }
  }

  alertStockCount(alert: InventoryAlert): number {
    return this.items().find(i => i.sku === alert.sku)?.stock ?? 0;
  }

  alertUrgencyLabel(alert: InventoryAlert): string {
    if (alert.type === 'rupture') return 'Rupture imminente';
    if (alert.type === 'overstock') return 'Surstock';
    return 'À risque';
  }

  alertUrgencyColor(alert: InventoryAlert): string {
    if (alert.type === 'rupture' || alert.urgency === 'critical') return '#E74C3C';
    return '#F9A825';
  }

  alertUrgencyBg(alert: InventoryAlert): string {
    if (alert.type === 'rupture' || alert.urgency === 'critical') return '#FDEDEC';
    return '#FFF8E1';
  }

  riskBadgeFr(riskLevel: string): string {
    if (riskLevel === 'critical') return 'Critique';
    if (riskLevel === 'high') return 'À risque';
    return 'Correct';
  }

  recImpact(rec: { icon: string }): { label: string; color: string; bg: string } {
    if (rec.icon === 'transfer') return { label: 'Impact élevé', color: '#27AE60', bg: '#E8F8F5' };
    if (rec.icon === 'promo')    return { label: 'Impact moyen', color: '#F9A825', bg: '#FFF8E1' };
    return { label: 'Impact moyen', color: '#6C5CE7', bg: '#F0ECFD' };
  }

  quadrantDotColor(p: InventoryItem): string {
    switch (this.quadrantZone(p)) {
      case 'star':      return '#27AE60';
      case 'stockout':  return '#E74C3C';
      case 'ok':        return '#94A3B8';
      case 'overstock': return '#F9A825';
    }
  }

  coverageByCategoryRatio = computed(() => {
    const catMap = new Map<string, { totalRatio: number; count: number }>();
    for (const item of this.items()) {
      const cat = String((item as any).category || 'Autre');
      const prev = catMap.get(cat) ?? { totalRatio: 0, count: 0 };
      catMap.set(cat, { totalRatio: prev.totalRatio + item.coverageRatio, count: prev.count + 1 });
    }
    return Array.from(catMap.entries())
      .map(([category, { totalRatio, count }]) => {
        const r = Math.round((totalRatio / count) * 10) / 10;
        const pct = Math.min(Math.round(r / 3 * 100), 100);
        const color = r < 0.5 ? '#E74C3C' : r < 1.0 ? '#F9A825' : '#27AE60';
        const statusLabel = r >= 1.5 ? 'Optimal' : r >= 1.0 ? 'Correct' : 'À risque';
        return { category, r, pct, color, statusLabel };
      })
      .sort((a, b) => b.r - a.r)
      .slice(0, 4);
  });

  stockDonutSimple = computed(() => {
    const items = this.items();
    const total = Math.max(items.length, 1);
    const critical = items.filter(i => i.riskLevel === 'critical').length;
    const atRisk   = items.filter(i => i.riskLevel === 'high').length;
    const optimal  = Math.max(total - critical - atRisk, 0);
    const R = 54, C = 2 * Math.PI * R;
    const cats = [
      { label: 'Optimal',  count: optimal,  color: '#27AE60' },
      { label: 'À risque', count: atRisk,   color: '#F9A825' },
      { label: 'Critique', count: critical, color: '#E74C3C' },
    ];
    let cum = 0;
    return cats.filter(s => s.count > 0).map(s => {
      const arc = (s.count / total) * C;
      const off = (C - cum).toFixed(1);
      cum += arc;
      return { ...s, pct: Math.round(s.count / total * 100), dashArray: `${arc.toFixed(1)} ${C.toFixed(1)}`, dashOffset: off };
    });
  });

}