import {
  Component, signal, computed, AfterViewInit,
  ViewChild, ElementRef, OnDestroy, OnInit, inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MonitoringService } from '../../core/services/monitoring.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { Chart, registerables } from 'chart.js';
import { SankeyController, Flow } from 'chartjs-chart-sankey';

Chart.register(...registerables, SankeyController, Flow);

type AgentStatus = 'LIVE' | 'ACTIVE' | 'DONE' | 'RUN' | 'ERROR' | 'IDLE' | 'WAIT';
// 'coaching' = agents sales-module (agent_logs) · 'inventory' = agents inventory-module
// (inventory.agent_runs) · 'support' = RAG partagé. Pas de layer 'preload'/'orchestrator' :
// aucun agent réel de ce type n'existe dans le code (pas de watcher/orchestrateur instrumenté).
type AgentLayer = 'coaching' | 'inventory' | 'support';

interface AgentLog {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  node?: string;
}

interface AgentDetail {
  id: string;
  name: string;
  appId: string;
  layer: AgentLayer;
  status: AgentStatus;
  latency: number;
  lastRun: string;
  description: string;
  // Architecture spec (statique — documentation de conception)
  inputs: string[];
  outputs: string[];
  stateFields: string[];
  // Données live (agent_logs ou inventory.agent_runs)
  logs: AgentLog[];
  metrics: { label: string; value: string; color?: string; }[];
  hasTelemetry: boolean;
  totalRuns?: number;
  successRate?: number;
  // 'node' = I/O par étape LangGraph (agent_logs JSONB) · 'run' = résumé d'exécution
  // (inventory.agent_runs n'a pas de JSONB input/output, seulement des compteurs).
  granularity?: 'node' | 'run';
  lastInput?: Record<string, any>;
  lastOutput?: Record<string, any>;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monitoring.html',
  styleUrl: './monitoring.scss'
})
export class Monitoring implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('latencyChart') latencyChartRef!: ElementRef;
  @ViewChild('predictiveHealthChart') predictiveHealthChartRef!: ElementRef;
  @ViewChild('costAnalysisChart') costAnalysisChartRef!: ElementRef;
  @ViewChild('ganttChart') ganttChartRef!: ElementRef;
  @ViewChild('dependencyFlowChart') dependencyFlowCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('failurePredictionChart') failurePredictionChartRef!: ElementRef;

  private charts: Chart[] = [];
  private chartMap: Record<string, Chart> = {};
  private pollTimer: any = null;
  private viewReady = false;

  monitoringKPIs: any;

  selectedAgentId = signal<string | null>(null);
  lastCycle = signal('—');
  nextCycle = signal('—');
  healthScore = signal<number>(0);

  // ── Mapping nom backend → id agent frontend (8 agents réels uniquement) ──
  private BACKEND_TO_ID: Record<string, string> = {
    analyste: 'app02', analyst: 'app02', stratege: 'app05', coach: 'app07', rag: 'rag',
    guardrail: 'app08',
    analysis_agent: 'analysis_agent', context_agent: 'context_agent', decision_agent: 'decision_agent',
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Catalogue d'architecture (STATIQUE = documentation de conception).
  // Limité aux 8 agents qui existent réellement dans le code et écrivent une
  // télémétrie exploitable :
  //   - sales-module  → agent_logs        : analyste, stratege, coach, rag, guardrail
  //   - inventory-module → inventory.agent_runs : analysis_agent, context_agent, decision_agent
  // (Pas de watcher/orchestrateur/forecast/gap/advisor/memory séparés — aucun
  // de ces noms n'est jamais instrumenté dans le code, ils n'existent pas.)
  // Le statut, la latence, les logs, les métriques et l'input/output sont
  // remplacés en temps réel par /api/monitoring/agents.
  // ══════════════════════════════════════════════════════════════════════════
  agents = signal<AgentDetail[]>([
    {
      id: 'app02', name: 'Agent Analyste', appId: 'APP02', layer: 'coaching',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Receives live POS feed. Calculates gap vs daily target. Calls TimesFM for EOD forecast. Detects urgency level HIGH / MEDIUM / LOW. Writes to LangGraph State.',
      inputs: ['Live POS feed', 'TimesFM forecast', 'Daily target'],
      outputs: ['gap_objectif', 'niveau_urgence', 'écart_objectif → State'],
      stateFields: ['pos_data', 'écart_objectif', 'niveau_urgence'],
      metrics: [], logs: [],
    },
    {
      id: 'app05', name: 'Agent Stratège', appId: 'APP05', layer: 'coaching',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Receives urgency score from State. Queries RAG pgvector for similar past situations. Analyzes weather + event context. Builds optimal strategy per advisor.',
      inputs: ['niveau_urgence from State', 'RAG pgvector query', 'Weather + events context'],
      outputs: ['stratégie → State', 'confiance score'],
      stateFields: ['stratégie'],
      metrics: [], logs: [],
    },
    {
      id: 'app07', name: 'Agent Coach', appId: 'APP07', layer: 'coaching',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Reads strategy from State. READS stock_disponible[] BEFORE any generation — if stock=0, product is EXCLUDED from advice. Optimizes prompt via DSPy. Generates NL advice via vLLM Mistral-7B in < 2s.',
      inputs: ['stratégie from State', 'stock_disponible[] (guard)', 'RAG context'],
      outputs: ['conseil_final → State', 'conseil NLG → Dashboard < 2s'],
      stateFields: ['conseil_final'],
      metrics: [], logs: [],
    },
    {
      id: 'rag', name: 'RAG Agent', appId: 'APP10', layer: 'support',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Shared memory agent. PostgreSQL + pgvector / Milvus. Serves both Coach Agent and inventory agents. Returns top-3 most similar historical situations.',
      inputs: ['Semantic query from APP07', 'Semantic query from decision_agent'],
      outputs: ['Top-3 similar cases → APP07', 'Purchasing policies → decision_agent'],
      stateFields: [],
      metrics: [], logs: [],
    },
    {
      id: 'app08', name: 'Agent Guardrail', appId: 'APP08', layer: 'coaching',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Validates every Coach reply before delivery: checks stock consistency, banned claims, price accuracy and confidence threshold. APPROVE / REWRITE / ESCALATE / BLOCK, with human validation triggered on HIGH/CRITICAL urgency escalations.',
      inputs: ['message_for_advisor from APP07', 'inventory snapshot', 'rag_used + confidence'],
      outputs: ['guardrail_status → Dashboard', 'safe_fallback (if BLOCK)'],
      stateFields: ['guardrail_status'],
      metrics: [], logs: [],
    },
    {
      id: 'analysis_agent', name: 'Inventory Analysis Agent', appId: 'INV-A', layer: 'inventory',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Folder src/agents/analysis (fetch → compute → reason). DB-first with CSV fallback. Computes baseline stock metrics and two-layer risk classification per SKU. LLM used as evaluator, not narrator.',
      inputs: ['sku', 'store_id', 'business_objective', 'preloaded_stock / preloaded_product (batch pre-fetch)'],
      outputs: ['analysis_report { stock, forecast, metrics, risk_assessment, constraints }'],
      stateFields: [],
      metrics: [], logs: [],
    },
    {
      id: 'context_agent', name: 'Inventory Context Agent', appId: 'INV-C', layer: 'inventory',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Folder src/agents/context (fetch_signals → interpret). Learns from historical uplifts (promotions/weather/holidays) and produces a calibrated demand_uplift_pct for the next 7 days, consumed by the decision agent.',
      inputs: ['sku', 'store_id', 'signals (weather, promotions, holidays, events, historical patterns)'],
      outputs: ['context_report { demand_uplift_pct, interpretation, confidence, dominant_signal }'],
      stateFields: [],
      metrics: [], logs: [],
    },
    {
      id: 'decision_agent', name: 'Inventory Decision Agent', appId: 'INV-D', layer: 'inventory',
      status: 'IDLE', latency: 0, lastRun: '—', hasTelemetry: false,
      description: 'Folder src/agents/decision (constraints_check → decide). Combines analysis_report + context_report into a concrete recommendation (ORDER / HOLD / MONITOR / EXPEDITE) with budget/margin arbitrage and graceful degradation if context is missing.',
      inputs: ['baseline_report (from analysis_agent)', 'context_report (from context_agent)', 'adjusted_metrics'],
      outputs: ['decision { action, order_qty, urgency, confidence, escalate_to_human }'],
      stateFields: [],
      metrics: [], logs: [],
    },
  ]);

  // ── Computed ──
  selectedAgent = computed(() => {
    const id = this.selectedAgentId();
    return id ? this.agents().find(a => a.id === id) || null : null;
  });

  selectAgent(id: string) {
    this.selectedAgentId.update(cur => cur === id ? null : id);
  }

  /** lastInput / lastOutput → tableau [{key, value}] pour le template. */
  ioEntries(obj: Record<string, any> | undefined): { key: string; value: string }[] {
    if (!obj) return [];
    return Object.entries(obj).map(([key, value]) => ({
      key,
      value: value === null || value === undefined ? '—' : String(value),
    }));
  }

  liveCount = computed(() => this.agents().filter(a => a.status === 'LIVE').length);
  activeCount = computed(() => this.agents().filter(a => a.status === 'ACTIVE').length);
  errorCount = computed(() => this.agents().filter(a => a.status === 'ERROR').length);

  totalLatency = computed(() =>
    this.agents().reduce((a, b) => a + b.latency, 0).toFixed(1)
  );

  agentsByLayer = computed(() => {
    const layers: Record<AgentLayer, AgentDetail[]> = {
      coaching: [], inventory: [], support: [],
    };
    this.agents().forEach(a => layers[a.layer].push(a));
    return layers;
  });

  // ── LangGraph State (dérivé du dernier cycle réel via /kpis — cycle sales) ──
  // Uniquement les champs réellement écrits par les 4 agents sales (agent_logs /
  // last_result). Les agents inventaire (analysis_agent/context_agent/decision_agent)
  // n'écrivent pas dans ce state — leur sortie réelle (analysis_report/context_report/
  // decision) est visible dans leur propre panneau "Last output" une fois sélectionnés.
  stateFields = computed(() => {
    const k = this.monitoringKPIs() || {};
    const has = (x: any) => x !== undefined && x !== null && x !== '' && x !== 0;
    return [
      { key: 'pos_data', owner: 'APP02', sprint: 1, value: has(k.cycle_id) ? 'live' : '—' },
      { key: 'écart_objectif', owner: 'APP02', sprint: 1, value: has(k.gap_pct) ? `${k.gap_pct}%` : '—' },
      { key: 'niveau_urgence', owner: 'APP02', sprint: 1, value: k.urgency_level || '—' },
      { key: 'stratégie', owner: 'APP05', sprint: 1, value: has(k.nb_actions) ? `${k.nb_actions} actions` : '—' },
      { key: 'conseil_final', owner: 'APP07', sprint: 1, value: has(k.completed_at) ? 'generated' : '—' },
      { key: 'rag_used', owner: 'APP10', sprint: 1, value: has(k.rag_used) ? `${k.nb_rag_scripts || 0} scripts` : '—' },
    ];
  });

  layers: { key: AgentLayer; label: string; color: string }[] = [
    { key: 'coaching', label: 'Coaching (sales)', color: '#6C5CE7' },
    { key: 'inventory', label: 'Inventory', color: '#00B894' },
    { key: 'support', label: 'Support', color: '#888780' },
  ];

  // ── Guardrail history — historique DB (agent_logs) fusionné avec le flux
  // WebSocket temps réel. Sans l'historique DB, le panneau repartait à zéro
  // à chaque rechargement de page tant qu'aucun nouvel incident ne survenait
  // pendant la session en cours. ──
  private ws = inject(WebSocketService);
  private dbGuardrailHistory = signal<{
    status: string; advisor: string;
    issues: { rule: string; message: string }[];
    urgency: string; timestamp: string;
  }[]>([]);

  guardrailHistory = computed(() => {
    const live = this.ws.guardrailHistory();
    const seen = new Set(live.map(e => `${e.advisor}|${e.timestamp}`));
    const historical = this.dbGuardrailHistory().filter(
      e => !seen.has(`${e.advisor}|${e.timestamp}`)
    );
    return [...live, ...historical]
      .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
      .slice(0, 20);
  });

  guardrailStats = computed(() => {
    const h = this.guardrailHistory();
    return {
      total: h.length,
      blocks: h.filter(e => e.status === 'BLOCK').length,
      escalates: h.filter(e => e.status === 'ESCALATE').length,
      rewrites: h.filter(e => e.status === 'REWRITE').length,
    };
  });

  constructor(private monitoringService: MonitoringService) {
    this.monitoringKPIs = this.monitoringService.kpis;
  }

  ngOnInit() {
    // Premier chargement + refresh périodique (données réelles uniquement)
    this.refreshAll();
    this.pollTimer = setInterval(() => this.refreshAll(), 15000);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initCharts();
      this.viewReady = true;
      this.refreshAll();   // pousse les données déjà chargées dans les charts
    }, 120);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.charts.forEach(c => c.destroy());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Rafraîchissement des données réelles
  // ══════════════════════════════════════════════════════════════════════════

  /** Rafraîchissement manuel (bouton Refresh). */
  refresh() { this.refreshAll(); }

  private refreshAll() {
    this.monitoringService.fetchKPIs();
    this.refreshAgents();
    this.refreshPerformance();
    this.refreshCosts();
    this.refreshPrediction();
    this.refreshTimeline();
    this.refreshGuardrailHistory();
  }

  private refreshGuardrailHistory() {
    this.monitoringService.fetchGuardrailEvents(20).subscribe({
      next: (res: any) => this.dbGuardrailHistory.set(res?.events ?? []),
      error: () => { /* garde le dernier état connu */ },
    });
  }

  private refreshAgents() {
    this.monitoringService.fetchAgents().subscribe({
      next: (res: any) => {
        const live: any[] = res?.agents ?? [];
        let latestRun = '';
        this.agents.update(list => list.map(a => {
          const match = live.find(l =>
            this.BACKEND_TO_ID[String(l.agent_name || '').toLowerCase()] === a.id ||
            l.agent_id === a.appId);
          if (!match) return { ...a, hasTelemetry: false };
          if (match.last_run && match.last_run > latestRun) latestRun = match.last_run;
          return {
            ...a,
            status: (match.status as AgentStatus) ?? a.status,
            latency: match.avg_latency_s ?? a.latency,
            lastRun: match.last_run ?? a.lastRun,
            logs: match.logs ?? [],
            metrics: match.metrics ?? [],
            totalRuns: match.total_runs,
            successRate: match.success_rate,
            ioInputs: match.inputs ?? [],
            ioOutputs: match.outputs ?? [],
            lastInput: match.last_input ?? {},
            lastOutput: match.last_output ?? {},
            hasTelemetry: true,
          };
        }));
        if (latestRun) this.lastCycle.set(latestRun);
      },
      error: () => { /* garde le dernier état connu */ },
    });
  }

  private refreshPerformance() {
    this.monitoringService.fetchAgentPerformance().subscribe({
      next: (res: any) => {
        const agents: any[] = (res?.agents ?? []).slice(0, 8);
        const chart = this.chartMap['latency'];
        if (!chart || !agents.length) return;
        chart.data.labels = agents.map(a => a.agent_name);
        chart.data.datasets[0].data = agents.map(a => a.avg_latency_s ?? 0);
        chart.data.datasets[1].data = agents.map(a => Math.round((a.success_rate ?? 0) * 100));
        chart.update('none');
      },
      error: () => {},
    });
  }

  private refreshCosts() {
    this.monitoringService.fetchAgentCosts().subscribe({
      next: (res: any) => {
        const chart = this.chartMap['cost'];
        if (!chart) return;
        const byAgent: Record<string, number> = res?.by_agent ?? {};
        const labels = Object.keys(byAgent);
        if (labels.length) {
          chart.data.labels = labels;
          chart.data.datasets[0].data = labels.map(k => byAgent[k]);
        } else {
          chart.data.labels = ['API LLM', 'Compute', 'Storage'];
          chart.data.datasets[0].data = [
            res?.api_cost_tnd ?? 0, res?.compute_cost_tnd ?? 0, res?.storage_cost_tnd ?? 0,
          ];
        }
        chart.update('none');
      },
      error: () => {},
    });
  }

  private refreshPrediction() {
    this.monitoringService.fetchFailurePrediction().subscribe({
      next: (res: any) => {
        const hist: number[] = res?.historical ?? [];
        const fc: number[] = res?.forecast ?? [];
        const up: number[] = res?.upper ?? [];
        const lo: number[] = res?.lower ?? [];

        // Score de santé = 100 − risque courant
        const risk = res?.risk_score ?? (hist.length ? hist[hist.length - 1] : 0);
        this.healthScore.set(Math.round(100 - risk * 100));

        // Chart santé prédictive (12 derniers points)
        const health = this.chartMap['health'];
        if (health) {
          const series = hist.slice(-12).map(r => Math.round(100 - r * 100));
          health.data.labels = series.map((_, i) => i === series.length - 1 ? 'Now' : `-${series.length - 1 - i}`);
          health.data.datasets[0].data = series;
          health.update('none');
        }

        // Chart failure prediction (risque % : 12 historiques + 12 forecast)
        const fail = this.chartMap['failure'];
        if (fail) {
          const h12 = hist.slice(-12).map(r => Math.round(r * 100));
          const pad = Array(Math.max(0, 12 - h12.length)).fill(null).concat(h12).slice(-12);
          const nulls12 = Array(12).fill(null);
          fail.data.datasets[0].data = [...pad, ...nulls12];
          fail.data.datasets[1].data = [...nulls12, ...fc.slice(0, 12).map(r => Math.round(r * 100))];
          fail.data.datasets[2].data = [...nulls12, ...up.slice(0, 12).map(r => Math.round(r * 100))];
          fail.data.datasets[3].data = [...nulls12, ...lo.slice(0, 12).map(r => Math.round(r * 100))];
          fail.update('none');
        }
      },
      error: () => {},
    });
  }

  private refreshTimeline() {
    this.monitoringService.fetchExecutionTimeline().subscribe({
      next: (res: any) => {
        const events: any[] = res?.events ?? [];
        const chart = this.chartMap['gantt'];
        if (!chart || !events.length) return;
        chart.data.labels = events.map(e => e.agent);
        chart.data.datasets[0].data = events.map(e => [
          +(e.start_ms / 1000).toFixed(2), +(e.end_ms / 1000).toFixed(2),
        ]);
        chart.update('none');
      },
      error: () => {},
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Charts (structure ; données injectées par les refresh*)
  // ══════════════════════════════════════════════════════════════════════════

  private initCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this.chartMap = {};

    // ── Sankey (flux d'architecture — design, statique) ──
    if (this.dependencyFlowCanvas) {
      const ctx = this.dependencyFlowCanvas.nativeElement.getContext('2d');
      if (ctx) {
        const c = new Chart(ctx, {
          type: 'sankey',
          data: {
            datasets: [{
              label: 'Agent Flow',
              data: [
                { from: 'Supervisor', to: 'Analyste', flow: 4 },
                { from: 'Supervisor', to: 'Analysis Agent', flow: 4 },
                { from: 'Analyste', to: 'Stratège', flow: 4 },
                { from: 'Analysis Agent', to: 'Context Agent', flow: 4 },
                { from: 'Analysis Agent', to: 'Decision Agent', flow: 4 },
                { from: 'Context Agent', to: 'Decision Agent', flow: 4 },
                { from: 'Stratège', to: 'RAG', flow: 3 },
                { from: 'Decision Agent', to: 'RAG', flow: 3 },
                { from: 'RAG', to: 'Coach', flow: 4 }
              ],
              colorFrom: () => '#6C5CE7',
              colorTo: () => '#00B894',
              colorMode: 'gradient',
              size: 'max',
            }]
          } as any,
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } }
          }
        });
        this.charts.push(c); this.chartMap['sankey'] = c;
      }
    }

    // ── Latence + taux de succès par agent (réel via /performance) ──
    if (this.latencyChartRef) {
      const ctx = this.latencyChartRef.nativeElement.getContext('2d');
      const c = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            {
              type: 'bar', label: 'Avg latency (s)', data: [],
              backgroundColor: '#6C5CE7', borderRadius: 4, yAxisID: 'y',
            },
            {
              type: 'line', label: 'Success rate (%)', data: [],
              borderColor: '#2ECC71', backgroundColor: 'rgba(46,204,113,0.1)',
              borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#2ECC71',
              tension: 0.3, yAxisID: 'y1', fill: false,
            }
          ]
        } as any,
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (c: any) => c.dataset.label === 'Success rate (%)'
                  ? ` ${c.dataset.label}: ${c.parsed.y}%`
                  : ` ${c.dataset.label}: ${c.parsed.y}s`,
              }
            }
          },
          scales: {
            y: {
              type: 'linear', position: 'left', beginAtZero: true,
              ticks: { font: { size: 10 }, callback: (v: any) => v + 's' },
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: 'Latency (s)', font: { size: 11, weight: 'bold' }, color: '#6b7280' }
            },
            y1: {
              type: 'linear', position: 'right', min: 0, max: 100,
              ticks: { font: { size: 10 }, callback: (v: any) => v + '%' },
              grid: { display: false },
              title: { display: true, text: 'Success (%)', font: { size: 11, weight: 'bold' }, color: '#2ECC71' }
            },
            x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 0 }, grid: { display: false } }
          }
        }
      });
      this.charts.push(c); this.chartMap['latency'] = c;
    }

    // ── Santé prédictive (réel via /predict) ──
    if (this.predictiveHealthChartRef) {
      const ctx = this.predictiveHealthChartRef.nativeElement.getContext('2d');
      const c = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Stabilité', data: [],
            borderColor: '#00B894', backgroundColor: 'rgba(0,184,148,0.1)',
            fill: true, tension: 0.4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
      this.charts.push(c); this.chartMap['health'] = c;
    }

    // ── Coûts par agent (réel via /costs) ──
    if (this.costAnalysisChartRef) {
      const ctx = this.costAnalysisChartRef.nativeElement.getContext('2d');
      const c = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Cost (TND)', data: [],
            backgroundColor: '#6C5CE7', borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c: any) => ` ${c.parsed.x?.toFixed?.(4) ?? c.parsed.x} TND` } }
          },
          scales: {
            x: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v: any) => v + '' },
                 title: { display: true, text: 'Cost (TND)', font: { size: 11, weight: 'bold' }, color: '#6b7280' } },
            y: { ticks: { font: { size: 11 } } }
          }
        }
      });
      this.charts.push(c); this.chartMap['cost'] = c;
    }

    // ── Timeline d'exécution / Gantt (réel via /timeline) ──
    if (this.ganttChartRef) {
      const ctx = this.ganttChartRef.nativeElement.getContext('2d');
      const c = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: "Intervalle d'exécution (s)", data: [],
            backgroundColor: '#6C5CE7', borderRadius: 5, borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, title: { display: true, text: 'seconds', font: { size: 10 } } } }
        }
      });
      this.charts.push(c); this.chartMap['gantt'] = c;
    }

    // ── Prédiction de risque de panne (réel via /predict) ──
    if (this.failurePredictionChartRef) {
      const ctx = this.failurePredictionChartRef.nativeElement.getContext('2d');
      const labels = [
        '-12h', '-11h', '-10h', '-9h', '-8h', '-7h', '-6h', '-5h', '-4h', '-3h', '-2h', '-1h',
        'Now', '+1h', '+2h', '+3h', '+4h', '+5h', '+6h', '+7h', '+8h', '+9h', '+10h', '+11h'
      ];
      const c = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Historical risk (%)', data: [],
              borderColor: '#6C5CE7', backgroundColor: 'rgba(108,92,231,0.1)',
              borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#6C5CE7', fill: false, tension: 0.3,
            },
            {
              label: 'Predicted risk (%)', data: [],
              borderColor: '#E74C3C', backgroundColor: 'rgba(231,76,60,0.1)',
              borderWidth: 2, borderDash: [5, 5], pointRadius: 4, pointBackgroundColor: '#E74C3C', fill: false, tension: 0.3,
            },
            {
              label: 'Upper Bound', data: [],
              borderColor: 'rgba(231,76,60,0.3)', backgroundColor: 'rgba(231,76,60,0.05)',
              borderWidth: 1, borderDash: [2, 2], pointRadius: 0, fill: '+1', tension: 0.3,
            },
            {
              label: 'Lower Bound', data: [],
              borderColor: 'rgba(231,76,60,0.3)', backgroundColor: 'rgba(231,76,60,0.05)',
              borderWidth: 1, borderDash: [2, 2], pointRadius: 0, fill: false, tension: 0.3,
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 10 }, usePointStyle: true, padding: 12,
                filter: (item: any) => item.text !== 'Upper Bound' && item.text !== 'Lower Bound'
              }
            },
            tooltip: {
              callbacks: {
                label: (c: any) => (c.datasetIndex === 0 || c.datasetIndex === 1)
                  ? ` ${c.dataset.label}: ${c.parsed.y}%` : ''
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true, max: 100,
              ticks: { font: { size: 10 }, callback: (v: any) => v + '%' },
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: 'Failure risk (%)', font: { size: 11, weight: 'bold' }, color: '#6b7280' }
            },
            x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 }, grid: { display: false } }
          }
        }
      });
      this.charts.push(c); this.chartMap['failure'] = c;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers de style (inchangés)
  // ══════════════════════════════════════════════════════════════════════════

  statusColor(s: AgentStatus): string {
    const m: Record<AgentStatus, string> = {
      LIVE: '#00B894', ACTIVE: '#6C5CE7', DONE: '#9CA3AF',
      RUN: '#F9A825', ERROR: '#E74C3C', IDLE: '#B4B2A9', WAIT: '#2D9CDB'
    };
    return m[s] ?? '#9CA3AF';
  }

  statusBg(s: AgentStatus): string {
    const m: Record<AgentStatus, string> = {
      LIVE: '#E0FAF4', ACTIVE: '#EEEDFE', DONE: '#F1EFE8',
      RUN: '#FFF8E1', ERROR: '#FDEDEC', IDLE: '#F1EFE8', WAIT: '#E8F4FD'
    };
    return m[s] ?? '#F1EFE8';
  }

  logColor(l: string): string {
    const m: Record<string, string> = {
      info: '#2D9CDB', warn: '#F9A825', error: '#E74C3C', success: '#00B894'
    };
    return m[l] ?? '#888780';
  }

  logBg(l: string): string {
    const m: Record<string, string> = {
      info: '#E8F4FD', warn: '#FFF8E1', error: '#FDEDEC', success: '#E0FAF4'
    };
    return m[l] ?? '#F1EFE8';
  }

  layerColor(layer: AgentLayer): string {
    const m: Record<AgentLayer, string> = {
      coaching: '#6C5CE7', inventory: '#00B894', support: '#888780',
    };
    return m[layer];
  }

  layerBg(layer: AgentLayer): string {
    const m: Record<AgentLayer, string> = {
      coaching: '#EEEDFE', inventory: '#E0FAF4', support: '#F1EFE8',
    };
    return m[layer];
  }

  trackById(_: number, item: { id: string }) { return item.id; }

  getHealthColor(): string {
    const score = this.healthScore();
    if (score > 90) return '#00B894';
    if (score > 70) return '#F1C40F';
    return '#E74C3C';
  }
}
