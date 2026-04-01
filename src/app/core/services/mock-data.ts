import { Injectable } from '@angular/core';
import { Agent } from '../models/agent';
import { Advisor, CoachingCard } from '../models/advisor';
import { StoreMetrics } from '../models/store';
import { InventoryItem, InventoryAlert } from '../models/inventory';



@Injectable({ providedIn: 'root' })
export class MockDataService {

  getStoreMetrics(): StoreMetrics {
    return {
      id: 'lac2', name: 'Lac 2',
      caJournalier: 4250, caObjectif: 8000,
      previsionEod: 6800,
      coachingScore: 0.81,
      traficBoutique: 12, traficCapacity: 20,
      visitors: 42, revenue: 4250,
      dailyTarget: 53, agents: 4, agentsTotal: 4,
      context: {
        weather: 'Pluie 14h00–18h00',
        weatherImpact: '+40% accessoires',
        event: 'Concert 20h (2km)',
        eventDistance: '2km',
        stockAlert: 'iPhone 15 — 3 unités left'
      }
    };
  }

  getAdvisors(): Advisor[] {
    return [
      { id: 'kb', name: 'Karim Benali', initials: 'KB', role: 'Smartphones 5G',
        avatarColor: '#6C5CE7', caRealized: 1850, caObjectif: 2000,
        performance: 93, previsionEod: 2050, status: 'top',
        coachScore: 0.91, clients: 7, coachAdvice: 'En route pour l\'objectif. Push SIM accessories.' },
      { id: 'sm', name: 'Sara Moulai', initials: 'SM', role: 'Fibre · Offres Pro',
        avatarColor: '#00B894', caRealized: 1200, caObjectif: 2000,
        performance: 60, previsionEod: 1750, status: 'ok',
        coachScore: 0.73, clients: 5, coachAdvice: 'Booster les offres Pro, pic trafic à 17h.' },
      { id: 'at', name: 'Amine Tazi', initials: 'AT', role: 'Accessoires',
        avatarColor: '#F9A825', caRealized: 750, caObjectif: 2000,
        performance: 38, previsionEod: 1100, status: 'urgent',
        coachScore: 0.44, clients: 3, coachAdvice: 'Gap critique. Shift vers accessoires pluie +40%.' },
      { id: 'lk', name: 'Leila Khadri', initials: 'LK', role: 'Rétention · CRM',
        avatarColor: '#2D9CDB', caRealized: 450, caObjectif: 2000,
        performance: 23, previsionEod: 720, status: 'attente',
        coachScore: 0.28, clients: 2, coachAdvice: 'Relancer les clients CRM inactifs.' },
    ];
  }

  getCoachingCards(): CoachingCard[] {
    return [
      { id: 'c1', advisorName: 'Sofia L.', advisorInitials: 'SL', avatarColor: '#E74C3C',
        priority: 'HIGH', target: 40, gap: 60, context: 'Pluie + conversion 38%',
        advice: 'Shift vers accessoires + fibre upsell. Pairer avec senior. ETA stock: 35min',
        time: '14:28', status: 'pending' },
      { id: 'c2', advisorName: 'Aïcha M.', advisorInitials: 'AM', avatarColor: '#00B894',
        priority: 'MED', target: 84, gap: 16, context: 'Pic 17h–19h, iPhone 15=3 left',
        advice: 'Prioritise 5G Pro bundle 17h–19h. iPhone — first come first served.',
        time: '14:14', status: 'approved' },
      { id: 'c3', advisorName: 'Marc D.', advisorInitials: 'MD', avatarColor: '#6C5CE7',
        priority: 'OK', target: 80, gap: 0, context: 'Conversion 74%, best performer',
        advice: 'On track! Push SIM accessories to close 20. Lead by example.',
        time: '13:50', status: 'approved' },
    ];
  }

  getAgents(): Agent[] {
    return [
      { id: 'app01', name: 'Data Ingestion', status: 'LIVE', latency: 1.2 },
      { id: 'app02', name: 'Feature Eng.', status: 'LIVE', latency: 0.4 },
      { id: 'app03', name: 'Forecast Engine', status: 'LIVE', latency: 1.8 },
      { id: 'app04', name: 'Gap Detector', status: 'ACTIVE', latency: 0.1 },
      { id: 'app05', name: 'RAG', status: 'DONE', latency: 0.9 },
      { id: 'app06', name: 'Orchestrator', status: 'ACTIVE', latency: 0.3 },
      { id: 'app07', name: 'Coach Agent', status: 'RUN', latency: 2.1 },
      { id: 'app08', name: 'Inventory Agent', status: 'LIVE', latency: 1.5 },
    ];
  }

