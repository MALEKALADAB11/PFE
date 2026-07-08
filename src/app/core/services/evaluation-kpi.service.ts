import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/** Agrégats d'adoption des recommandations IA (boucle de feedback). */
export interface AdoptionStats {
  window_days: number;
  incitations: { followed: number; ignored: number; follow_rate: number | null };
  hitl: { approved: number; rejected: number; pending: number; approval_rate: number | null };
  po: { suggested: number; accepted: number; cancelled: number; adoption_rate: number | null };
  recent_rejections: string[];
}

export interface EvaluationKpis {
  window_days: number;
  store_id: string;
  adoption: AdoptionStats;
  stock: {
    total_skus: number;
    ruptures: number;
    critiques: number;
    bas: number;
    taux_rupture_pct: number | null;
  };
  sales: {
    total_ca: number;
    total_target: number | null;
    attainment_pct: number | null;
    daily_avg_ca: number;
    days_with_sales: number;
    daily: { date: string; ca: number }[];
  };
}

export interface ForecastBenchmark {
  sku: number;
  store_id: string;
  holdout_days: number;
  engines: Record<string, { engine_used?: string; wape_pct?: number; smape_pct?: number; bias_pct?: number; error?: string }>;
  ranking_by_wape: { engine: string; wape_pct: number }[];
  best_engine: string | null;
  note: string;
}

/**
 * KPIs d'évaluation du système agentique (backend /api/v1/kpis).
 * Alimente le panneau "Évaluation" : adoption des recommandations,
 * santé du stock, atteinte d'objectif, benchmark des moteurs forecast.
 */
@Injectable({ providedIn: 'root' })
export class EvaluationKpiService {
  private baseUrl = `${environment.apiUrl}/api/v1/kpis`;
  private feedbackUrl = `${environment.apiUrl}/api/v1/feedback`;
  private requestTimeout = 15000;

  private _kpis = signal<EvaluationKpis | null>(null);
  kpis = computed(() => this._kpis());

  constructor(private http: HttpClient) {}

  fetchKpis(storeId?: string, days = 30): void {
    const params: Record<string, string> = { days: String(days) };
    if (storeId) params['store_id'] = storeId;
    this.http.get<EvaluationKpis>(this.baseUrl, { params })
      .pipe(timeout(this.requestTimeout))
      .subscribe({
        next: (data) => this._kpis.set(data),
        error: (err) => console.error('❌ KPIs évaluation indisponibles:', err),
      });
  }

  /** Benchmark forecast — appel long (TimesFM) : timeout étendu. */
  fetchForecastBenchmark(storeId?: string, sku?: number, includeTimesfm = false): Observable<ForecastBenchmark> {
    const params: Record<string, string> = { include_timesfm: String(includeTimesfm) };
    if (storeId) params['store_id'] = storeId;
    if (sku != null) params['sku'] = String(sku);
    return this.http.get<ForecastBenchmark>(`${this.baseUrl}/forecast-benchmark`, { params })
      .pipe(timeout(includeTimesfm ? 300000 : 60000));
  }

  /** Le conseiller déclare avoir suivi/ignoré une incitation du coach. */
  sendIncitationFeedback(storeId: string, decision: 'followed' | 'ignored',
                         refId?: string, actionType?: string, reason?: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.feedbackUrl, {
      store_id: storeId,
      source: 'incitation',
      decision,
      ref_id: refId ?? null,
      action_type: actionType ?? null,
      reason: reason ?? null,
    }).pipe(timeout(this.requestTimeout));
  }
}
