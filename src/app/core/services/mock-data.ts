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
        id: 'i1', sku: 'PHN-IPH-15', name: 'iPhone 15',
        category: 'Smartphone', stock: 3, stockMin: 8, stockMax: 40,
        demandForecast24h: 11, coverageRatio: 0.27,
        riskLevel: 'critical', riskScore: 0.91,
        recommendation: null, recommendationDetail: null,
        confidence: 0.91, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i2', sku: 'PHN-SAM-S24', name: 'Samsung S24',
        category: 'Smartphone', stock: 24, stockMin: 6, stockMax: 35,
        demandForecast24h: 8, coverageRatio: 3.0,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: null, recommendationDetail: null,
        confidence: 0.95, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i3', sku: 'PHN-OPP-F5', name: 'Oppo Find X5',
        category: 'Smartphone', stock: 12, stockMin: 5, stockMax: 30,
        demandForecast24h: 5, coverageRatio: 2.4,
        riskLevel: 'ok', riskScore: 0.12,
        recommendation: null, recommendationDetail: null,
        confidence: 0.90, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i4', sku: 'PHN-XIA-13', name: 'Xiaomi 13',
        category: 'Smartphone', stock: 9, stockMin: 5, stockMax: 25,
        demandForecast24h: 6, coverageRatio: 1.5,
        riskLevel: 'high', riskScore: 0.65,
        recommendation: null, recommendationDetail: null,
        confidence: 0.82, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i5', sku: 'PHN-BUD-001', name: 'Budget Phone',
        category: 'Smartphone', stock: 18, stockMin: 6, stockMax: 40,
        demandForecast24h: 7, coverageRatio: 2.6,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: null, recommendationDetail: null,
        confidence: 0.93, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i6', sku: 'ACC-BUD-001', name: 'Wireless Earbuds',
        category: 'Accessory', stock: 7, stockMin: 5, stockMax: 25,
        demandForecast24h: 9, coverageRatio: 0.78,
        riskLevel: 'high', riskScore: 0.73,
        recommendation: null, recommendationDetail: null,
        confidence: 0.79, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i7', sku: 'ACC-BUD-002', name: 'Pro Earbuds',
        category: 'Accessory', stock: 14, stockMin: 4, stockMax: 20,
        demandForecast24h: 5, coverageRatio: 2.8,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: null, recommendationDetail: null,
        confidence: 0.94, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i8', sku: 'ACC-WAT-001', name: 'Smartwatch',
        category: 'Accessory', stock: 2, stockMin: 5, stockMax: 20,
        demandForecast24h: 6, coverageRatio: 0.33,
        riskLevel: 'critical', riskScore: 0.88,
        recommendation: null, recommendationDetail: null,
        confidence: 0.84, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i9', sku: 'ACC-WAT-002', name: 'Smartwatch Pro',
        category: 'Accessory', stock: 8, stockMin: 4, stockMax: 18,
        demandForecast24h: 4, coverageRatio: 2.0,
        riskLevel: 'ok', riskScore: 0.12,
        recommendation: null, recommendationDetail: null,
        confidence: 0.91, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i10', sku: 'ACC-CAM-001', name: 'Action Camera',
        category: 'Accessory', stock: 5, stockMin: 3, stockMax: 15,
        demandForecast24h: 3, coverageRatio: 1.7,
        riskLevel: 'ok', riskScore: 0.20,
        recommendation: null, recommendationDetail: null,
        confidence: 0.88, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i11', sku: 'ACC-CAS-001', name: 'Phone Case Pack',
        category: 'Accessory', stock: 45, stockMin: 10, stockMax: 80,
        demandForecast24h: 12, coverageRatio: 3.75,
        riskLevel: 'ok', riskScore: 0.05,
        recommendation: null, recommendationDetail: null,
        confidence: 0.98, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i12', sku: 'ACC-CHG-001', name: 'Premium Charger',
        category: 'Accessory', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 12, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i13', sku: 'FBR-BOX-001', name: 'Fiber Box Pro',
        category: 'Internet', stock: 18, stockMin: 4, stockMax: 30,
        demandForecast24h: 5, coverageRatio: 3.6,
        riskLevel: 'ok', riskScore: 0.08,
        recommendation: null, recommendationDetail: null,
        confidence: 0.97, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i14', sku: 'FBR-BOX-002', name: 'Fiber Box 4G',
        category: 'Internet', stock: 11, stockMin: 4, stockMax: 25,
        demandForecast24h: 4, coverageRatio: 2.75,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: null, recommendationDetail: null,
        confidence: 0.95, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i15', sku: 'FBR-BOX-003', name: 'Fiber Box Lite',
        category: 'Internet', stock: 6, stockMin: 4, stockMax: 20,
        demandForecast24h: 3, coverageRatio: 2.0,
        riskLevel: 'ok', riskScore: 0.15,
        recommendation: null, recommendationDetail: null,
        confidence: 0.92, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i16', sku: 'RTR-4G-001', name: '4G Router Pro',
        category: 'Router', stock: 15, stockMin: 8, stockMax: 35,
        demandForecast24h: 6, coverageRatio: 2.5,
        riskLevel: 'ok', riskScore: 0.15,
        recommendation: null, recommendationDetail: null,
        confidence: 0.90, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i17', sku: 'RTR-4G-002', name: '4G Router Lite',
        category: 'Router', stock: 20, stockMin: 6, stockMax: 30,
        demandForecast24h: 5, coverageRatio: 4.0,
        riskLevel: 'ok', riskScore: 0.08,
        recommendation: null, recommendationDetail: null,
        confidence: 0.94, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i18', sku: 'RTR-5G-001', name: '5G Router Pro',
        category: 'Router', stock: 8, stockMin: 6, stockMax: 25,
        demandForecast24h: 7, coverageRatio: 1.14,
        riskLevel: 'high', riskScore: 0.68,
        recommendation: null, recommendationDetail: null,
        confidence: 0.83, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i19', sku: 'RTR-5G-002', name: '5G Router Ultra',
        category: 'Router', stock: 4, stockMin: 8, stockMax: 20,
        demandForecast24h: 8, coverageRatio: 0.5,
        riskLevel: 'critical', riskScore: 0.89,
        recommendation: null, recommendationDetail: null,
        confidence: 0.86, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i20', sku: 'SIM-ESIM-001', name: 'eSIM Pack',
        category: 'SIM', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 15, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i21', sku: 'SIM-HOLI-001', name: 'Holiday SIM',
        category: 'SIM', stock: 120, stockMin: 20, stockMax: 200,
        demandForecast24h: 18, coverageRatio: 6.7,
        riskLevel: 'ok', riskScore: 0.03,
        recommendation: null, recommendationDetail: null,
        confidence: 0.98, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i22', sku: 'SIM-POST-001', name: 'Postpaid SIM',
        category: 'SIM', stock: 85, stockMin: 15, stockMax: 150,
        demandForecast24h: 10, coverageRatio: 8.5,
        riskLevel: 'ok', riskScore: 0.03,
        recommendation: null, recommendationDetail: null,
        confidence: 0.97, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i23', sku: 'SIM-PREP-001', name: 'Prepaid SIM',
        category: 'SIM', stock: 200, stockMin: 30, stockMax: 400,
        demandForecast24h: 25, coverageRatio: 8.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i24', sku: 'TAB-IPD-AIR', name: 'iPad Air',
        category: 'Tablet', stock: 5, stockMin: 4, stockMax: 20,
        demandForecast24h: 4, coverageRatio: 1.25,
        riskLevel: 'high', riskScore: 0.70,
        recommendation: null, recommendationDetail: null,
        confidence: 0.81, lastUpdated: '2:32 PM', trend: 'down'
      },
      {
        id: 'i25', sku: 'TAB-LEN-P11', name: 'Lenovo Tab P11',
        category: 'Tablet', stock: 10, stockMin: 4, stockMax: 20,
        demandForecast24h: 3, coverageRatio: 3.3,
        riskLevel: 'ok', riskScore: 0.10,
        recommendation: null, recommendationDetail: null,
        confidence: 0.93, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i26', sku: 'TAB-SAM-S9', name: 'Samsung Tab S9',
        category: 'Tablet', stock: 7, stockMin: 3, stockMax: 18,
        demandForecast24h: 4, coverageRatio: 1.75,
        riskLevel: 'ok', riskScore: 0.20,
        recommendation: null, recommendationDetail: null,
        confidence: 0.89, lastUpdated: '2:32 PM', trend: 'stable'
      },
      {
        id: 'i27', sku: 'RCH-INT-050', name: 'Internet Recharge 50',
        category: 'Recharge', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 20, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i28', sku: 'RCH-MOB-010', name: 'Mobile Recharge 10',
        category: 'Recharge', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 30, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i29', sku: 'RCH-MOB-020', name: 'Mobile Recharge 20',
        category: 'Recharge', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 22, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'up'
      },
      {
        id: 'i30', sku: 'RCH-STR-001', name: 'Streaming Recharge',
        category: 'Recharge', stock: 999, stockMin: 0, stockMax: 999,
        demandForecast24h: 14, coverageRatio: 5.0,
        riskLevel: 'ok', riskScore: 0.02,
        recommendation: null, recommendationDetail: null,
        confidence: 0.99, lastUpdated: '2:32 PM', trend: 'stable'
      },
    ];
  }

  getInventoryAlerts(): InventoryAlert[] {
    return [
      {
        id: 'a1', type: 'rupture', sku: 'PHN-IPH-15', urgency: 'critical',
        message: 'iPhone 15 — 3 units remaining',
        action: 'Order immediately',
        time: '2:32 PM'
      },
      {
        id: 'a2', type: 'rupture', sku: 'RTR-5G-002', urgency: 'critical',
        message: '5G Router Ultra — 4 units vs 21d lead time',
        action: 'Order immediately',
        time: '2:30 PM'
      },
      {
        id: 'a3', type: 'rupture', sku: 'ACC-WAT-001', urgency: 'high',
        message: 'Smartwatch — 2 units remaining',
        action: 'Redistribute or reorder',
        time: '2:15 PM'
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