import {
  Component, signal, computed, AfterViewInit,
  ViewChild, ElementRef, OnDestroy, OnInit, inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MonitoringService } from '../../core/services/monitoring.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { Chart, registerables } from 'chart.js'; // Regroupé ici
import { SankeyController, Flow } from 'chartjs-chart-sankey';

Chart.register(...registerables, SankeyController, Flow);

type AgentStatus = 'LIVE' | 'ACTIVE' | 'DONE' | 'RUN' | 'ERROR' | 'IDLE' | 'WAIT';
type AgentLayer = 'preload' | 'orchestrator' | 'coaching' | 'inventory' | 'support';

interface AgentLog {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface AgentDetail {
  id: string;
  name: string;
  appId: string;
  layer: AgentLayer;
  status: AgentStatus;
  latency: number;
  decisionLatency?: number;
  isValidated?: boolean;
  lastRun: string;
  description: string;
  inputs: string[];
  outputs: string[];
  stateFields: string[];
  logs: AgentLog[];
  metrics: { label: string; value: string; color?: string; }[];
}

interface StateField {
  key: string;
  owner: string;
  sprint: number;
  value: string;
  validated?: boolean;
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

  // --- ICI : LES DONNÉES DYNAMIQUES ---
  // --- ICI : LES DONNÉES DYNAMIQUES ---
  private predictiveData = signal<number[]>([96, 94, 92, 95, 94]);
  private costDataAPI = signal<number[]>([0.45, 0.32, 0.15, 0.08]);
  private costDataCompute = signal<number[]>([0.12, 0.08, 0.25, 0.05]);
  private costDataStorage = signal<number[]>([0.08, 0.15, 0.10, 0.03]); // NEW: Storage costs

