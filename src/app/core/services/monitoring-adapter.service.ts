import { Injectable, computed } from '@angular/core';
import { WebSocketService } from './websocket.service';

/**
 * Monitoring Adapter Service - ISOLATED MODULE
 * Your monitoring-module backend (port 8000) integration
 * This service doesn't conflict with other agents' work
 */
@Injectable({ providedIn: 'root' })
export class MonitoringAdapterService {

    constructor(private ws: WebSocketService) { }

    // ══════════════════════════════════════════════════════════
    // COMPUTED PROPERTIES - Safe for Angular change detection
    // ══════════════════════════════════════════════════════════

    /**
     * Flip cards data for dashboard KPI section
     * Updates automatically when WebSocket receives new data
     */
    flipCardsData = computed(() => {
        const metrics = this.ws.liveMetrics();

        if (!metrics) {
            return [
                {
                    label: 'CA Actuel',
                    value: '0',
                    suffix: '€',
                    trend: '+0%',
                    trendDir: 'neutral' as const,
                    backTitle: 'Objectif Journée',
                    backLines: ['Objectif: 8500€', 'En attente...'],
                    accentColor: 'blue' as const,
                    icon: '💰'
                },
                {
                    label: 'Taux Atteinte',
                    value: '0',
                    suffix: '%',
                    trend: '±0%',
                    trendDir: 'neutral' as const,
                    backTitle: 'Performance',
                    backLines: ['Moyenne: --', 'En attente...'],
                    accentColor: 'teal' as const,
                    icon: '📊'
                },
                {
                    label: 'Visiteurs/h',
                    value: '0',
                    suffix: 'pers',
                    trend: '+0',
                    trendDir: 'neutral' as const,
                    backTitle: 'Trafic',
                    backLines: ['Pic: --', 'En attente...'],
                    accentColor: 'amber' as const,
                    icon: '👥'
                },
                {
                    label: 'Conversion',
                    value: '0',
                    suffix: '%',
                    trend: '+0%',
                    trendDir: 'neutral' as const,
                    backTitle: 'Taux Conversion',
                    backLines: ['Objectif: 12%', 'En attente...'],
                    accentColor: 'purple' as const,
                    icon: '🎯'
                }
            ];
        }

        // Calculate conversion rate
        const conversion = metrics.ca_today && metrics.visitors_h
            ? Math.round((metrics.ca_today / (metrics.visitors_h * 100)) * 100)
            : 0;

        return [
            {
                label: 'CA Actuel',
                value: metrics.ca_today?.toString() || '0',
                suffix: '€',
                trend: '+' + (Math.abs(metrics.ecart_objectif || 0) | 0) + '%',
                trendDir: (metrics.ecart_objectif || 0) >= 0 ? 'up' as const : 'down' as const,
                backTitle: 'Objectif Journée',
                backLines: [
                    `Objectif: ${metrics.ca_target || 8500}€`,
                    `Restant: ${Math.max(0, (metrics.ca_target || 8500) - (metrics.ca_today || 0))}€`
                ],
                accentColor: 'blue' as const,
                icon: '💰'
            },
            {
                label: 'Taux Atteinte',
                value: metrics.attainment?.toString() || '0',
                suffix: '%',
                trend: `±${Math.abs(100 - (metrics.attainment || 0)) | 0}%`,
                trendDir: (metrics.attainment || 0) >= 100 ? 'up' as const : 'neutral' as const,
                backTitle: 'Performance',
                backLines: [
                    `Niveau: ${metrics.niveau_urgence || 'LOW'}`,
                    `Prévision: ${metrics.forecast_eod || 0}€`
                ],
                accentColor: 'teal' as const,
                icon: '📊'
            },
            {
                label: 'Visiteurs/h',
                value: metrics.visitors_h?.toString() || '0',
                suffix: 'pers',
                trend: '+' + (Math.random() * 5 | 0),
                trendDir: 'up' as const,
                backTitle: 'Trafic',
                backLines: [
                    `Pic: 14h-16h`,
                    `Moyenne: ${metrics.visitors_h || 0}/h`
                ],
                accentColor: 'amber' as const,
                icon: '👥'
            },
            {
                label: 'Conversion',
                value: conversion.toString(),
                suffix: '%',
                trend: '+' + (Math.random() * 2 | 0) + '%',
                trendDir: conversion >= 12 ? 'up' as const : 'neutral' as const,
                backTitle: 'Taux Conversion',
                backLines: [
                    `Objectif: 12%`,
                    `Performance: ${conversion >= 12 ? 'Excellent' : 'À améliorer'}`
                ],
                accentColor: 'purple' as const,
                icon: '🎯'
            }
        ];
    });

    /**
     * Agent status data for monitoring page
     */
    agentsStatus = computed(() => {
        const metrics = this.ws.liveMetrics();
        if (!metrics || !metrics.agents_live) return [];

        return metrics.agents_live.map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            health_score: agent.health_score || 0,
            last_activity: agent.last_activity,
            metrics: agent.metrics || {}
        }));
    });

    /**
     * Monitoring connection status
     */
    isConnected = computed(() => this.ws.connected());

    /**
     * Urgency level
     */
    urgencyLevel = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.niveau_urgence || 'LOW';
    });

    /**
     * CA summary
     */
    caSummary = computed(() => {
        const metrics = this.ws.liveMetrics();
        return {
            today: metrics?.ca_today || 0,
            target: metrics?.ca_target || 8500,
            attainment: metrics?.attainment || 0,
            forecast_eod: metrics?.forecast_eod || 0,
            gap: metrics?.ecart_objectif || 0
        };
    });

    /**
     * Risk hours
     */
    riskHours = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.risk_hours || [];
    });

    /**
     * Hourly performance
     */
    hourlyPerformance = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.hourly_performance || [];
    });

    /**
     * Product mix
     */
    productMix = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.product_mix || [];
    });

    /**
     * Advisors list
     */
    advisors = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.advisors || [];
    });

    /**
     * Coaching cards
     */
    coachingCards = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.coaching_cards || [];
    });

    /**
     * Context heatmap
     */
    contextHeatmap = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.context_heatmap || {};
    });

    /**
     * Analyst summary
     */
    analystSummary = computed(() => {
        const metrics = this.ws.liveMetrics();
        return metrics?.analyst_summary || '';
    });

    /**
     * Strategy data
     */
    strategyData = computed(() => {
        const metrics = this.ws.liveMetrics();
        return {
            strategie: metrics?.strategie || '',
            actions: metrics?.strategie_actions || [],
            cause_racine: metrics?.cause_racine || '',
            focus_produits: metrics?.focus_produits || [],
            message_manager: metrics?.message_manager || ''
        };
    });
}