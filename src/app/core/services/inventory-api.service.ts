import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { InventoryItem, InventoryAlert } from '../models/inventory';

export interface InventoryApiItem extends InventoryItem {
  store_id:               string;
  business_objective:     string;
  unitCost:               number;
  moq:                    number;
  // Coverage / timing
  daysOfStock:            number;
  leadTimeDays:           number;
  coverageRatio:          number;
  // APICS metrics
  reorderPoint:           number;
  safetyStock:            number;
  safetyStockCostDt:      number;
  eoq:                    number;
  formulaOrderQty:        number;
  totalReplenishmentCost: number;
  holdingCostPerCycleDt:  number;
  effectiveServiceLevel:  number;
  zScore:                 number;
  // Risk
  overstockFlag:          boolean;
  riskRationale:          string;
  // Constraints
  moqIsBinding:           boolean;
  moqBindingNote:         string;
  highCostFlag:           boolean;
  highHoldingFlag:        boolean;
  // LLM note
  analystNote:            string;
  // Decision Agent placeholders (null until that agent is wired)
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
}

export interface SingleAnalysisPayload {
  raw:  unknown;
  item: InventoryApiItem;
}

@Injectable({ providedIn: 'root' })
export class InventoryApiService {

  private readonly http = inject(HttpClient);
  private readonly base = 'http://localhost:8000/api/inventory';

  getStores(): Observable<string[]> {
    return this.http.get<{ stores: string[] }>(`${this.base}/stores`)
      .pipe(map(r => r.stores));
  }

  getSkus(storeId?: string): Observable<string[]> {
    const params = storeId ? new HttpParams().set('store_id', storeId) : undefined;
    return this.http.get<{ skus: string[] }>(`${this.base}/skus`, { params })
      .pipe(map(r => r.skus));
  }

  getStore(storeId: string, objective = 'balanced'): Observable<StorePayload> {
    const params = new HttpParams().set('business_objective', objective);
    return this.http.get<StorePayload>(`${this.base}/store/${storeId}`, { params });
  }

  getSummary(storeId: string, objective = 'balanced'): Observable<InventorySummary> {
    return this.getStore(storeId, objective).pipe(map(r => r.summary));
  }

  analyzeSku(sku: string, storeId = 'STORE-001', objective = 'balanced'): Observable<SingleAnalysisPayload> {
   
    return this.http.post<SingleAnalysisPayload>(`${this.base}/analyze`, {
      sku,
      store_id:           storeId,
      business_objective: objective,
    });
  }
}