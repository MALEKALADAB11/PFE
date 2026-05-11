import {
  Component, signal, computed, AfterViewInit,
  ViewChild, ElementRef, OnDestroy, OnInit
} from '@angular/core';
import { Component, signal, computed, AfterViewInit,
         ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';

type AgentStatus = 'LIVE' | 'ACTIVE' | 'DONE' | 'RUN' | 'ERROR' | 'IDLE' | 'WAIT';
type AgentLayer = 'preload' | 'orchestrator' | 'coaching' | 'inventory' | 'support';

interface AgentLog {
  time: string;
  level: 'info' | 'warn' | 'error' | 'success';
type AgentLayer  = 'preload' | 'orchestrator' | 'coaching' | 'inventory' | 'support';

interface AgentLog {
  time:    string;
  level:   'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface AgentDetail {
  id: string;
  name: string;
  appId: string;
  layer: AgentLayer;
  status: AgentStatus;
  latency: number;
  decisionLatency: number; // PFE - Performance IA
  isValidated: boolean;    // PFE - Data Validation
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
  validated: boolean; // PFE - Shield Status
}

interface Conflict {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  severityLevel: string;
  msg: string;
}

@Component({
  selector: 'app-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monitoring.html',
  styleUrl: './monitoring.scss'
})
export class MonitoringComponent implements AfterViewInit, OnDestroy, OnInit {

  @ViewChild('confidenceChart') confidenceChartRef!: ElementRef;
  @ViewChild('latencyChart') latencyChartRef!: ElementRef;
  @ViewChild('predictiveHealthChart') predictiveHealthChartRef!: ElementRef;
  id:          string;
  name:        string;
  appId:       string;
  layer:       AgentLayer;
  status:      AgentStatus;
  latency:     number;
  lastRun:     string;
  description: string;
  inputs:      string[];
  outputs:     string[];
  stateFields: string[];
  logs:        AgentLog[];
  metrics: { label: string; value: string; color?: string; }[];
}

@Component({
  selector:    'app-monitoring',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './monitoring.html',
  styleUrl:    './monitoring.scss'
})
export class MonitoringComponent implements AfterViewInit, OnDestroy {

  @ViewChild('confidenceChart') confidenceChartRef!: ElementRef;
  @ViewChild('latencyChart')    latencyChartRef!:    ElementRef;
  @ViewChild('cycleChart')      cycleChartRef!:      ElementRef;

  private charts: Chart[] = [];

  selectedAgentId = signal<string | null>(null);
  lastCycle = signal('2:32 PM');
  nextCycle = signal('3:02 PM');
  cycleStep = signal(9);
  totalSteps = 12;

  // ── PROJET PFE : Signaux pour la BI et les Conflits ──
  healthScore = signal<number>(94);

  conflicts = signal<any[]>([
    { id: 'c1', sourceAgentId: 'app08-watcher', targetAgentId: 'app02-analyst', severityLevel: 'high', msg: 'Désynchronisation de flux' },
    { id: 'c2', sourceAgentId: 'app02-analyst', targetAgentId: 'app06-orch', severityLevel: 'medium', msg: 'Latence décisionnelle élevée' }
  ]);

  // ── Chart data ──
  confidenceData = {
    labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    inventory: [82, 85, 79, 87, 91, 86, 93, 90],
    risk: [74, 77, 72, 80, 86, 76, 87, 84],
  };

  latencyData = {
    labels: ['2:00', '2:05', '2:10', '2:15', '2:20', '2:25', '2:30', '2:32'],
    orchestrator: [0.3, 0.3, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3],
    coach: [2.0, 2.3, 1.9, 2.1, 2.4, 2.0, 2.1, 2.1],
    inventory: [2.2, 2.5, 2.1, 2.3, 2.6, 2.2, 2.4, 2.4],
  };

  predictiveData = {
    labels: ['T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'Now'],
    health: [98, 97, 92, 89, 94, 94]
  };

  // ── Liste complète des 10 agents (Architecture PFE) ──
  agents = signal<AgentDetail[]>([
    {
      id: 'app08-watcher', name: 'InventoryWatcher', appId: 'APP08',
      layer: 'preload', status: 'LIVE', latency: 0.8, decisionLatency: 0.1, isValidated: true,
      lastRun: '2:32 PM',
      description: 'Starts BEFORE every cycle. Polls WMS/ERP every 60s.',
      inputs: ['WMS / ERP continuous feed', 'Min/max thresholds'],
      outputs: ['stock_disponible[]', 'alerte_stock → Orchestrator'],
      stateFields: ['stock_disponible', 'alerte_stock'],
      metrics: [{ label: 'Poll interval', value: '60s' }, { label: 'Active alerts', value: '2', color: '#E74C3C' }],
      logs: [{ time: '2:32 PM', level: 'success', message: 'stock_disponible[] written' }]
    },
    {
      id: 'app06-orch', name: 'Orchestrator', appId: 'APP06',
      layer: 'orchestrator', status: 'ACTIVE', latency: 0.3, decisionLatency: 0.05, isValidated: true,
      lastRun: '2:32 PM',
      description: 'Central brain of the system. Routes state updates to relevant agents.',
      inputs: ['State updates', 'Event bus'],
      outputs: ['Next node triggers'],
      stateFields: ['thread_id', 'next_step'],
      metrics: [{ label: 'Decisions/s', value: '14' }, { label: 'Active nodes', value: '4' }],
      logs: [{ time: '2:32 PM', level: 'info', message: 'Routing to InventoryAdvisor' }]
    },
    {
      id: 'app02-analyst', name: 'Agent Analyste', appId: 'APP02',
      layer: 'coaching', status: 'LIVE', latency: 1.4, decisionLatency: 0.4, isValidated: true,
      lastRun: '2:32 PM',
      description: 'Calculates gap vs daily target. Calls TimesFM for EOD forecast.',
      inputs: ['Live POS feed', 'TimesFM forecast'],
      outputs: ['gap_objectif', 'niveau_urgence'],
      stateFields: ['pos_data', 'écart_objectif'],
      metrics: [{ label: 'Current gap', value: '44%', color: '#E74C3C' }, { label: 'Urgency', value: 'HIGH' }],
      logs: [{ time: '2:32 PM', level: 'warn', message: 'gap=44% detected' }]
    },
    {
      id: 'app05-strat', name: 'Agent Stratège', appId: 'APP05',
      layer: 'coaching', status: 'LIVE', latency: 1.8, decisionLatency: 0.7, isValidated: true,
      lastRun: '2:32 PM',
      description: 'Defines the best strategy based on analyst results and RAG history.',
      inputs: ['gap_objectif', 'historical_patterns'],
      outputs: ['stratégie_id'],
      stateFields: ['stratégie_appliquée'],
      metrics: [{ label: 'Model', value: 'GPT-4o' }, { label: 'Confidence', value: '92%' }],
      logs: [{ time: '2:31 PM', level: 'success', message: 'Strategy "Aggressive Restock" selected' }]
    },
    {
      id: 'app07-coach', name: 'Agent Coach', appId: 'APP07',
      layer: 'coaching', status: 'RUN', latency: 2.1, decisionLatency: 1.2, isValidated: false,
      lastRun: '2:32 PM',
      description: 'Generates NL advice via vLLM Mistral-7B.',
      inputs: ['stratégie from State', 'stock_disponible[]'],
      outputs: ['conseil_final → State'],
      stateFields: ['conseil_final'],
      metrics: [{ label: 'LLM', value: 'Mistral-7B' }, { label: 'Quality score', value: '0.87' }],
      logs: [{ time: '2:32 PM', level: 'success', message: 'vLLM generation started' }]
    },
    {
      id: 'app03-forecast', name: 'ForecastEngine', appId: 'APP03',
      layer: 'inventory', status: 'LIVE', latency: 2.5, decisionLatency: 1.1, isValidated: true,
      lastRun: '2:30 PM',
      description: 'Predicts demand for the next 7 days using TimesFM models.',
      inputs: ['Historical sales', 'Seasonality'],
      outputs: ['demand_forecast[]'],
      stateFields: ['forecast_values'],
      metrics: [{ label: 'MAPE', value: '12%' }, { label: 'Model', value: 'TimesFM' }],
      logs: [{ time: '2:30 PM', level: 'info', message: 'D+7 Forecast updated' }]
    },
    {
      id: 'app04-gap', name: 'GapDetector', appId: 'APP04',
      layer: 'inventory', status: 'DONE', latency: 0.5, decisionLatency: 0.1, isValidated: true,
      lastRun: '2:25 PM',
      description: 'Identifies discrepancies between forecasted demand and current stock.',
      inputs: ['stock_disponible', 'demand_forecast'],
      outputs: ['gap_list[]'],
      stateFields: ['detected_gaps'],
      metrics: [{ label: 'Gaps found', value: '12' }],
      logs: [{ time: '2:25 PM', level: 'success', message: 'Gap analysis complete' }]
    },
    {
      id: 'app09-inv', name: 'InventoryAdvisor', appId: 'APP09',
      layer: 'inventory', status: 'WAIT', latency: 1.1, decisionLatency: 0.8, isValidated: false,
      lastRun: '2:28 PM',
      description: 'Suggests specific purchase orders or stock movements.',
      inputs: ['gap_list', 'supplier_constraints'],
      outputs: ['purchase_recommendations'],
      stateFields: ['reco_inventaire'],
      metrics: [{ label: 'ROI Est.', value: '+14%' }],
      logs: [{ time: '2:28 PM', level: 'info', message: 'Waiting for coach validation' }]
    },
    {
      id: 'app10-rag', name: 'RAG Service', appId: 'APP10',
      layer: 'support', status: 'LIVE', latency: 0.9, decisionLatency: 0.3, isValidated: true,
      lastRun: 'Ongoing',
      description: 'Vector database search for contextual historical data.',
      inputs: ['Natural Language Query'],
      outputs: ['Context chunks'],
      stateFields: ['last_retrieval'],
      metrics: [{ label: 'Latency', value: '140ms' }, { label: 'Chunks', value: '5' }],
      logs: [{ time: '2:32 PM', level: 'info', message: 'Embedding query generated' }]
    },
    {
      id: 'app11-mem', name: 'LongTermMemory', appId: 'APP11',
      layer: 'support', status: 'LIVE', latency: 0.4, decisionLatency: 0.1, isValidated: true,
      lastRun: 'Ongoing',
      description: 'Persistent storage of user preferences and session history.',
      inputs: ['Session data'],
      outputs: ['User profile context'],
      stateFields: ['user_preferences'],
      metrics: [{ label: 'Size', value: '1.2GB' }],
      logs: [{ time: '2:30 PM', level: 'success', message: 'Preferences persisted' }]
    }
  ]);

  lastCycle       = signal('2:32 PM');
  nextCycle       = signal('3:02 PM');
  cycleStep       = signal(9);
  totalSteps      = 12;

  // ── Chart data ──
  confidenceData = {
    labels:    ['W1','W2','W3','W4','W5','W6','W7','W8'],
    inventory: [82, 85, 79, 87, 91, 86, 93, 90],
    risk:      [74, 77, 72, 80, 86, 76, 87, 84],
  };

  latencyData = {
    labels:       ['2:00','2:05','2:10','2:15','2:20','2:25','2:30','2:32'],
    orchestrator: [0.3, 0.3, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3],
    coach:        [2.0, 2.3, 1.9, 2.1, 2.4, 2.0, 2.1, 2.1],
    inventory:    [2.2, 2.5, 2.1, 2.3, 2.6, 2.2, 2.4, 2.4],
  };

  cycleData = {
    labels:   ['#40','#41','#42','#43','#44','#45','#46','#47'],
    duration: [16.2, 17.8, 15.9, 18.1, 17.4, 16.8, 17.4, 18.0],
  };

  // ── Agents ──
  agents = signal<AgentDetail[]>([
    {
      id: 'app08-watcher', name: 'InventoryWatcher', appId: 'APP08',
      layer: 'preload', status: 'LIVE', latency: 0.8, lastRun: '2:32 PM',
      description: 'Starts BEFORE every cycle. Polls WMS/ERP every 60s, compares stock vs thresholds, generates alerts and writes stock_disponible[] to LangGraph State.',
      inputs:      ['WMS / ERP continuous feed', 'Min/max thresholds'],
      outputs:     ['stock_disponible[]', 'alerte_stock → Orchestrator'],
      stateFields: ['stock_disponible', 'alerte_stock'],
      metrics: [
        { label: 'Poll interval',   value: '60s' },
        { label: 'SKUs monitored',  value: '6' },
        { label: 'Active alerts',   value: '2', color: '#E74C3C' },
        { label: 'Last write',      value: '2:32 PM' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'stock_disponible[] written — iPhone16Pro: 3 units' },
        { time: '2:31 PM', level: 'warn',    message: 'alerte_stock triggered — IPH16PRO qty=3 below threshold=8' },
        { time: '2:30 PM', level: 'info',    message: 'WMS poll complete — 6 SKUs checked' },
      ]
    },
    {
      id: 'app06', name: 'Orchestrator LangGraph', appId: 'APP06',
      layer: 'orchestrator', status: 'ACTIVE', latency: 0.3, lastRun: '2:32 PM',
      description: 'Central brain. Receives POS events + enriched context. Reads stock_disponible[] from State. Routes to agents conditionally: urgency=HIGH → Analyst, gap>30% → Strategist, stock_alert → Inventory pipeline, conseil_prêt → Coach.',
      inputs:      ['POS event + context', 'alerte_stock from APP08', 'State snapshot'],
      outputs:     ['Route → Analyst', 'Route → Strategist', 'Route → Coach', 'Route → Inventory pipeline'],
      stateFields: ['all fields (read + route)'],
      metrics: [
        { label: 'Cycle duration',    value: '~18s' },
        { label: 'Routing decisions', value: '4' },
        { label: 'Degraded mode',     value: 'Ready' },
        { label: 'Active since',      value: '9:00 AM' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Cycle #47 started — alerte_stock detected, routing to Inventory pipeline' },
        { time: '2:32 PM', level: 'info',    message: 'stock_disponible[] read from State — guard active for Coach' },
        { time: '2:31 PM', level: 'info',    message: 'Cycle #46 complete in 17.4s' },
      ]
    },
    {
      id: 'app02', name: 'Agent Analyste', appId: 'APP02',
      layer: 'coaching', status: 'LIVE', latency: 1.4, lastRun: '2:32 PM',
      description: 'Receives live POS feed. Calculates gap vs daily target. Calls TimesFM for EOD forecast. Detects urgency level HIGH / MEDIUM / LOW. Writes to LangGraph State.',
      inputs:      ['Live POS feed', 'TimesFM forecast', 'Daily target'],
      outputs:     ['gap_objectif', 'niveau_urgence', 'écart_objectif → State'],
      stateFields: ['pos_data', 'écart_objectif', 'niveau_urgence'],
      metrics: [
        { label: 'Current gap',  value: '44%', color: '#E74C3C' },
        { label: 'Urgency',      value: 'HIGH', color: '#E74C3C' },
        { label: 'EOD forecast', value: '6,800 DT' },
        { label: 'Latency',      value: '1.4s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'warn',    message: 'gap=44% detected — urgency set to HIGH' },
        { time: '2:32 PM', level: 'success', message: 'TimesFM EOD forecast: 6,800 DT [5,400–8,200]' },
        { time: '2:32 PM', level: 'info',    message: 'POS snapshot processed — 4 advisors, 42 transactions' },
      ]
    },
    {
      id: 'app05', name: 'Agent Stratège', appId: 'APP05',
      layer: 'coaching', status: 'LIVE', latency: 1.1, lastRun: '2:32 PM',
      description: 'Receives urgency score from State. Queries RAG pgvector for similar past situations. Analyzes weather + event context. Builds optimal strategy per advisor.',
      inputs:      ['niveau_urgence from State', 'RAG pgvector query', 'Weather + events context'],
      outputs:     ['stratégie → State', 'confiance score'],
      stateFields: ['stratégie'],
      metrics: [
        { label: 'Strategy',    value: 'upsell_premium' },
        { label: 'Confidence',  value: '0.87', color: '#00B894' },
        { label: 'RAG results', value: '3 cases' },
        { label: 'Latency',     value: '1.1s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Strategy "upsell_premium" written — confidence 0.87' },
        { time: '2:32 PM', level: 'info',    message: 'RAG query: 3 similar cases found (rain + concert context)' },
        { time: '2:31 PM', level: 'info',    message: 'Weather signal processed: rain +40% accessories demand' },
      ]
    },
    {
      id: 'app07', name: 'Agent Coach', appId: 'APP07',
      layer: 'coaching', status: 'RUN', latency: 2.1, lastRun: '2:32 PM',
      description: 'Reads strategy from State. READS stock_disponible[] BEFORE any generation — if stock=0, product is EXCLUDED from advice. Optimizes prompt via DSPy. Generates NL advice via vLLM Mistral-7B in < 2s.',
      inputs:      ['stratégie from State', 'stock_disponible[] (guard)', 'RAG context'],
      outputs:     ['conseil_final → State', 'conseil NLG → Dashboard < 2s'],
      stateFields: ['conseil_final'],
      metrics: [
        { label: 'LLM',           value: 'Mistral-7B' },
        { label: 'Latency p95',   value: '2.1s' },
        { label: 'Quality score', value: '0.87', color: '#00B894' },
        { label: 'Guard active',  value: 'YES',  color: '#00B894' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'stock guard OK — iPhone16Pro badge "last units" added to script' },
        { time: '2:32 PM', level: 'info',    message: 'DSPy prompt optimized — vLLM generation started' },
        { time: '2:31 PM', level: 'success', message: 'conseil_final written — quality score 0.87' },
      ]
    },
    {
      id: 'app03-forecast', name: 'ForecastEngine', appId: 'APP03',
      layer: 'inventory', status: 'LIVE', latency: 1.8, lastRun: '2:32 PM',
      description: 'NEW — Replaces TimesFM assistant. Receives SKU alert list from APP08. Loads TimesFM (already instantiated). Forecasts demand D+1 to D+7 per SKU. Calculates trend: rising/falling/stable. Confidence interval 80%.',
      inputs:      ['SKU alert list from APP08', 'TimesFM model (instantiated)'],
      outputs:     ['prévision_demande', 'trend_signal → State'],
      stateFields: ['prévision_demande'],
      metrics: [
        { label: 'Horizon',       value: 'D+1 to D+7' },
        { label: 'MAPE',          value: '14.3%' },
        { label: 'CI',            value: '80%' },
        { label: 'SKUs forecast', value: '3' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'Demand forecast: iPhone16Pro D+1=11, D+7=68 — trend: rising' },
        { time: '2:32 PM', level: 'info',    message: 'TimesFM loaded — 3 SKUs in alert queued for forecast' },
        { time: '2:31 PM', level: 'info',    message: 'MAPE validation: 14.3% — within target <20%' },
      ]
    },
    {
      id: 'app04-gap', name: 'GapDetector', appId: 'APP04',
      layer: 'inventory', status: 'ACTIVE', latency: 0.2, lastRun: '2:32 PM',
      description: 'NEW. Receives stock_disponible + prévision_demande. Calculates days remaining = qty / avg_daily_demand. Score rupture = 1 − (days_remaining / delay_supplier). Detects overstock if qty > 3× demand_30j. Prioritizes SKUs by risk score.',
      inputs:      ['stock_disponible from State', 'prévision_demande from APP03'],
      outputs:     ['scores_risque{sku→score}', 'demand_7j + trend → APP09'],
      stateFields: ['scores_risque'],
      metrics: [
        { label: 'IPH16PRO risk', value: '0.91', color: '#E74C3C' },
        { label: 'APLWTCH risk',  value: '0.88', color: '#E74C3C' },
        { label: 'AIRPDP3 risk',  value: '0.73', color: '#F9A825' },
        { label: 'Latency',       value: '0.2s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'error', message: 'IPH16PRO risk=0.91 CRITICAL — days_remaining=0.27' },
        { time: '2:32 PM', level: 'error', message: 'APLWTCH risk=0.88 CRITICAL — redistribution recommended' },
        { time: '2:32 PM', level: 'warn',  message: 'AIRPDP3 risk=0.73 HIGH — rain signal driving demand' },
      ]
    },
    {
      id: 'app09', name: 'InventoryAdvisor', appId: 'APP09',
      layer: 'inventory', status: 'LIVE', latency: 2.4, lastRun: '2:32 PM',
      description: 'CORE of Inventory Advisor. Receives scores_risque + prévision_demande + RAG purchasing policies. Calculates qty_to_order per critical SKU. Budget arbitrage — prioritizes by margin. Generates NLG justification. Writes reco_inventaire → State → read by Agent Coach.',
      inputs:      ['scores_risque from APP04', 'prévision_demande', 'RAG purchasing policies'],
      outputs:     ['reco_inventaire → State', 'alerts → Inventory Dashboard'],
      stateFields: ['reco_inventaire'],
      metrics: [
        { label: 'Recos generated', value: '3' },
        { label: 'LLM',             value: 'Mistral-7B' },
        { label: 'Confidence',      value: '0.91', color: '#00B894' },
        { label: 'Latency',         value: '2.4s' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'reco_inventaire — "Order 15 iPhone16Pro before Friday" conf=0.91' },
        { time: '2:32 PM', level: 'success', message: 'reco_inventaire — "Redistribute 6 AppleWatch from BTQ-08" conf=0.84' },
        { time: '2:32 PM', level: 'info',    message: 'RAG purchasing policy validation passed — budget constraints OK' },
      ]
    },
    {
      id: 'rag', name: 'RAG Agent', appId: 'APP05-RAG',
      layer: 'support', status: 'DONE', latency: 0.9, lastRun: '2:32 PM',
      description: 'Shared memory agent. PostgreSQL + pgvector. 42k vectors. Serves both Coach Agent and InventoryAdvisor simultaneously. Returns top-3 most similar historical situations.',
      inputs:      ['Semantic query from APP07', 'Semantic query from APP09'],
      outputs:     ['Top-3 similar cases → APP07', 'Purchasing policies → APP09'],
      stateFields: [],
      metrics: [
        { label: 'Vectors', value: '42k' },
        { label: 'Recall',  value: '>95%' },
        { label: 'Latency', value: '0.9s' },
        { label: 'Serving', value: 'APP07 + APP09' },
      ],
      logs: [
        { time: '2:32 PM', level: 'success', message: 'APP07 query: 3 cases returned — rain+concert context match 0.89' },
        { time: '2:32 PM', level: 'success', message: 'APP09 query: purchasing policy retrieved — supplier lead time 48h' },
        { time: '2:31 PM', level: 'info',    message: 'pgvector index healthy — 42,000 embeddings loaded' },
      ]
    },
    {
      id: 'memory', name: 'Memory Agent', appId: 'APP-MEM',
      layer: 'support', status: 'IDLE', latency: 0.5, lastRun: '2:30 PM',
      description: 'Continuous learning. Stores advisor feedback. Updates Milvus embeddings. Calculates drift (threshold 0.15). Signals MLflow if drift detected.',
      inputs:      ['Advisor feedback', 'LangGraph State snapshot'],
      outputs:     ['Milvus update', 'MLflow signal if drift > 0.15'],
      stateFields: [],
      metrics: [
        { label: 'Drift score',      value: '0.08' },
        { label: 'Last update',      value: '2:30 PM' },
        { label: 'Feedback stored',  value: '7,821' },
        { label: 'Threshold',        value: '0.15' },
      ],
      logs: [
        { time: '2:30 PM', level: 'info',    message: 'Drift check: 0.08 — below threshold 0.15, no MLflow signal' },
        { time: '2:28 PM', level: 'success', message: 'Milvus updated — 3 new feedback embeddings added' },
        { time: '2:25 PM', level: 'info',    message: 'Feedback stored: Karim approved coaching card ADV-02' },
      ]
    },
  ]);

  // ── Computed ──
  selectedAgent = computed(() =>
    this.agents().find(a => a.id === this.selectedAgentId()) ?? null
  );

  liveCount = computed(() => this.agents().filter(a => a.status === 'LIVE').length);
  activeCount = computed(() => this.agents().filter(a => a.status === 'ACTIVE').length);
  errorCount = computed(() => this.agents().filter(a => a.status === 'ERROR').length);
  liveCount    = computed(() => this.agents().filter(a => a.status === 'LIVE').length);
  activeCount  = computed(() => this.agents().filter(a => a.status === 'ACTIVE').length);
  errorCount   = computed(() => this.agents().filter(a => a.status === 'ERROR').length);

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

  stateFields: StateField[] = [
    { key: 'pos_data', owner: 'APP02', sprint: 1, value: 'live', validated: true },
    { key: 'écart_objectif', owner: 'APP02', sprint: 1, value: '44%', validated: true },
    { key: 'stock_disponible', owner: 'APP08', sprint: 2, value: '{IPH16PRO:3…}', validated: true },
    { key: 'reco_inventaire', owner: 'APP09', sprint: 2, value: 'Order 15 units', validated: false },
  ];

  layers: { key: AgentLayer; label: string; color: string }[] = [
    { key: 'preload', label: 'Pre-load', color: '#00B894' },
    { key: 'orchestrator', label: 'Orchestrator', color: '#6C5CE7' },
    { key: 'coaching', label: 'Coaching', color: '#6C5CE7' },
    { key: 'inventory', label: 'Inventory', color: '#00B894' },
    { key: 'support', label: 'Support', color: '#888780' },
  ];

  ngOnInit() {
    this.startSimulation();
  }

  // ── LangGraph State ──
  stateFields = [
    { key: 'pos_data',          owner: 'APP02', sprint: 1, value: 'live'             },
    { key: 'écart_objectif',    owner: 'APP02', sprint: 1, value: '44%'              },
    { key: 'niveau_urgence',    owner: 'APP02', sprint: 1, value: 'HIGH'             },
    { key: 'stratégie',         owner: 'APP05', sprint: 1, value: 'upsell_premium'   },
    { key: 'conseil_final',     owner: 'APP07', sprint: 1, value: 'generated'        },
    { key: 'stock_disponible',  owner: 'APP08', sprint: 2, value: '{IPH16PRO:3…}'    },
    { key: 'alerte_stock',      owner: 'APP08', sprint: 2, value: 'IPH16PRO,APLWTCH' },
    { key: 'prévision_demande', owner: 'APP03', sprint: 2, value: '{IPH16PRO:11…}'   },
    { key: 'scores_risque',     owner: 'APP04', sprint: 2, value: '{IPH16PRO:0.91}'  },
    { key: 'reco_inventaire',   owner: 'APP09', sprint: 2, value: 'Order 15 units'   },
  ];

  layers: { key: AgentLayer; label: string; color: string }[] = [
    { key: 'preload',      label: 'Pre-load',     color: '#00B894' },
    { key: 'orchestrator', label: 'Orchestrator', color: '#6C5CE7' },
    { key: 'coaching',     label: 'Coaching',     color: '#6C5CE7' },
    { key: 'inventory',    label: 'Inventory',    color: '#00B894' },
    { key: 'support',      label: 'Support',      color: '#888780' },
  ];

  // ── Lifecycle ──
  ngAfterViewInit() {
    setTimeout(() => this.initCharts(), 120);
  }

  ngOnDestroy() {
    this.charts.forEach(c => c.destroy());
  }

  getHealthColor(): string {
    const score = this.healthScore();
    if (score > 90) return '#00B894';
    if (score > 70) return '#F1C40F';
    return '#E74C3C';
  }

  getSeverityColor(level: string): string {
    return level === 'high' ? '#d63031' : level === 'medium' ? '#e17055' : '#fab1a0';
  }

  private initCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // Chart Confidence
    // Chart 1 — Confidence
    if (this.confidenceChartRef) {
      const ctx = this.confidenceChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.confidenceData.labels,
          datasets: [
            {
              label: 'Inventory agent',
              data: this.confidenceData.inventory,
              borderColor: '#6C5CE7',
              backgroundColor: 'rgba(108,92,231,0.08)',
              borderWidth: 2.5,
              pointRadius: 4,
              data:  this.confidenceData.inventory,
              borderColor:     '#6C5CE7',
              backgroundColor: 'rgba(108,92,231,0.08)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#6C5CE7',
              tension: 0.4,
              fill: true,
            },
            {
              label: 'Risk agent',
              data: this.confidenceData.risk,
              borderColor: '#F9A825',
              backgroundColor: 'rgba(249,168,37,0.06)',
              borderWidth: 2.5,
              pointRadius: 4,
              data:  this.confidenceData.risk,
              borderColor:     '#F9A825',
              backgroundColor: 'rgba(249,168,37,0.06)',
              borderWidth: 2.5,
              pointRadius: 4,
              pointBackgroundColor: '#F9A825',
              tension: 0.4,
              fill: true,
            },
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      }));
    }

    // Chart Latency
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { size: 11, family: 'Inter' },
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 16,
              }
            },
            tooltip: {
              callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%` }
            }
          },
          scales: {
            y: {
              min: 60, max: 100,
              ticks: {
                font: { size: 10 },
                callback: (v) => v + '%',
                stepSize: 5,
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: {
              ticks: { font: { size: 10 } },
              grid:  { display: false },
            }
          }
        }
      }));
    }

    // Chart 2 — Latency
    if (this.latencyChartRef) {
      const ctx = this.latencyChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.latencyData.labels,
          datasets: [
            { label: 'Orchestrator', data: this.latencyData.orchestrator, borderColor: '#6C5CE7', tension: 0.3 },
            { label: 'Coach agent', data: this.latencyData.coach, borderColor: '#00B894', tension: 0.3 },
            { label: 'Inventory agent', data: this.latencyData.inventory, borderColor: '#F9A825', tension: 0.3 },
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      }));
    }

    // Chart Predictive Health (PFE BI)
    if (this.predictiveHealthChartRef) {
      const ctx = this.predictiveHealthChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: this.predictiveData.labels,
          datasets: [{
            label: 'System Health %',
            data: this.predictiveData.health,
            backgroundColor: (context: any) => (context.raw as number) > 90 ? '#00B89488' : '#F1C40F88',
            borderColor: (context: any) => (context.raw as number) > 90 ? '#00B894' : '#F1C40F',
            borderWidth: 1
            {
              label: 'Orchestrator',
              data:  this.latencyData.orchestrator,
              borderColor: '#6C5CE7', backgroundColor: 'transparent',
              borderWidth: 2, pointRadius: 3, tension: 0.3,
            },
            {
              label: 'Coach agent',
              data:  this.latencyData.coach,
              borderColor: '#00B894', backgroundColor: 'transparent',
              borderWidth: 2, pointRadius: 3, tension: 0.3,
            },
            {
              label: 'Inventory agent',
              data:  this.latencyData.inventory,
              borderColor: '#F9A825', backgroundColor: 'transparent',
              borderWidth: 2, pointRadius: 3, tension: 0.3,
            },
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
                font: { size: 11, family: 'Inter' },
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 14,
              }
            },
            tooltip: {
              callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}s` }
            }
          },
          scales: {
            y: {
              min: 0,
              ticks: {
                font: { size: 10 },
                callback: (v) => v + 's',
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: {
              ticks: { font: { size: 10 } },
              grid:  { display: false },
            }
          }
        }
      }));
    }

    // Chart 3 — Cycle duration
    if (this.cycleChartRef) {
      const ctx = this.cycleChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: this.cycleData.labels,
          datasets: [{
            label: 'Cycle duration (s)',
            data:  this.cycleData.duration,
            backgroundColor: this.cycleData.duration.map(v =>
              v > 18 ? 'rgba(231,76,60,0.7)' :
              v > 17 ? 'rgba(249,168,37,0.7)' :
                       'rgba(108,92,231,0.7)'
            ),
            borderColor: this.cycleData.duration.map(v =>
              v > 18 ? '#E74C3C' :
              v > 17 ? '#F9A825' : '#6C5CE7'
            ),
            borderWidth: 1.5,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 80, max: 100, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 } }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (c) => ` Duration: ${c.parsed.y}s` }
            }
          },
          scales: {
            y: {
              min: 14, max: 20,
              ticks: {
                font: { size: 10 },
                callback: (v) => v + 's',
              },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: {
              ticks: { font: { size: 10 } },
              grid:  { display: false },
            }
          }
        }
      }));
    }
  }

  // ── Methods ──
  selectAgent(id: string) {
    this.selectedAgentId.update(cur => cur === id ? null : id);
  }

  statusColor(s: AgentStatus): string {
    const m: Record<AgentStatus, string> = {
      LIVE: '#00B894', ACTIVE: '#6C5CE7', DONE: '#9CA3AF',
      RUN: '#F9A825', ERROR: '#E74C3C', IDLE: '#B4B2A9', WAIT: '#2D9CDB'
      RUN:  '#F9A825', ERROR:  '#E74C3C', IDLE: '#B4B2A9', WAIT: '#2D9CDB'
    };
    return m[s] ?? '#9CA3AF';
  }

  statusBg(s: AgentStatus): string {
    const m: Record<AgentStatus, string> = {
      LIVE: '#E0FAF4', ACTIVE: '#EEEDFE', DONE: '#F1EFE8',
      RUN: '#FFF8E1', ERROR: '#FDEDEC', IDLE: '#F1EFE8', WAIT: '#E8F4FD'
      RUN:  '#FFF8E1', ERROR:  '#FDEDEC', IDLE: '#F1EFE8', WAIT: '#E8F4FD'
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

  private startSimulation() {
    setInterval(() => {
      this.agents.update(list => list.map(agent => {
        if (agent.status === 'RUN' || agent.status === 'ACTIVE') {
          const variation = (Math.random() - 0.5) * 0.2;
          return { ...agent, latency: Math.max(0.1, +(agent.latency + variation).toFixed(1)) };
        }
        return agent;
      }));
      this.cycleStep.update(s => s >= this.totalSteps ? 1 : s + 1);
    }, 3000);
  }
}