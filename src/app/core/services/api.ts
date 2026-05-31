import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

const API = 'http://localhost:8000';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ── Auth headers ──────────────────────────────────────────────────────────
  private _headers(): HttpHeaders {
    const token = sessionStorage.getItem('ooredoo_token');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Store / Dashboard
  // ══════════════════════════════════════════════════════════════════════════

  getStoreMetrics(storeId: string): Observable<any> {
    return this.http
      .get(`${API}/api/v1/stores/${storeId}/metrics`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  getAdvisors(storeId: string): Observable<any> {
    return this.http
      .get(`${API}/api/v1/stores/${storeId}/advisors`, { headers: this._headers() })
      .pipe(catchError(() => of({ advisors: [] })));
  }

  getForecastEOD(storeId: string): Observable<any> {
    return this.http
      .get(`${API}/api/v1/forecast/eod/${storeId}`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  getLiveAnalysis(storeId: string): Observable<any> {
    return this.http
      .get(`${API}/api/v1/stores/${storeId}/live-analysis`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  simulatePOS(storeId: string): Observable<any> {
    return this.http
      .post(`${API}/api/v1/stores/${storeId}/simulate-pos`, {}, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  triggerCycle(storeId: string): Observable<any> {
    return this.http
      .post(`${API}/api/v1/cycle/trigger`, { store_id: storeId }, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Agent Coach + RAG
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Envoie un message au Coach Agent LangGraph.
   * Utilise le contexte live (gap, urgence, stratège, météo).
   */
  sendCoachMessage(payload: {
    message:      string;
    advisor_name: string;
    store_id:     string;
    context:      {
      current_revenue?:   number;
      daily_target?:      number;
      gap_pct?:           number;
      urgency?:           string;
      analyst_summary?:   string;
      strategie?:         string;
      strategie_actions?: any[];
      cause_racine?:      string;
      focus_produits?:    string[];
      weather?:           string;
      forecast_eod?:      number;
      nb_ventes?:         number;
    };
  }): Observable<{
    reply:       string;
    source:      string;
    rag_used:    boolean;
    confidence?: number;
    nb_scripts?: number;
    timestamp:   string;
  }> {
    return this.http
      .post<any>(`${API}/api/v1/coach/chat`, payload, { headers: this._headers() })
      .pipe(catchError(() => of({
        reply:     'Coach temporairement indisponible. Réessayez dans un instant.',
        source:    'fallback',
        rag_used:  false,
        timestamp: new Date().toISOString(),
      })));
  }

  /**
   * Historique des interactions d'un conseiller.
   */
  getCoachHistory(advisorName: string, limit = 10): Observable<any> {
    return this.http
      .get(`${API}/api/v1/coach/history/${encodeURIComponent(advisorName)}?limit=${limit}`,
           { headers: this._headers() })
      .pipe(catchError(() => of({ history: [], total: 0 })));
  }

  /**
   * Statistiques du Coach Agent.
   */
  getCoachStats(): Observable<any> {
    return this.http
      .get(`${API}/api/v1/coach/stats`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Monitoring Agent
  // ══════════════════════════════════════════════════════════════════════════

  getMonitoringHealth(): Observable<any> {
    return this.http
      .get(`${API}/api/monitoring/health`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  getMonitoringCycles(limit = 20, storeId = 'I63'): Observable<any> {
    return this.http
      .get(`${API}/api/monitoring/cycles?limit=${limit}&store_id=${storeId}`,
           { headers: this._headers() })
      .pipe(catchError(() => of({ cycles: [] })));
  }

  getMonitoringErrors(limit = 50, storeId = 'I63'): Observable<any> {
    return this.http
      .get(`${API}/api/monitoring/errors?limit=${limit}&store_id=${storeId}`,
           { headers: this._headers() })
      .pipe(catchError(() => of({ errors: [] })));
  }

  getMonitoringStats(storeId = 'I63', hours = 24): Observable<any> {
    return this.http
      .get(`${API}/api/monitoring/stats?store_id=${storeId}&hours=${hours}`,
           { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  getMonitoringLogs(params: {
    limit?:   number;
    storeId?: string;
    agent?:   string;
    status?:  string;
  } = {}): Observable<any> {
    const { limit = 100, storeId = 'I63', agent = '', status = '' } = params;
    let url = `${API}/api/monitoring/logs?limit=${limit}&store_id=${storeId}`;
    if (agent)  url += `&agent=${agent}`;
    if (status) url += `&status=${status}`;
    return this.http
      .get(url, { headers: this._headers() })
      .pipe(catchError(() => of({ logs: [] })));
  }

  getRagStats(storeId = 'I63', limit = 50): Observable<any> {
    return this.http
      .get(`${API}/api/monitoring/rag-stats?store_id=${storeId}&limit=${limit}`,
           { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  resolveError(errorId: number): Observable<any> {
    return this.http
      .post(`${API}/api/monitoring/errors/${errorId}/resolve`, {},
            { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Inventory
  // ══════════════════════════════════════════════════════════════════════════

  getInventory(storeId: string): Observable<any> {
    return this.http
      .get(`${API}/api/inventory/store/${storeId}`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Get inventory alerts for a store.
   *
   * NOTE: Use InventoryApiService.getAlerts() instead of this method when you need
   * full typed responses or status filtering.  This method exists for legacy callers
   * and delegates to the same backend endpoint.
   *
   * @param storeId  Store identifier (e.g. 'I63')
   * @param status   Filter: 'pending' (default), 'all', or any specific status
   */
  getInventoryAlerts(storeId: string, status = 'pending'): Observable<any> {
    return this.http
      .get(`${API}/api/inventory/alerts/${storeId}`, {
        headers: this._headers(),
        params:  { status },
      })
      .pipe(catchError(() => of({ alerts: [] })));
  }

  /**
   * Validate or reject a specific alert.
   * alertId must be the UUID returned by getInventoryAlerts (alert.id).
   *
   * @param alertId   Real DB UUID
   * @param status    'acknowledged' | 'validated' | 'rejected' | 'resolved' | 'dismissed'
   * @param decidedBy Optional user identifier
   */
  updateInventoryAlert(
    alertId: string,
    status: 'acknowledged' | 'validated' | 'rejected' | 'resolved' | 'dismissed',
    decidedBy?: string,
  ): Observable<any> {
    // Fake ids (alert-rupture-SKU123) can't be PATCH'd — return a no-op
    if (!alertId || alertId.startsWith('alert-')) {
      console.warn('[Alerts] Skipping PATCH — fake alert id:', alertId);
      return of({ skipped: true, reason: 'fake_id' });
    }
    const body: Record<string, string> = { status };
    if (decidedBy) body['decided_by'] = decidedBy;
    return this.http
      .patch(`${API}/api/inventory/alerts/${alertId}`, body, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Auth
  // ══════════════════════════════════════════════════════════════════════════

  getAuthUsers(): Observable<any> {
    return this.http
      .get(`${API}/api/auth/users`, { headers: this._headers() })
      .pipe(catchError(() => of({ users: [] })));
  }

  cleanSessions(): Observable<any> {
    return this.http
      .get(`${API}/api/auth/sessions/clean`, { headers: this._headers() })
      .pipe(catchError(() => of(null)));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Health
  // ══════════════════════════════════════════════════════════════════════════

  getHealth(): Observable<any> {
    return this.http
      .get(`${API}/health`)
      .pipe(catchError(() => of({ status: 'offline' })));
  }
}