  // Failure prediction data per agent (24h forecast)
  private agentPredictions: Record<string, {
    historical: number[];
    forecast: number[];
    upper: number[];
    lower: number[];
  }> = {
      'app08-watcher': {
        historical: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
        forecast: [0, 1, 0, 1, 1, 2, 1, 2, 1, 2, 2, 3],
        upper: [1, 2, 1, 2, 2, 3, 2, 3, 2, 3, 3, 4],
        lower: [0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 2],
      },
      'app06': {
        historical: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        forecast: [0, 0, 0, 1, 0, 1, 1, 1, 2, 1, 2, 2],
        upper: [1, 1, 1, 2, 1, 2, 2, 2, 3, 2, 3, 3],
        lower: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
      },
      'app02': {
        historical: [1, 0, 1, 1, 2, 1, 0, 1, 1, 0, 1, 0],
        forecast: [1, 2, 1, 3, 2, 3, 3, 4, 3, 4, 5, 6],
        upper: [2, 3, 2, 4, 3, 4, 4, 5, 4, 5, 6, 7],
        lower: [0, 1, 0, 2, 1, 2, 2, 3, 2, 3, 4, 5],
      },
      'app05': {
        historical: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
        forecast: [1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 4],
        upper: [2, 2, 3, 2, 3, 3, 4, 3, 4, 4, 5, 5],
        lower: [0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, 3],
      },
      'app07': {
        historical: [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
        forecast: [1, 1, 1, 2, 2, 2, 3, 2, 3, 3, 4, 5],
        upper: [2, 2, 2, 3, 3, 3, 4, 3, 4, 4, 5, 6],
        lower: [0, 0, 0, 1, 1, 1, 2, 1, 2, 2, 3, 4],
      },
      'app03-forecast': {
        historical: [1, 1, 0, 1, 0, 1, 1, 2, 1, 0, 1, 1],
        forecast: [2, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6],
        upper: [3, 3, 4, 3, 4, 5, 4, 5, 6, 5, 6, 7],
        lower: [1, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5],
      },
      'app04-gap': {
        historical: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        forecast: [0, 0, 1, 0, 1, 1, 1, 1, 2, 1, 2, 2],
        upper: [1, 1, 2, 1, 2, 2, 2, 2, 3, 2, 3, 3],
        lower: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
      },
      'app09': {
        historical: [0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
        forecast: [1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
        upper: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6],
        lower: [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4],
      },
      'rag': {
        historical: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        forecast: [0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 2, 1],
        upper: [1, 1, 1, 1, 2, 1, 2, 2, 2, 2, 3, 2],
        lower: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      },
      'memory': {
        historical: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        forecast: [0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1],
        upper: [1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 2, 2],
        lower: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    };

  // Current displayed prediction (reactive)
  private currentAgentId = signal<string>('app08-watcher'); // Default to first agent
  currentPrediction = computed(() => this.agentPredictions[this.currentAgentId()] || this.agentPredictions['app08-watcher']);

  monitoringKPIs: any;

  selectedAgentId = signal<string | null>(null);
  lastCycle = signal('2:32 PM');
  nextCycle = signal('3:02 PM');
  cycleStep = signal(9);
  totalSteps = 12;
  healthScore = signal<number>(94);
  conflicts = signal<any[]>([]);

  latencyData = {
    labels: ['2:00', '2:05', '2:10', '2:15', '2:20', '2:25', '2:30', '2:32'],
    orchestrator: [0.3, 0.3, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3],
    coach: [2.0, 2.3, 1.9, 2.1, 2.4, 2.0, 2.1, 2.1],
    inventory: [2.2, 2.5, 2.1, 2.3, 2.6, 2.2, 2.4, 2.4],
    slaThreshold: [3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0], // SLA: 3 seconds max
    successRate: [98, 97, 99, 98, 96, 99, 98, 99], // Success rate %
  };

  // ── Agents ──
  agents = signal<AgentDetail[]>([
    {
      id: 'app08-watcher', name: 'InventoryWatcher', appId: 'APP08', decisionLatency: 0.1,
      isValidated: true,
      layer: 'preload', status: 'LIVE', latency: 0.8, lastRun: '2:32 PM',
      description: 'Starts BEFORE every cycle. Polls WMS/ERP every 60s, compares stock vs thresholds, generates alerts and writes stock_disponible[] to LangGraph State.',
      inputs: ['WMS / ERP continuous feed', 'Min/max thresholds'],
      outputs: ['stock_disponible[]', 'alerte_stock → Orchestrator'],
      stateFields: ['stock_disponible', 'alerte_stock'],
      metrics: [
        { label: 'Poll interval', value: '60s' },
        { label: 'SKUs monitored', value: '6' },
        { label: 'Active alerts', value: '2', color: '#E74C3C' },
        { label: 'Last write', value: '2:32 PM' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'stock_disponible[] written — iPhone16Pro: 3 units' },
        { time: '2:31 PM', level: 'warn', message: 'alerte_stock triggered — IPH16PRO qty=3 below threshold=8' },
        { time: '2:30 PM', level: 'info', message: 'WMS poll complete — 6 SKUs checked' },
      ]
    },
    {
      id: 'app06', name: 'Orchestrator LangGraph', appId: 'APP06', decisionLatency: 0.1,
      isValidated: true,
      layer: 'orchestrator', status: 'ACTIVE', latency: 0.3, lastRun: '2:32 PM',
      description: 'Central brain. Receives POS events + enriched context. Reads stock_disponible[] from State. Routes to agents conditionally: urgency=HIGH → Analyst, gap>30% → Strategist, stock_alert → Inventory pipeline, conseil_prêt → Coach.',
      inputs: ['POS event + context', 'alerte_stock from APP08', 'State snapshot'],
      outputs: ['Route → Analyst', 'Route → Strategist', 'Route → Coach', 'Route → Inventory pipeline'],
      stateFields: ['all fields (read + route)'],
      metrics: [
        { label: 'Cycle duration', value: '~18s' },
        { label: 'Routing decisions', value: '4' },
        { label: 'Degraded mode', value: 'Ready' },
        { label: 'Active since', value: '9:00 AM' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Cycle #47 started — alerte_stock detected, routing to Inventory pipeline' },
        { time: '2:32 PM', level: 'info', message: 'stock_disponible[] read from State — guard active for Coach' },
        { time: '2:31 PM', level: 'info', message: 'Cycle #46 complete in 17.4s' },
      ]
    },
    {
      id: 'app02', name: 'Agent Analyste', appId: 'APP02', decisionLatency: 0.1,
      isValidated: true,
      layer: 'coaching', status: 'LIVE', latency: 1.4, lastRun: '2:32 PM',
      description: 'Receives live POS feed. Calculates gap vs daily target. Calls TimesFM for EOD forecast. Detects urgency level HIGH / MEDIUM / LOW. Writes to LangGraph State.',
      inputs: ['Live POS feed', 'TimesFM forecast', 'Daily target'],
      outputs: ['gap_objectif', 'niveau_urgence', 'écart_objectif → State'],
      stateFields: ['pos_data', 'écart_objectif', 'niveau_urgence'],
      metrics: [
        { label: 'Current gap', value: '44%', color: '#E74C3C' },
        { label: 'Urgency', value: 'HIGH', color: '#E74C3C' },
        { label: 'EOD forecast', value: '6,800 DT' },
        { label: 'Latency', value: '1.4s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'warn', message: 'gap=44% detected — urgency set to HIGH' },
        { time: '2:32 PM', level: 'success', message: 'TimesFM EOD forecast: 6,800 DT [5,400–8,200]' },
        { time: '2:32 PM', level: 'info', message: 'POS snapshot processed — 4 advisors, 42 transactions' },
      ]
    },
    {
      id: 'app05', name: 'Agent Stratège', appId: 'APP05', decisionLatency: 0.1,
      isValidated: true,
      layer: 'coaching', status: 'LIVE', latency: 1.1, lastRun: '2:32 PM',
      description: 'Receives urgency score from State. Queries RAG pgvector for similar past situations. Analyzes weather + event context. Builds optimal strategy per advisor.',
      inputs: ['niveau_urgence from State', 'RAG pgvector query', 'Weather + events context'],
      outputs: ['stratégie → State', 'confiance score'],
      stateFields: ['stratégie'],
      metrics: [
        { label: 'Strategy', value: 'upsell_premium' },
        { label: 'Confidence', value: '0.87', color: '#00B894' },
        { label: 'RAG results', value: '3 cases' },
        { label: 'Latency', value: '1.1s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Strategy "upsell_premium" written — confidence 0.87' },
        { time: '2:32 PM', level: 'info', message: 'RAG query: 3 similar cases found (rain + concert context)' },
        { time: '2:31 PM', level: 'info', message: 'Weather signal processed: rain +40% accessories demand' },
      ]
    },
    {
      id: 'app07', name: 'Agent Coach', appId: 'APP07', decisionLatency: 0.1,
      isValidated: true,
      layer: 'coaching', status: 'RUN', latency: 2.1, lastRun: '2:32 PM',
      description: 'Reads strategy from State. READS stock_disponible[] BEFORE any generation — if stock=0, product is EXCLUDED from advice. Optimizes prompt via DSPy. Generates NL advice via vLLM Mistral-7B in < 2s.',
      inputs: ['stratégie from State', 'stock_disponible[] (guard)', 'RAG context'],
      outputs: ['conseil_final → State', 'conseil NLG → Dashboard < 2s'],
      stateFields: ['conseil_final'],
      metrics: [
        { label: 'LLM', value: 'Mistral-7B' },
        { label: 'Latency p95', value: '2.1s' },
        { label: 'Quality score', value: '0.87', color: '#00B894' },
        { label: 'Guard active', value: 'YES', color: '#00B894' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'stock guard OK — iPhone16Pro badge "last units" added to script' },
        { time: '2:32 PM', level: 'info', message: 'DSPy prompt optimized — vLLM generation started' },
        { time: '2:31 PM', level: 'success', message: 'conseil_final written — quality score 0.87' },
      ]
    },
    {
      id: 'app03-forecast', name: 'ForecastEngine', appId: 'APP03', decisionLatency: 0.1,
      isValidated: true,
      layer: 'inventory', status: 'LIVE', latency: 1.8, lastRun: '2:32 PM',
      description: 'NEW — Replaces TimesFM assistant. Receives SKU alert list from APP08. Loads TimesFM (already instantiated). Forecasts demand D+1 to D+7 per SKU. Calculates trend: rising/falling/stable. Confidence interval 80%.',
      inputs: ['SKU alert list from APP08', 'TimesFM model (instantiated)'],
      outputs: ['prévision_demande', 'trend_signal → State'],
      stateFields: ['prévision_demande'],
      metrics: [
        { label: 'Horizon', value: 'D+1 to D+7' },
        { label: 'MAPE', value: '14.3%' },
        { label: 'CI', value: '80%' },
        { label: 'SKUs forecast', value: '3' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Demand forecast: iPhone16Pro D+1=11, D+7=68 — trend: rising' },
        { time: '2:32 PM', level: 'info', message: 'TimesFM loaded — 3 SKUs in alert queued for forecast' },
        { time: '2:31 PM', level: 'info', message: 'MAPE validation: 14.3% — within target <20%' },
      ]
    },
    {
      id: 'app04-gap', name: 'GapDetector', appId: 'APP04', decisionLatency: 0.1,
      isValidated: true,
      layer: 'inventory', status: 'ACTIVE', latency: 0.2, lastRun: '2:32 PM',
      description: 'NEW. Receives stock_disponible + prévision_demande. Calculates days remaining = qty / avg_daily_demand. Score rupture = 1 − (days_remaining / delay_supplier). Detects overstock if qty > 3× demand_30j. Prioritizes SKUs by risk score.',
      inputs: ['stock_disponible from State', 'prévision_demande from APP03'],
      outputs: ['scores_risque{sku→score}', 'demand_7j + trend → APP09'],
      stateFields: ['scores_risque'],
      metrics: [
        { label: 'IPH16PRO risk', value: '0.91', color: '#E74C3C' },
        { label: 'APLWTCH risk', value: '0.88', color: '#E74C3C' },
        { label: 'AIRPDP3 risk', value: '0.73', color: '#F9A825' },
        { label: 'Latency', value: '0.2s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'error', message: 'IPH16PRO risk=0.91 CRITICAL — days_remaining=0.27' },
        { time: '2:32 PM', level: 'error', message: 'APLWTCH risk=0.88 CRITICAL — redistribution recommended' },
        { time: '2:32 PM', level: 'warn', message: 'AIRPDP3 risk=0.73 HIGH — rain signal driving demand' },
      ]
    },
    {
      id: 'app09', name: 'InventoryAdvisor', appId: 'APP09', decisionLatency: 0.1,
      isValidated: true,
      layer: 'inventory', status: 'LIVE', latency: 2.4, lastRun: '2:32 PM',
      description: 'CORE of Inventory Advisor. Receives scores_risque + prévision_demande + RAG purchasing policies. Calculates qty_to_order per critical SKU. Budget arbitrage — prioritizes by margin. Generates NLG justification. Writes reco_inventaire → State → read by Agent Coach.',
      inputs: ['scores_risque from APP04', 'prévision_demande', 'RAG purchasing policies'],
      outputs: ['reco_inventaire → State', 'alerts → Inventory Dashboard'],
      stateFields: ['reco_inventaire'],
      metrics: [
        { label: 'Recos generated', value: '3' },
        { label: 'LLM', value: 'Mistral-7B' },
        { label: 'Confidence', value: '0.91', color: '#00B894' },
        { label: 'Latency', value: '2.4s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'reco_inventaire — "Order 15 iPhone16Pro before Friday" conf=0.91' },
        { time: '2:32 PM', level: 'success', message: 'reco_inventaire — "Redistribute 6 AppleWatch from BTQ-08" conf=0.84' },
        { time: '2:32 PM', level: 'info', message: 'RAG purchasing policy validation passed — budget constraints OK' },
      ]
    },
    {
      id: 'rag', name: 'RAG Agent', appId: 'APP05-RAG', decisionLatency: 0.1,
      isValidated: true,
      layer: 'support', status: 'DONE', latency: 0.9, lastRun: '2:32 PM',
      description: 'Shared memory agent. PostgreSQL + pgvector. 42k vectors. Serves both Coach Agent and InventoryAdvisor simultaneously. Returns top-3 most similar historical situations.',
      inputs: ['Semantic query from APP07', 'Semantic query from APP09'],
      outputs: ['Top-3 similar cases → APP07', 'Purchasing policies → APP09'],
      stateFields: [],
      metrics: [
        { label: 'Vectors', value: '42k' },
        { label: 'Recall', value: '>95%' },
        { label: 'Latency', value: '0.9s' },
        { label: 'Serving', value: 'APP07 + APP09' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'APP07 query: 3 cases returned — rain+concert context match 0.89' },
        { time: '2:32 PM', level: 'success', message: 'APP09 query: purchasing policy retrieved — supplier lead time 48h' },
        { time: '2:31 PM', level: 'info', message: 'pgvector index healthy — 42,000 embeddings loaded' },
      ]
    },
    {
      id: 'memory', name: 'Memory Agent', appId: 'APP-MEM', decisionLatency: 0.1,
      isValidated: true,
      layer: 'support', status: 'IDLE', latency: 0.5, lastRun: '2:30 PM',
      description: 'Continuous learning. Stores advisor feedback. Updates Milvus embeddings. Calculates drift (threshold 0.15). Signals MLflow if drift detected.',
      inputs: ['Advisor feedback', 'LangGraph State snapshot'],
      outputs: ['Milvus update', 'MLflow signal if drift > 0.15'],
      stateFields: [],
      metrics: [
        { label: 'Drift score', value: '0.08' },
        { label: 'Last update', value: '2:30 PM' },
        { label: 'Feedback stored', value: '7,821' },
        { label: 'Threshold', value: '0.15' },
      ],
      logs: [
        { time: '2:30 PM', level: 'info', message: 'Drift check: 0.08 — below threshold 0.15, no MLflow signal' },
        { time: '2:28 PM', level: 'success', message: 'Milvus updated — 3 new feedback embeddings added' },
        { time: '2:25 PM', level: 'info', message: 'Feedback stored: Karim approved coaching card ADV-02' },
      ]
    },
  ]);

  // ── Computed ──
  // AJOUT : Computed signal to solve template errors
  selectedAgent = computed(() => {
    const id = this.selectedAgentId();
    return id ? this.agents().find(a => a.id === id) || null : null;
  });

  selectAgent(id: string) {
    this.selectedAgentId.update(cur => cur === id ? null : id);

    // Update failure prediction chart for selected agent
    if (id && this.agentPredictions[id]) {
      this.currentAgentId.set(id);
      this.updateFailurePredictionChart();
    }
  }
  private updateFailurePredictionChart() {
    const data = this.currentPrediction();

    this.charts.forEach(chart => {
      if (chart.data.datasets.some(d => d.label === 'Historical Failures')) {
        chart.data.datasets[0].data = [...data.historical, null, null, null, null, null, null, null, null, null, null, null, null];
        chart.data.datasets[1].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.forecast];
        chart.data.datasets[2].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.upper];
        chart.data.datasets[3].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.lower];
        chart.update('active');
      }
    });
  }
  liveCount = computed(() => this.agents().filter(a => a.status === 'LIVE').length);
  activeCount = computed(() => this.agents().filter(a => a.status === 'ACTIVE').length);
  errorCount = computed(() => this.agents().filter(a => a.status === 'ERROR').length);

  totalLatency = computed(() => {
    const sum = this.agents().reduce((a, b) => a + b.latency, 0);
    return sum.toFixed(1);
  });

  agentsByLayer = computed(() => {
    const layers: Record<AgentLayer, AgentDetail[]> = {
      preload: [], orchestrator: [], coaching: [],
      inventory: [], support: [],
    };
    this.agents().forEach(a => layers[a.layer].push(a));
    return layers;
  });

  // ── LangGraph State ──
  stateFields = [
    { key: 'pos_data', owner: 'APP02', sprint: 1, value: 'live', validated: true },
    { key: 'écart_objectif', owner: 'APP02', sprint: 1, value: '44%', validated: true },
    { key: 'niveau_urgence', owner: 'APP02', sprint: 1, value: 'HIGH', validated: true },
    { key: 'stratégie', owner: 'APP05', sprint: 1, value: 'upsell_premium', validated: true },
    { key: 'conseil_final', owner: 'APP07', sprint: 1, value: 'generated', validated: true },
    { key: 'stock_disponible', owner: 'APP08', sprint: 2, value: '{IPH16PRO:3…}', validated: true },
    { key: 'alerte_stock', owner: 'APP08', sprint: 2, value: 'IPH16PRO,APLWTCH', validated: true },
    { key: 'prévision_demande', owner: 'APP03', sprint: 2, value: '{IPH16PRO:11…}', validated: true },
    { key: 'scores_risque', owner: 'APP04', sprint: 2, value: '{IPH16PRO:0.91}', validated: true },
    { key: 'reco_inventaire', owner: 'APP09', sprint: 2, value: 'Order 15 units', validated: false },
  ];

  layers: { key: AgentLayer; label: string; color: string }[] = [
    { key: 'preload', label: 'Pre-load', color: '#00B894' },
    { key: 'orchestrator', label: 'Orchestrator', color: '#6C5CE7' },
    { key: 'coaching', label: 'Coaching', color: '#6C5CE7' },
    { key: 'inventory', label: 'Inventory', color: '#00B894' },
    { key: 'support', label: 'Support', color: '#888780' },
  ];

  // ── Guardrail history (S8.4) ─────────────────────────────────────────────
  private ws = inject(WebSocketService);

  guardrailHistory = computed(() => this.ws.guardrailHistory());

  guardrailStats = computed(() => {
    const h = this.guardrailHistory();
    return {
      total:    h.length,
      blocks:   h.filter(e => e.status === 'BLOCK').length,
      escalates:h.filter(e => e.status === 'ESCALATE').length,
      rewrites: h.filter(e => e.status === 'REWRITE').length,
    };
  });

  constructor(private monitoringService: MonitoringService) {
    this.monitoringKPIs = this.monitoringService.kpis;
  }

  ngOnInit() {
    this.startSimulation();
    this.monitoringService.fetchAgentDependencies().subscribe((data: any) => {
      this.conflicts.set(data);
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.initCharts(), 120);
  }

  ngOnDestroy() {
    this.charts.forEach(c => c.destroy());
  }

  private initCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // --- Sankey Diagram (Dependency Flow) ---
    if (this.dependencyFlowCanvas) {
      const ctx = this.dependencyFlowCanvas.nativeElement.getContext('2d');
      if (ctx) {
        this.charts.push(new Chart(ctx, {
          type: 'sankey',
          data: {
            datasets: [{
              label: 'Agent Flow',
              data: [
                { from: 'Watcher', to: 'Orchestrator', flow: 10 },
                { from: 'Orchestrator', to: 'Analyst', flow: 5 },
                { from: 'Orchestrator', to: 'Inventory', flow: 5 },
                { from: 'Analyst', to: 'Strategist', flow: 4 },
                { from: 'Strategist', to: 'Coach', flow: 4 },
                { from: 'Inventory', to: 'Coach', flow: 2 },
                { from: 'Coach', to: 'RAG', flow: 3 }
              ],
              colorFrom: () => '#6C5CE7',
              colorTo: () => '#00B894',
              colorMode: 'gradient',
              size: 'max',
            }]
          } as any,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
          }
        }));
      }
    }

    // Chart 2 — Enhanced Latency with SLA + Success Rate
    if (this.latencyChartRef) {
      const ctx = this.latencyChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.latencyData.labels,
          datasets: [
            {
              label: 'Orchestrator',
              data: this.latencyData.orchestrator,
              borderColor: '#6C5CE7',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.3,
              yAxisID: 'y',
            },
            {
              label: 'Coach Agent',
              data: this.latencyData.coach,
              borderColor: '#00B894',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.3,
              yAxisID: 'y',
            },
            {
              label: 'Inventory Agent',
              data: this.latencyData.inventory,
              borderColor: '#F9A825',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.3,
              yAxisID: 'y',
            },
            {
              label: 'SLA Threshold (3s)',
              data: this.latencyData.slaThreshold,
              borderColor: '#E74C3C',
              backgroundColor: 'rgba(231, 76, 60, 0.05)',
              borderWidth: 2,
              borderDash: [8, 4],
              pointRadius: 0,
              fill: 'origin',
              tension: 0,
              yAxisID: 'y',
            },
            {
              label: 'Success Rate',
              data: this.latencyData.successRate,
              borderColor: '#2ECC71',
              backgroundColor: 'rgba(46, 204, 113, 0.1)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#2ECC71',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              tension: 0.3,
              yAxisID: 'y1',
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 10, family: 'Inter' },
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 10,
                filter: (item) => {
                  // Group latency agents together, show SLA and Success Rate
                  return true;
                }
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  if (label === 'Success Rate') {
                    return ` ${label}: ${value}%`;
                  } else if (label.includes('SLA')) {
                    return ` ${label}`;
                  } else {
                    return ` ${label}: ${value}s`;
                  }
                }
              }
            }
          },
          scales: {
            y: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 4,
              ticks: {
                font: { size: 10 },
                callback: (value) => value + 's',
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: {
                display: true,
                text: 'Latency (seconds)',
                font: { size: 11, weight: 'bold' },
                color: '#6b7280'
              }
            },
            y1: {
              type: 'linear',
              position: 'right',
              min: 90,
              max: 100,
              ticks: {
                font: { size: 10 },
                callback: (value) => value + '%',
              },
              grid: { display: false },
              title: {
                display: true,
                text: 'Success Rate (%)',
                font: { size: 11, weight: 'bold' },
                color: '#2ECC71'
              }
            },
            x: {
              ticks: { font: { size: 10 } },
              grid: { display: false },
            }
          }
        }
      }));
    }

    // Chart 4 — Santé Prédictive
    if (this.predictiveHealthChartRef) {
      const ctx = this.predictiveHealthChartRef.nativeElement.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['-2h', '-1h', '-30m', '-15m', 'Maintenant'],
          datasets: [{
            label: 'Stabilité',
            data: this.predictiveData(),
            borderColor: '#00B894',
            backgroundColor: 'rgba(0, 184, 148, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { min: 0, max: 100 } },
          animation: { duration: 1000 }
        }
      });
      this.charts.push(chart);
    }

    // --- Coûts (Stacked) - 3 layers: API + Compute + Storage ---
    if (this.costAnalysisChartRef) {
      const ctx = this.costAnalysisChartRef.nativeElement.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Coach', 'Inventory', 'Forecaster', 'RAG'],
          datasets: [
            {
              label: 'API LLM',
              data: this.costDataAPI(),
              backgroundColor: '#6C5CE7',
              borderRadius: 4,
            },
            {
              label: 'Compute',
              data: this.costDataCompute(),
              backgroundColor: '#A29BFE',
              borderRadius: 4,
            },
            {
              label: 'Storage',
              data: this.costDataStorage(),
              backgroundColor: '#DFE6E9',
              borderRadius: 4,
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 10, family: 'Inter' },
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 12,
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.x ? context.parsed.x.toFixed(2) : '0.00';
                  return ` ${label}: $${value}`;
                },
                footer: (tooltipItems) => {
                  const total = tooltipItems.reduce((sum, item) => sum + (item.parsed.x || 0), 0);
                  return `Total: $${total.toFixed(2)}`;
                }
              }
            } 
          },
          scales: {
            x: {
              stacked: true,
              ticks: {
                font: { size: 10 },
                callback: (value) => '$' + value
              },
              title: {
                display: true,
                text: 'Cost (USD)',
                font: { size: 11, weight: 'bold' },
                color: '#6b7280'
              }
            },
            y: {
              stacked: true,
              ticks: {
                font: { size: 11 }
              }
            }
          }
        }
      });
      this.charts.push(chart);
    }

    if (this.ganttChartRef) {
      const ctx = this.ganttChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Watcher', 'Orchestrator', 'Analyst', 'Coach'],
          datasets: [{
            label: 'Intervalle d\'exécution (s)',
            data: [[0, 2], [2, 3], [3, 7], [7, 12]],
            backgroundColor: '#6C5CE7',
            borderRadius: 5,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      }));
    }
    // Chart 6 — Failure Prediction (Prophet ML)
    if (this.failurePredictionChartRef) {
      const ctx = this.failurePredictionChartRef.nativeElement.getContext('2d');
      const data = this.currentPrediction();

      const labels = [
        '-12h', '-11h', '-10h', '-9h', '-8h', '-7h', '-6h', '-5h', '-4h', '-3h', '-2h', '-1h', // Historical
        'Now', '+1h', '+2h', '+3h', '+4h', '+5h', '+6h', '+7h', '+8h', '+9h', '+10h', '+11h'    // Forecast
      ];

      this.charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Historical Failures',
              data: [...data.historical, null, null, null, null, null, null, null, null, null, null, null, null],
              borderColor: '#6C5CE7',
              backgroundColor: 'rgba(108, 92, 231, 0.1)',
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#6C5CE7',
              fill: false,
              tension: 0.3,
            },
            {
              label: 'Predicted Failures',
              data: [null, null, null, null, null, null, null, null, null, null, null, null, ...data.forecast],
              borderColor: '#E74C3C',
              backgroundColor: 'rgba(231, 76, 60, 0.1)',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 4,
              pointBackgroundColor: '#E74C3C',
              fill: false,
              tension: 0.3,
            },
            {
              label: 'Upper Bound (95% CI)',
              data: [null, null, null, null, null, null, null, null, null, null, null, null, ...data.upper],
              borderColor: 'rgba(231, 76, 60, 0.3)',
              backgroundColor: 'rgba(231, 76, 60, 0.05)',
              borderWidth: 1,
              borderDash: [2, 2],
              pointRadius: 0,
              fill: '+1',
              tension: 0.3,
            },
            {
              label: 'Lower Bound (95% CI)',
              data: [null, null, null, null, null, null, null, null, null, null, null, null, ...data.lower],
              borderColor: 'rgba(231, 76, 60, 0.3)',
              backgroundColor: 'rgba(231, 76, 60, 0.05)',
              borderWidth: 1,
              borderDash: [2, 2],
              pointRadius: 0,
              fill: false,
              tension: 0.3,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 10, family: 'Inter' },
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 12,
                filter: (item) => item.text !== 'Upper Bound (95% CI)' && item.text !== 'Lower Bound (95% CI)'
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  if (context.datasetIndex === 0 || context.datasetIndex === 1) {
                    return ` ${context.dataset.label}: ${context.parsed.y} failures`;
                  }
                  return '';
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: { size: 10 },
                stepSize: 1,
                callback: (value) => Math.floor(value as number),
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: {
                display: true,
                text: 'Predicted Failures',
                font: { size: 11, weight: 'bold' },
                color: '#6b7280'
              }
            },
            x: {
              ticks: {
                font: { size: 9 },
                maxRotation: 45,
                minRotation: 45
              },
              grid: { display: false },
            }
          }
        }
      }));
    }
  }

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
      preload: '#00B894', orchestrator: '#6C5CE7', coaching: '#6C5CE7',
      inventory: '#00B894', support: '#888780',
    };
    return m[layer];
  }

  layerBg(layer: AgentLayer): string {
    const m: Record<AgentLayer, string> = {
      preload: '#E0FAF4', orchestrator: '#EEEDFE', coaching: '#EEEDFE',
      inventory: '#E0FAF4', support: '#F1EFE8',
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

  getSeverityColor(level: string): string {
    return level === 'high' ? '#d63031' : level === 'medium' ? '#e17055' : '#fab1a0';
  }

  private startSimulation() {
    setInterval(() => {
      this.agents.update(list => list.map(agent => {
        if (agent.status === 'RUN' || agent.status === 'ACTIVE') {
          const variation = (Math.random() - 0.5) * 0.2;
          return { ...agent, latency: Math.max(0.1, +(agent.latency + variation).toFixed(1)) };
        }
        return agent;
      }));

      const currentPredictive = [...this.predictiveData()];
      currentPredictive.shift();
      const lastValue = currentPredictive[currentPredictive.length - 1];
      const newScore = Math.max(80, Math.min(100, lastValue + (Math.random() - 0.5) * 6));
      currentPredictive.push(+newScore.toFixed(0));

      this.predictiveData.set(currentPredictive);
      this.healthScore.set(+newScore.toFixed(0));

      // ── Update failure prediction for current agent (NEW) ──
      const currentAgentId = this.currentAgentId();
      if (this.agentPredictions[currentAgentId]) {
        const currentPrediction = this.agentPredictions[currentAgentId];
        const newHistorical = [...currentPrediction.historical];
        newHistorical.shift();
        newHistorical.push(Math.random() > 0.7 ? 1 : 0);

        const newForecast = currentPrediction.forecast.map((v: number) =>
          Math.max(0, Math.floor(v + (Math.random() - 0.5) * 2))
        );

        this.agentPredictions[currentAgentId] = {
          historical: newHistorical,
          forecast: newForecast,
          upper: newForecast.map((v: number) => v + 2),
          lower: newForecast.map((v: number) => Math.max(0, v - 1)),
        };
      }
      // ── Update all charts ──
      this.charts.forEach(chart => {
        const firstDataset = chart.data.datasets[0];

        // Update Predictive Health chart
        if (firstDataset && (firstDataset.label === 'Stabilité' || firstDataset.label === 'Score Prédit')) {
          firstDataset.data = [...currentPredictive];
          chart.update('none');
        }

        if (firstDataset && firstDataset.label === 'API LLM') {
          // Update API costs
          const currentCostsAPI = [...this.costDataAPI()];
          const updatedCostsAPI = currentCostsAPI.map(c => Math.max(0.1, +(c + (Math.random() - 0.5) * 0.02).toFixed(2)));
          this.costDataAPI.set(updatedCostsAPI);

          // Update Compute costs
          const currentCostsCompute = [...this.costDataCompute()];
          const updatedCostsCompute = currentCostsCompute.map(c => Math.max(0.05, +(c + (Math.random() - 0.5) * 0.01).toFixed(2)));
          this.costDataCompute.set(updatedCostsCompute);

          // Update Storage costs
          const currentCostsStorage = [...this.costDataStorage()];
          const updatedCostsStorage = currentCostsStorage.map(c => Math.max(0.02, +(c + (Math.random() - 0.5) * 0.005).toFixed(2)));
          this.costDataStorage.set(updatedCostsStorage);

          // Update chart datasets
          chart.data.datasets[0].data = updatedCostsAPI;
          chart.data.datasets[1].data = updatedCostsCompute;
          chart.data.datasets[2].data = updatedCostsStorage;
          chart.update('none');
        }

        // Update Failure Prediction chart (NEW)
        if (chart.data.datasets.some(d => d.label === 'Historical Failures')) {
          const data = this.currentPrediction();
          chart.data.datasets[0].data = [...data.historical, null, null, null, null, null, null, null, null, null, null, null, null];
          chart.data.datasets[1].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.forecast];
          chart.data.datasets[2].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.upper];
          chart.data.datasets[3].data = [null, null, null, null, null, null, null, null, null, null, null, null, ...data.lower];
          chart.update('none');
        }
      });

      this.cycleStep.update(s => s >= this.totalSteps ? 1 : s + 1);
    }, 3000);
  }
}