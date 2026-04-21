import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {

  private base = 'http://localhost:8000/api/v1';

  constructor(private http: HttpClient) {}

  getStoreMetrics(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/metrics`);
  }

  getAdvisors(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/stores/${storeId}/advisors`);
  }

  getForecastEOD(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/forecast/eod/${storeId}`);
  }

  getForecastHourly(storeId: string): Observable<any> {
    return this.http.get(`${this.base}/forecast/hourly/${storeId}`);
  }

  simulatePOS(storeId: string): Observable<any> {
    return this.http.post(`${this.base}/stores/${storeId}/simulate`, {});
  }

  // ── APP02 — déclencher un cycle agent ────────────────
  triggerCycle(storeId: string): Observable<any> {
    return this.http.post(
      `${this.base}/cycle/trigger?store_id=${storeId}`, {}
    );
  }

  getCycleStatus(): Observable<any> {
    return this.http.get(`${this.base}/cycle/status`);
  }
}