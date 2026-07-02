export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  stockMin: number;
  stockMax: number;
  demandForecast24h: number;
  coverageRatio: number;
  riskLevel: 'critical' | 'high' | 'ok';
  riskScore: number;
  recommendation:       string | null;
  recommendationDetail: string | null;
  recommendationId:     string | null;
  finalOrderQty:        number | null;
  orderTiming:          string | null;
  decisionConfidence:   string | null;
  escalateToHuman:      boolean;
  escalationReason:     string | null;
  tradeOffs:            string | null;
  confidence: number;
  lastUpdated: string;
  trend: 'down' | 'up' | 'stable';
}

export interface InventoryAlert {
  id: string;
  type: 'rupture' | 'redistribution' | 'overstock' | 'demand_spike';
  sku: string;
  name: string;
  category: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  action: string;
  time: string;
}