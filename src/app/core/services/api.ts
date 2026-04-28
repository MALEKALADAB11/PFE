import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = 'http://localhost:8000/api/v1';
  private requestTimeout = 10000; // 10 seconds

  constructor(private http: HttpClient) {}

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