import { Injectable } from '@angular/core';
import { Agent } from '../models/agent';
import { Advisor, CoachingCard } from '../models/advisor';
import { ProductMix, StoreMetrics } from '../models/store';
import { InventoryItem, InventoryAlert } from '../models/inventory';

/**
 * MockDataService — Valeurs initiales minimales.
 * Toutes les vraies données viennent du backend via:
 *   - WebSocket ws/store/store-lac2 → mock_provider.py → CSV/XLS réels
 *   - API REST /api/v1/stores/store-lac2/* → json_service.py → PostgreSQL
 *   - API REST /api/inventory/* → stock_tools.py → CSV inventaire
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {

  getStoreMetrics(): StoreMetrics {
    return {
      id:             'I63',
      name:           'FR LAC2 TUNISIA MALL',
      caJournalier:   0,
      caObjectif:     1007,
      previsionEod:   0,
      coachingScore:  0,
      traficBoutique: 0,
      traficCapacity: 40,
      visitors:       0,
      revenue:        0,
      dailyTarget:    1007,
      agents:         4,
      agentsTotal:    4,
      context: {
        weather: '', weatherImpact: '',
        event: '', eventDistance: '', stockAlert: ''
      }
    };
  }

  getAgents(): Agent[] {
    return [
      { id: 'agent-1', name: 'Agent 1', status: 'ACTIVE', latency: 45 },
      { id: 'agent-2', name: 'Agent 2', status: 'LIVE', latency: 32 },
      { id: 'agent-3', name: 'Agent 3', status: 'ACTIVE', latency: 58 },
      { id: 'agent-4', name: 'Agent 4', status: 'DONE', latency: 0 },
    ];
  }

  getAdvisors(): Advisor[] {
    return [
      { id:'adv-zi', name:'Zouiten Insaf',    initials:'ZI', role:'Forfaits & Services',    avatarColor:'#6C5CE7', caRealized:0, caObjectif:353, performance:0, previsionEod:353, status:'ok',     coachScore:0.88, clients:0, coachAdvice:'' },
      { id:'adv-mh', name:'Mansour Hela',     initials:'MH', role:'Postpaye & Terminaux',   avatarColor:'#00B894', caRealized:0, caObjectif:322, performance:0, previsionEod:322, status:'ok',     coachScore:0.75, clients:0, coachAdvice:'' },
      { id:'adv-bm', name:'Ben Ammar Meriam', initials:'BM', role:'Smartphones & Data',     avatarColor:'#F9A825', caRealized:0, caObjectif:252, performance:0, previsionEod:252, status:'ok',     coachScore:0.62, clients:0, coachAdvice:'' },
      { id:'adv-mk', name:'Mansour Khouloud', initials:'MK', role:'Recharge & Accessoires', avatarColor:'#2D9CDB', caRealized:0, caObjectif:80,  performance:0, previsionEod:80,  status:'urgent', coachScore:0.41, clients:0, coachAdvice:'' },
    ];
  }

  getInventoryItems(): InventoryItem[] { return []; }
  getInventoryAlerts(): InventoryAlert[] { return []; }
  getProductMix(): ProductMix[] { return []; }
}