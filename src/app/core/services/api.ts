import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = 'http://localhost:8000/api/v1';
  private requestTimeout = 10000; // 10 seconds

  constructor(private http: HttpClient) {}

  private base            = 'http://localhost:8000/api/v1';
  private inventoryBase   = 'http://localhost:8000/api/inventory';
  private requestTimeout  = 10000;

  constructor(private http: HttpClient) {}

  // ── Sales endpoints ───────────────────────────────────────────────────────

  getStoreMetrics(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/metrics`)
      .pipe(timeout(this.requestTimeout));
  }

  getAdvisors(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/advisors`)
      .pipe(timeout(this.requestTimeout));
  }

  getContext(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/context`)
      .pipe(timeout(this.requestTimeout));
  }

  getLiveAnalysis(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/live-analysis`)
      .pipe(timeout(this.requestTimeout));
  }

  getForecastEOD(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/forecast/eod/${storeId}`)
      .pipe(timeout(this.requestTimeout));
  }

  getForecastHourly(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/forecast/hourly/${storeId}`)
      .pipe(timeout(this.requestTimeout));
  }

  simulatePOS(storeId: string): Observable<any> {
    return this.http.post(`${this.base}/stores/${storeId}/simulate`, {})
      .pipe(timeout(this.requestTimeout));
  }

  resetDay(storeId: string): Observable<any> {
    return this.http.post(`${this.base}/stores/${storeId}/reset`, {})
      .pipe(timeout(this.requestTimeout));
  }

  triggerCycle(storeId: string): Observable<any> {
    return this.http.post(`${this.base}/cycle/trigger?store_id=${storeId}`, {})
      .pipe(timeout(this.requestTimeout));
  }

  getCycleStatus(): Observable<any> {
    return this.http.get(`${this.base}/cycle/status`)
      .pipe(timeout(this.requestTimeout));
  }

  coachChat(payload: {
    message:      string;
    advisor_name: string;
    store_id:     string;
    context:      any;
  }) {
    return this.http.post<{
      reply:     string;
      source:    string;
      timestamp: string;
    }>(`${this.base}/coach/chat`, payload)
      .pipe(timeout(this.requestTimeout));
}
  }

  // ── Inventory endpoints (données réelles stock_centre.xls) ───────────────

  /**
   * Récupère le snapshot inventaire d'un store depuis le backend.
   * Utilise les vraies données stock_centre.xls importées.
   * storeId doit être le CD_DIST réel: 'STORE-001' pour I63.
   */
  getInventorySnapshot(
    storeId: string,
    objective: 'balanced' | 'aggressive' | 'conservative' = 'balanced'
  ): Observable<any> {
    return this.http.get(
      `${this.inventoryBase}/store/${storeId}?business_objective=${objective}`
    ).pipe(timeout(this.requestTimeout));
  }

  /**
   * Récupère les alertes stock critiques pour un store.
   */
  getInventoryAlerts(storeId: string): Observable<any> {
    return this.http.get(`${this.inventoryBase}/alerts/${storeId}`)
      .pipe(timeout(this.requestTimeout));
  }

  /**
   * Récupère le forecast de demande par SKU (TimesFM).
   */
  getInventoryForecast(storeId: string): Observable<any> {
    return this.http.get(`${this.inventoryBase}/forecast/${storeId}`)
      .pipe(timeout(this.requestTimeout));
  }
}