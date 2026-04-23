import { Injectable } from '@angular/core';
import { Agent } from '../models/agent';
import { Advisor, CoachingCard } from '../models/advisor';
import { ProductMix, StoreMetrics } from '../models/store';
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
        weather: 'Rain 2:00 PM – 6:00 PM',
        weatherImpact: '+40% accessories',
        event: 'Concert tonight (2km)',
        eventDistance: '2km',
        stockAlert: 'iPhone 15 — 3 units left'
      }
    };
  }

  getAdvisors(): Advisor[] {
    return [
      {
        id: 'kb', name: 'Karim Benali', initials: 'KB',
        role: 'Smartphones 5G', avatarColor: '#6C5CE7',
        caRealized: 1850, caObjectif: 2000,
        performance: 93, previsionEod: 2050, status: 'top',
        coachScore: 0.91, clients: 7,
        coachAdvice: 'On track for target. Push SIM accessories to close.'
      },
      {
        id: 'sm', name: 'Sara Moulai', initials: 'SM',
        role: 'Fiber · Pro Offers', avatarColor: '#00B894',
        caRealized: 1200, caObjectif: 2000,
        performance: 60, previsionEod: 1750, status: 'ok',
        coachScore: 0.73, clients: 5,
        coachAdvice: 'Boost Pro offers. Peak traffic expected at 5 PM.'
      },
      {
        id: 'at', name: 'Amine Tazi', initials: 'AT',
        role: 'Accessories', avatarColor: '#F9A825',
        caRealized: 750, caObjectif: 2000,
        performance: 38, previsionEod: 1100, status: 'urgent',
        coachScore: 0.44, clients: 3,
        coachAdvice: 'Critical gap. Shift to accessories — rain signal +40%.'
      },
      {
        id: 'lk', name: 'Leila Khadri', initials: 'LK',
        role: 'Retention · CRM', avatarColor: '#2D9CDB',
        caRealized: 450, caObjectif: 2000,
        performance: 23, previsionEod: 720, status: 'attente',
        coachScore: 0.28, clients: 2,
        coachAdvice: 'Re-engage inactive CRM clients this afternoon.'
      },
    ];
  }

  getCoachingCards(): CoachingCard[] {
    return [
      {
        id: 'c1', advisorName: 'Sofia L.', advisorInitials: 'SL',
        avatarColor: '#E74C3C', priority: 'HIGH', target: 40, gap: 60,
        context: 'Rain signal + 38% conversion rate',
        advice: 'Shift to accessories + fiber upsell. Pair with senior advisor. Stock ETA: 35 min.',
        time: '2:28 PM', status: 'pending'
      },
      {
        id: 'c2', advisorName: 'Aicha M.', advisorInitials: 'AM',
        avatarColor: '#00B894', priority: 'MED', target: 84, gap: 16,
        context: 'Peak traffic 5–7 PM · iPhone 15 = 3 left',
        advice: 'Prioritize 5G Pro bundle 5–7 PM. iPhone — first come first served.',
        time: '2:14 PM', status: 'approved'
      },
      {
        id: 'c3', advisorName: 'Marc D.', advisorInitials: 'MD',
        avatarColor: '#6C5CE7', priority: 'OK', target: 80, gap: 0,
        context: '74% conversion rate · best performer today',
        advice: 'On track! Push SIM accessories to close 20. Lead by example.',
        time: '1:50 PM', status: 'approved'
      },
    ];
  }

  getAgents(): Agent[] {
    return [
      { id: 'app01', name: 'Data Ingestion',  status: 'LIVE',   latency: 1.2 },
      { id: 'app02', name: 'Feature Eng.',     status: 'LIVE',   latency: 0.4 },
      { id: 'app03', name: 'Forecast Engine',  status: 'LIVE',   latency: 1.8 },
      { id: 'app04', name: 'Gap Detector',     status: 'ACTIVE', latency: 0.1 },
      { id: 'app05', name: 'RAG',              status: 'DONE',   latency: 0.9 },
      { id: 'app06', name: 'Orchestrator',     status: 'ACTIVE', latency: 0.3 },
      { id: 'app07', name: 'Coach Agent',      status: 'RUN',    latency: 2.1 },
      { id: 'app08', name: 'Inventory Agent',  status: 'LIVE',   latency: 1.5 },
    ];
  }

  getInventoryItems(): InventoryItem[] {
    return [
      {
        id: 'i1', sku: 'IPH16PRO', name: 'iPhone 16 Pro',
        category: 'Smartphone', stock: 3, stockMin: 8, stockMax: 40,
        demandForecast24h: 11, coverageRatio: 0.27,
        riskLevel: 'critical', riskScore: 0.91,
        recommendation: 'Order 15 units before Friday',
        recommendationDetail: '91% stockout risk — Concert event drives +40% traffic. Delivery ETA: 48h.',
        confidence: 0.91, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i2', sku: 'SAMA55', name: 'Samsung A55',
        category: 'Smartphone', stock: 24, stockMin: 6, stockMax: 35,
        demandForecast24h: 8, coverageRatio: 3.0,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: 'No action required',
        recommendationDetail: 'Stock is optimal. Next review in 48h.',
        confidence: 0.95, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i3', sku: 'AIRPDP3', name: 'AirPods Pro 3',
        category: 'Accessory', stock: 7, stockMin: 5, stockMax: 25,
        demandForecast24h: 9, coverageRatio: 0.78,
        riskLevel: 'high', riskScore: 0.73,
        recommendation: 'Order 10 units',
        recommendationDetail: 'Rain weather drives +40% accessory demand. Stock insufficient for 3–5 PM peak.',
        confidence: 0.79, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i4', sku: 'FIB2GPRO', name: 'Fiber Box 2G Pro',
        category: 'Internet', stock: 18, stockMin: 4, stockMax: 30,
        demandForecast24h: 5, coverageRatio: 3.6,
        riskLevel: 'ok', riskScore: 0.08,
        recommendation: 'No action',
        recommendationDetail: 'Stock level is well above demand forecast.',
        confidence: 0.97, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i5', sku: 'APLWTCH', name: 'Apple Watch S10',
        category: 'Accessory', stock: 2, stockMin: 5, stockMax: 20,
        demandForecast24h: 6, coverageRatio: 0.33,
        riskLevel: 'critical', riskScore: 0.88,
        recommendation: 'Redistribute from BTQ-08',
        recommendationDetail: 'BTQ-08 has 12 units (overstock). Internal transfer recommended. Lead time: 4h.',
        confidence: 0.84, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i6', sku: 'ASRPREM', name: 'Premium Insurance',
        category: 'Service', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 12, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: 'Actively promote',
        recommendationDetail: 'Digital product — no stock constraint. High margin. Rain context is favorable.',
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
    ];
  }

  getInventoryAlerts(): InventoryAlert[] {
    return [
      {
        id: 'a1', type: 'rupture', sku: 'IPH16PRO', urgency: 'critical',
        message: 'iPhone 16 Pro — 3 units remaining',
        action: 'Order 15 units immediately',
        time: '2:32 PM'
      },
      {
        id: 'a2', type: 'redistribution', sku: 'APLWTCH', urgency: 'high',
        message: 'Apple Watch S10 — critical stock level',
        action: 'Redistribute from BTQ-08',
        time: '2:15 PM'
      },
      {
        id: 'a3', type: 'rupture', sku: 'AIRPDP3', urgency: 'high',
        message: 'AirPods Pro 3 — demand peak expected at 3 PM',
        action: 'Order 10 units',
        time: '2:10 PM'
      },
    ];
  }

  getProductMix(): ProductMix[] {
  return [
    {
      id: 'pm1', name: 'Mobile Plans', color: '#6C5CE7',
      salesActual: 56, salesForecast: 65,
      revenue: 2380, revenueForecast: 2760,
      unitsSold: 14, unitsForecast: 18,
      trend: 'down', trendVal: '-14%', alert: false,
      stockUnits: 999, stockMin: 0, stockRisk: 'ok'
    },
    {
      id: 'pm2', name: 'Fiber / Box', color: '#00B894',
      salesActual: 30, salesForecast: 28,
      revenue: 1470, revenueForecast: 1372,
      unitsSold: 9, unitsForecast: 8,
      trend: 'up', trendVal: '+7%', alert: false,
      stockUnits: 18, stockMin: 4, stockRisk: 'ok'
    },
    {
      id: 'pm3', name: 'Handsets', color: '#2D9CDB',
      salesActual: 48, salesForecast: 60,
      revenue: 3890, revenueForecast: 4860,
      unitsSold: 6, unitsForecast: 8,
      trend: 'down', trendVal: '-25%', alert: true,
      stockUnits: 3, stockMin: 8, stockRisk: 'critical'
    },
    {
      id: 'pm4', name: 'SIM / Top-up', color: '#F9A825',
      salesActual: 72, salesForecast: 55,
      revenue: 864, revenueForecast: 660,
      unitsSold: 24, unitsForecast: 18,
      trend: 'up', trendVal: '+31%', alert: false,
      stockUnits: 87, stockMin: 10, stockRisk: 'ok'
    },
    {
      id: 'pm5', name: 'Accessories', color: '#E74C3C',
      salesActual: 18, salesForecast: 40,
      revenue: 420, revenueForecast: 960,
      unitsSold: 4, unitsForecast: 9,
      trend: 'down', trendVal: '-56%', alert: true,
      stockUnits: 7, stockMin: 5, stockRisk: 'low'
    },
  ];
}
}