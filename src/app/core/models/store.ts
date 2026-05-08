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
export interface ProductMix {
  id:               string;
  name:             string;
  color:            string;
  salesActual:      number;   // % du CA total
  salesForecast:    number;   // % prévu
  revenue:          number;   // DT réalisé
  revenueForecast:  number;   // DT prévu
  unitsSold:        number;   // unités vendues
  unitsForecast:    number;   // unités prévues
  trend:            'up' | 'down' | 'stable';
  trendVal:         string;
  alert:            boolean;
  stockUnits:      number;
  stockMin:        number;
  stockRisk:       'critical' | 'low' | 'ok';
}