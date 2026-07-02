import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
import { InventoryItem, InventoryAlert } from '../models/inventory';
import { environment } from '../../../environments/environment';

export interface InventoryApiItem extends InventoryItem {
  store_id:               string;
  business_objective:     string;
  unitCost:               number;
  moq:                    number;
  daysOfStock:            number;
  leadTimeDays:           number;
  coverageRatio:          number;
  reorderPoint:           number;
  safetyStock:            number;
  safetyStockCostDt:      number;
  eoq:                    number;
  formulaOrderQty:        number;
  totalReplenishmentCost: number;
  holdingCostPerCycleDt:  number;
  effectiveServiceLevel:  number;
  zScore:                 number;
  overstockFlag:          boolean;
  riskRationale:          string;
  moqIsBinding:           boolean;
  moqBindingNote:         string;
  highCostFlag:           boolean;
  highHoldingFlag:        boolean;
  analystNote:            string;
  recommendation:         string | null;   // ORDER | EXPEDITE | MONITOR | HOLD
  recommendationDetail:   string | null;   // operator-facing prose from decision agent
  recommendationId:       string | null;   // inv.recommendations UUID — use with PATCH /recommendations/{id}
  recommendationStatus:   string | null;   // current DB status: pending | approved | rejected
  finalOrderQty:          number | null;   // decision agent's confirmed order qty
  orderTiming:            string | null;   // immediate | this_week | this_month | none
  // Extended decision agent fields
  decisionConfidence:     string | null;   // high | medium | low
  escalateToHuman:        boolean;
  escalationReason:       string | null;
  tradeOffs:              string | null;
}

export interface InventorySummary {
  totalSkus:        number;
  criticalCount:    number;
  highCount:        number;
  okCount:          number;
  allOk:            boolean;
  avgCoverageRatio: number;
  backLines:        string[];
}

export interface StorePayload {
  store_id:           string;
  business_objective: string;
  items:              InventoryApiItem[];
  alerts:             InventoryAlert[];
  summary:            InventorySummary;
  // pagination (present when page_size > 0)
  page?:              number;
  page_size?:         number;
  total_pages?:       number;
  total_skus?:        number;
}

export interface SingleAnalysisPayload {
  raw:  unknown;
  item: InventoryApiItem;
}

@Injectable({ providedIn: 'root' })
export class InventoryApiService {

  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/inventory`;

  private _headers(): HttpHeaders {
    const token = sessionStorage.getItem('ooredoo_token');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  getStores(): Observable<{ id: string; name: string }[]> {
    return this.http.get<{ stores: { id: string; name: string }[] }>(`${this.base}/stores`)
      .pipe(map(r => r.stores ?? []));
  }

  getSkus(storeId?: string): Observable<string[]> {
    const params = storeId ? new HttpParams().set('store_id', storeId) : undefined;
    return this.http.get<{ skus: string[] }>(`${this.base}/skus`, { params })
      .pipe(map(r => r.skus));
  }

  /**
   * Fetch the full store payload.
   * Uses page_size=0 by default so ALL items are returned (no pagination cap).
   * Pass page_size > 0 only if you intentionally want a subset.
   */
  getStore(
    storeId: string,
    objective = 'balanced',
    pageSize  = 0,          // 0 = all items
  ): Observable<StorePayload> {
    const params = new HttpParams()
      .set('business_objective', objective)
      .set('page_size', String(pageSize));
    return this.http.get<StorePayload>(`${this.base}/store/${storeId}`, { params });
  }

  getSummary(storeId: string, objective = 'balanced'): Observable<InventorySummary> {
    return this.http.get<InventorySummary>(`${this.base}/summary/${storeId}`, {
      params: new HttpParams().set('business_objective', objective),
    });
  }

  analyzeSku(sku: string, storeId = 'I63', objective = 'balanced'): Observable<SingleAnalysisPayload> {
    return this.http.post<SingleAnalysisPayload>(`${this.base}/analyze`, {
      sku,
      store_id:           storeId,
      business_objective: objective,
    });
  }

  // ── Business Objectives ────────────────────────────────────────────────────

  getObjectives(): Observable<{ objectives: any[]; count: number }> {
    return this.http.get<{ objectives: any[]; count: number }>(`${this.base}/objectives`);
  }

  setActiveObjective(label: string): Observable<any> {
    return this.http.put(`${this.base}/objectives/active`, { label });
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  getAlerts(storeId: string, status = 'pending'): Observable<{ alerts: any[]; count: number }> {
    const params = new HttpParams().set('status', status);
    return this.http.get<{ alerts: any[]; count: number }>(`${this.base}/alerts/${storeId}`, { params });
  }

  /**
   * Update an alert's status.
   *
   * @param alertId UUID from GET /alerts/{storeId} → alert.id  (must be a real DB UUID)
   * @param status  'acknowledged' | 'validated' | 'rejected' | 'resolved' | 'dismissed'
   */
  acknowledgeAlert(
    alertId: string,
    status: 'acknowledged' | 'validated' | 'rejected' | 'resolved' | 'dismissed' = 'acknowledged',
  ): Observable<any> {
    // Fake ids (alert-rupture-SKU123) can't be PATCH'd — return a no-op
    if (!alertId || alertId.startsWith('alert-')) {
      console.warn('[Alerts] Skipping PATCH — fake alert id:', alertId);
      return of({ skipped: true, reason: 'fake_id' });
    }
    return this.http.patch(
      `${this.base}/alerts/${alertId}`,
      { status },
      { headers: this._headers() },
    );
  }

  /**
   * Update a recommendation's status.
   *
   * @param recommendationId UUID from the item's 'recommendationId' field (inv.recommendations)
   * @param status           'approved' | 'rejected'
   * @param decidedBy        Optional user identifier
   */
  updateRecommendation(
    recommendationId: string,
    status: 'approved' | 'rejected',
    decidedBy?: string,
  ): Observable<any> {
    if (!recommendationId) {
      console.warn('[Recommendations] Skipping PATCH — no recommendationId');
      return of({ skipped: true, reason: 'no_id' });
    }
    const body: Record<string, string> = { status };
    if (decidedBy) body['decided_by'] = decidedBy;
    return this.http.patch(
      `${this.base}/recommendations/${recommendationId}`,
      body,
      { headers: this._headers() },
    );
  }
}