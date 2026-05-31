import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval } from 'rxjs';
import { timeout } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MonitoringService {
  private baseUrl = 'http://localhost:8000/api/monitoring';
  private requestTimeout = 10000;

  // ── Signals for reactive state ──
  private _kpis = signal<any>({
    healthy: 0,
    running: 0,
    failed: 0,
    avg_latency: 0,
    cost_today_tnd: 0,
  });

  // ── Expose computed signal ──
  kpis = computed(() => this._kpis());

  constructor(private http: HttpClient) {
    this.startRealTimeUpdates();
  }

  // ══════════════════════════════════════════════════════════════
  // REAL API CALLS (Backend Integration)
  // ══════════════════════════════════════════════════════════════

  fetchKPIs() {
    this.http.get(`${this.baseUrl}/kpis`)
      .pipe(timeout(this.requestTimeout))
      .subscribe({
        next: (data: any) => {
          this._kpis.set(data);
          console.log('✅ KPIs loaded from backend:', data);
        },
        error: (err) => {
          console.error('❌ Failed to load KPIs:', err);
          // Fallback to mock data if backend is down
          this._kpis.set({
            healthy: 6,
            running: 1,
            failed: 0,
            avg_latency: 2.3,
            cost_today_tnd: 12.45,
          });
        }
      });
  }

  fetchAgentPerformance() {
    return this.http.get(`${this.baseUrl}/performance`)
      .pipe(timeout(this.requestTimeout));
  }

  fetchAgentCosts() {
    return this.http.get(`${this.baseUrl}/costs`)
      .pipe(timeout(this.requestTimeout));
  }

  fetchAgentHealth(agentId: string) {
    return this.http.get(`${this.baseUrl}/health/${agentId}`)
      .pipe(timeout(this.requestTimeout));
  }

  fetchExecutionTimeline() {
    return this.http.get(`${this.baseUrl}/timeline`)
      .pipe(timeout(this.requestTimeout));
  }

  fetchFailurePrediction() {
    return this.http.get(`${this.baseUrl}/predict`)
      .pipe(timeout(this.requestTimeout));
  }

  fetchAgentDependencies() {
    return this.http.get(`${this.baseUrl}/dependencies`)
      .pipe(timeout(this.requestTimeout));
  }

  // ══════════════════════════════════════════════════════════════
  // REAL-TIME UPDATES (Auto-refresh every 30 seconds)
  // ══════════════════════════════════════════════════════════════

  private startRealTimeUpdates() {
    // Initial load
    this.fetchKPIs();

    // Auto-refresh every 30 seconds
    interval(30000).subscribe(() => {
      this.fetchKPIs();
      console.log('🔄 Monitoring data refreshed');
    });
  }
}