export interface StoreMetrics {
  id: string;
  name: string;
  caJournalier: number;
  caObjectif: number;
  previsionEod: number;
  coachingScore: number;
  traficBoutique: number;
  traficCapacity: number;
  visitors: number;
  revenue: number;
  dailyTarget: number;
  agents: number;
  agentsTotal: number;
  context: StoreContext;
}

export interface StoreContext {
  weather: string;
  weatherImpact: string;
  event: string;
  eventDistance: string;
  stockAlert?: string;
}

export type AgentStatus = 'LIVE' | 'ACTIVE' | 'DONE' | 'RUN' | 'ERROR';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  latency: number;
}