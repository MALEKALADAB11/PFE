import { Injectable } from '@angular/core';
import { Agent } from '../models/agent';
import { Advisor, CoachingCard } from '../models/advisor';
import { ProductMix, StoreMetrics } from '../models/store';
import { InventoryItem, InventoryAlert } from '../models/inventory';



/**
 * MockDataService — Données réelles Ooredoo I63 (FR LAC2 TUNISIA MALL)
 * Calculées depuis transaction_vente_test_100500_fast.csv + boutique_actif.xls
 * Utilisées en fallback quand le WS/API backend n'est pas encore disponible.
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {

  // ── Store Metrics ─────────────────────────────────────────────────────────
  // Source: I63 dans transaction_vente — moy CA/jour 915 TND, objectif +10%
  getStoreMetrics(): StoreMetrics {
    return {
      id:             'I63',
      name:           'FR LAC2 TUNISIA MALL',
      caJournalier:   462,      // CA estimé mi-journée (915 / 2)
      caObjectif:     1007,     // moy 915 × 1.10
      previsionEod:   1007,
      coachingScore:  0.81,
      traficBoutique: 26,
      traficCapacity: 40,
      visitors:       26,
      revenue:        462,
      dailyTarget:    1007,
      agents:         4,
      agentsTotal:    4,
      context: {
        weather:       'Partiellement nuageux - Tunis Lac',
        weatherImpact: '+0% trafic boutique',
        event:         'Fête de la République dans 79 jours',
        eventDistance: '',
        stockAlert:    'Forfait Flexi 25Go — vérifier stock'
      }
    };
  }

  // ── Advisors ──────────────────────────────────────────────────────────────
  // Source: AGENT_ID + CA depuis I63 sur Mars 2026
  // Total CA I63: 27,462 TND / 30 jours = 915 TND/jour
  // Poids réels: ZI 35% | MH 32% | BM 25% | MK 8%
  getAdvisors(): Advisor[] {
    const obj = 1007;
    return [
      {
        id:          'zi',
        name:        'Zouiten Insaf',
        initials:    'ZI',
        role:        'Forfaits & Services',
        avatarColor: '#6C5CE7',
        caRealized:  Math.round(462 * 0.35),   // 162
        caObjectif:  Math.round(obj * 0.35),    // 353
        performance: Math.round((462 * 0.35 / (obj * 0.35)) * 100),
        previsionEod: Math.round(obj * 0.35),
        status:      'ok',
        coachScore:  0.88,
        clients:     6,
        coachAdvice: 'Focus Forfait Flexi 25Go et Flexi 55Go. Pic 16h-19h à exploiter.'
      },
      {
        id:          'mh',
        name:        'Mansour Hela',
        initials:    'MH',
        role:        'Postpayé & Terminaux',
        avatarColor: '#00B894',
        caRealized:  Math.round(462 * 0.32),   // 148
        caObjectif:  Math.round(obj * 0.32),    // 322
        performance: Math.round((462 * 0.32 / (obj * 0.32)) * 100),
        previsionEod: Math.round(obj * 0.32),
        status:      'ok',
        coachScore:  0.75,
        clients:     5,
        coachAdvice: 'Pousser paiements factures postpayé + upsell Xiaomi Redmi Note 15.'
      },
      {
        id:          'bm',
        name:        'Ben Ammar Meriam',
        initials:    'BM',
        role:        'Smartphones & Data',
        avatarColor: '#F9A825',
        caRealized:  Math.round(462 * 0.25),   // 116
        caObjectif:  Math.round(obj * 0.25),    // 252
        performance: Math.round((462 * 0.25 / (obj * 0.25)) * 100),
        previsionEod: Math.round(obj * 0.25),
        status:      'ok',
        coachScore:  0.62,
        clients:     4,
        coachAdvice: 'Proposer Forfait MIFI PRE 80Go et Box 4G aux clients data intensifs.'
      },
      {
        id:          'mk',
        name:        'Mansour Khouloud',
        initials:    'MK',
        role:        'Recharge & Accessoires',
        avatarColor: '#2D9CDB',
        caRealized:  Math.round(462 * 0.08),   // 37
        caObjectif:  Math.round(obj * 0.08),    // 81
        performance: Math.round((462 * 0.08 / (obj * 0.08)) * 100),
        previsionEod: Math.round(obj * 0.08),
        status:      'urgent',
        coachScore:  0.41,
        clients:     3,
        coachAdvice: 'Augmenter panier moyen via e-vouchers et recharges groupées 50 TND.'
      },
    ];
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Source: top produits I63 depuis transactions + stock_centre.xls pour I63
  getInventoryItems(): InventoryItem[] {
    return [
      {
        id:                  'inv-paiement-facture',
        sku:                 '8811001',
        name:                'Paiement Facture Postpayé',
        category:            'Postpayé',
        stock:               999,
        stockMin:            0,
        stockMax:            999,
        demandForecast24h:   8,
        coverageRatio:       99.9,
        riskLevel:           'ok',
        riskScore:           0.0,
        trend:               'stable',
        confidence:          0.95,
        lastUpdated:         'LIVE',
        recommendation:      'Service — pas de stock physique',
        recommendationDetail: 'CA mensuel I63: 7,593 TND | #1 produit',
      },
      {
        id:                  'inv-forfait-flexi25',
        sku:                 '8811364',
        name:                'Forfait Flexi 25 GO',
        category:            'Forfait Mobile',
        stock:               999,
        stockMin:            0,
        stockMax:            999,
        demandForecast24h:   9,
        coverageRatio:       99.9,
        riskLevel:           'ok',
        riskScore:           0.0,
        trend:               'up',
        confidence:          0.95,
        lastUpdated:         'LIVE',
        recommendation:      'Produit numérique — disponible',
        recommendationDetail: 'CA mensuel I63: 4,279 TND | #2 produit',
      },
      {
        id:                  'inv-forfait-30go',
        sku:                 '8811458',
        name:                'Forfait 30 Go',
        category:            'Forfait Mobile',
        stock:               999,
        stockMin:            0,
        stockMax:            999,
        demandForecast24h:   3,
        coverageRatio:       99.9,
        riskLevel:           'ok',
        riskScore:           0.0,
        trend:               'stable',
        confidence:          0.90,
        lastUpdated:         'LIVE',
        recommendation:      'Forfait numérique — disponible',
        recommendationDetail: 'CA mensuel I63: 1,800 TND',
      },
      {
        id:                  'inv-redmi-note15',
        sku:                 '5021240',
        name:                'Portable Xiaomi Redmi Note 15 8/256',
        category:            'Terminal',
        stock:               44,    // QTE_STK réel I63 depuis stock_centre.xls
        stockMin:            5,
        stockMax:            30,
        demandForecast24h:   2,
        coverageRatio:       22.0,
        riskLevel:           'ok',
        riskScore:           0.15,
        trend:               'up',
        confidence:          0.85,
        lastUpdated:         'LIVE',
        recommendation:      'Stock suffisant',
        recommendationDetail: 'CA mensuel I63: 1,798 TND',
      },
      {
        id:                  'inv-forfait-8go',
        sku:                 '8811546',
        name:                'Forfait 8Go',
        category:            'Forfait Mobile',
        stock:               999,
        stockMin:            0,
        stockMax:            999,
        demandForecast24h:   3,
        coverageRatio:       99.9,
        riskLevel:           'ok',
        riskScore:           0.0,
        trend:               'stable',
        confidence:          0.90,
        lastUpdated:         'LIVE',
        recommendation:      'Forfait numérique — disponible',
        recommendationDetail: 'CA mensuel I63: 1,480 TND',
      },
      {
        id:                  'inv-mifi-80go',
        sku:                 '8812148',
        name:                'Forfait MIFI PRE 80Go',
        category:            'Box / Fibre',
        stock:               38,    // QTE_STK réel I63
        stockMin:            3,
        stockMax:            20,
        demandForecast24h:   1,
        coverageRatio:       38.0,
        riskLevel:           'ok',
        riskScore:           0.10,
        trend:               'up',
        confidence:          0.85,
        lastUpdated:         'LIVE',
        recommendation:      'Stock OK — PV 109 DT',
        recommendationDetail: 'CA mensuel I63: 990 TND',
      },
      {
        id:                  'inv-redmi-15c',
        sku:                 '5021214',
        name:                'Portable Redmi 15C 8/256',
        category:            'Terminal',
        stock:               69,    // QTE_STK réel I63
        stockMin:            5,
        stockMax:            30,
        demandForecast24h:   2,
        coverageRatio:       34.5,
        riskLevel:           'ok',
        riskScore:           0.10,
        trend:               'stable',
        confidence:          0.85,
        lastUpdated:         'LIVE',
        recommendation:      'Stock suffisant',
        recommendationDetail: 'CA mensuel I63: 1,098 TND',
      },
    ];
  }

  // ── Inventory Alerts ──────────────────────────────────────────────────────
  getInventoryAlerts(): InventoryAlert[] {
    return [
      {
        id:      'alert-flexi55',
        type:    'demand_spike',
        sku:     '8811365',
        urgency: 'high',
        message: 'Forfait Flexi 55 GO — CA mensuel 1,100 TND — pousser en pic 16h-19h',
        action:  'Augmenter stocks et relancer campagne promo',
        time:    'LIVE',
      },
      {
        id:      'alert-postpaye',
        type:    'redistribution',
        sku:     '8811001',
        urgency: 'critical',
        message: 'Avance Postpayé — CA mensuel 1,121 TND — renouvellements en attente',
        action:  'Relancer clients avec rappel factures impayées',
        time:    'LIVE',
      },
    ];
  }

  // ── Agents ───────────────────────────────────────────────────────────────
  // Return list of AI agents currently active
  getAgents(): Agent[] {
    return [
      {
        id:      'agent-forecasting',
        name:    'Forecasting Engine',
        status:  'LIVE',
        latency: 145,
      },
      {
        id:      'agent-recommendation',
        name:    'Recommendation AI',
        status:  'LIVE',
        latency: 98,
      },
      {
        id:      'agent-anomaly-detector',
        name:    'Anomaly Detector',
        status:  'LIVE',
        latency: 245,
      },
      {
        id:      'agent-coaching',
        name:    'Coaching Assistant',
        status:  'ACTIVE',
        latency: 67,
      },
    ];
  }

  // ── Product Mix ───────────────────────────────────────────────────────────
  // Source: CA par catégorie I63 sur 30 jours Mars 2026
  getProductMix(): ProductMix[] {
    return [
      { category: 'Forfait Mobile', percentage: 35, color: '#2D9CDB', revenue: 9689  },
      { category: 'Postpayé',       percentage: 32, color: '#9B51E0', revenue: 8714  },
      { category: 'Terminal',       percentage: 16, color: '#27AE60', revenue: 4273  },
      { category: 'SIM / Ligne',    percentage: 7,  color: '#F2994A', revenue: 2034  },
      { category: 'Box / Fibre',    percentage: 5,  color: '#E74C3C', revenue: 1497  },
      { category: 'Recharge',       percentage: 4,  color: '#00B894', revenue: 1193  },
    ] as any[];
  }
}