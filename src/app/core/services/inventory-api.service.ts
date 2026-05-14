import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { InventoryItem, InventoryAlert } from '../models/inventory';

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
  recommendation:         string | null;
  recommendationDetail:   string | null;
  finalOrderQty:          number | null;
  orderTiming:            string | null;
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
  private readonly base = 'http://localhost:8000/api/inventory';

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
}