  getInventoryItems(): InventoryItem[] {
    return [
      { id: 'i1', sku: 'IPH16PRO', name: 'iPhone 16 Pro', category: 'Smartphone',
        stock: 3, stockMin: 8, stockMax: 40, demandForecast24h: 11,
        coverageRatio: 0.27, riskLevel: 'critical', riskScore: 0.91,
        recommendation: 'Commander 15 unités avant vendredi',
        recommendationDetail: 'Risque rupture 91% — événement Concert +40% trafic prévu. ETA livraison: 48h.',
        confidence: 0.91, lastUpdated: '14:32', trend: 'down' },
      { id: 'i2', sku: 'SAMA55', name: 'Samsung A55', category: 'Smartphone',
        stock: 24, stockMin: 6, stockMax: 35, demandForecast24h: 8,
        coverageRatio: 3.0, riskLevel: 'ok', riskScore: 0.10,
        recommendation: 'Aucune action requise',
        recommendationDetail: 'Stock optimal. Révision dans 48h.',
        confidence: 0.95, lastUpdated: '14:32', trend: 'stable' },
      { id: 'i3', sku: 'AIRPDP3', name: 'AirPods Pro 3', category: 'Accessoire',
        stock: 7, stockMin: 5, stockMax: 25, demandForecast24h: 9,
        coverageRatio: 0.78, riskLevel: 'high', riskScore: 0.73,
        recommendation: 'Commander 10 unités',
        recommendationDetail: 'Impact météo pluie: +40% demande accessoires. Stock insuffisant pour le pic 15h–17h.',
        confidence: 0.79, lastUpdated: '14:32', trend: 'down' },
      { id: 'i4', sku: 'FIB2GPRO', name: 'Box Fibre 2G Pro', category: 'Internet',
        stock: 18, stockMin: 4, stockMax: 30, demandForecast24h: 5,
        coverageRatio: 3.6, riskLevel: 'ok', riskScore: 0.08,
        recommendation: 'Aucune action',
        recommendationDetail: 'Stock largement suffisant.',
        confidence: 0.97, lastUpdated: '14:32', trend: 'stable' },
      { id: 'i5', sku: 'APLWTCH', name: 'Apple Watch S10', category: 'Accessoire',
        stock: 2, stockMin: 5, stockMax: 20, demandForecast24h: 6,
        coverageRatio: 0.33, riskLevel: 'critical', riskScore: 0.88,
        recommendation: 'Redistribution depuis BTQ-08',
        recommendationDetail: 'Stock BTQ-08: 12 unités (surstock). Transfert interne recommandé. Délai: 4h.',
        confidence: 0.84, lastUpdated: '14:32', trend: 'down' },
      { id: 'i6', sku: 'ASRPREM', name: 'Assurance Premium', category: 'Service',
        stock: 999, stockMin: 0, stockMax: 999, demandForecast24h: 12,
        coverageRatio: 5.0, riskLevel: 'ok', riskScore: 0.02,
        recommendation: 'Promouvoir activement',
        recommendationDetail: 'Produit dématérialisé. Marge élevée. Contexte pluie favorable.',
        confidence: 0.99, lastUpdated: '14:32', trend: 'up' },
    ];
  }

  getInventoryAlerts(): InventoryAlert[] {
    return [
      { id: 'a1', type: 'rupture', sku: 'IPH16PRO', urgency: 'critical',
        message: 'iPhone 16 Pro — 3 unités restantes', action: 'Commander 15 unités',
        time: '14:32' },
      { id: 'a2', type: 'redistribution', sku: 'APLWTCH', urgency: 'high',
        message: 'Apple Watch S10 — stock critique', action: 'Redistribuer depuis BTQ-08',
        time: '14:15' },
      { id: 'a3', type: 'rupture', sku: 'AIRPDP3', urgency: 'high',
        message: 'AirPods Pro 3 — pic demande prévu 15h', action: 'Commander 10 unités',
        time: '14:10' },
    ];
  }
}