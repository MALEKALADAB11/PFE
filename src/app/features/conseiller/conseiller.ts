import {
  Component, computed, signal,
  ElementRef, ViewChild,
  AfterViewChecked, OnInit, OnDestroy, inject,
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { HttpClient }       from '@angular/common/http';
import { Subject }          from 'rxjs';
import { takeUntil, timeout }        from 'rxjs/operators';

import { MockDataService }  from '../../core/services/mock-data';
import { WebSocketService } from '../../core/services/websocket.service';
import { ApiService }       from '../../core/services/api';
import { environment }      from '../../../environments/environment';

interface Product {
  id: string; name: string; category: string;
  price: string; unit: string;
  margin: 'High' | 'Medium' | 'Top'; marginColor: string;
  hot: boolean; script: string; scriptLines: string[]; accentColor: string;
}

interface ChatMessage {
  id: string; role: 'user' | 'coach'; text: string; time: string;
  sources?: string[]; rag_used?: boolean; typing?: boolean; streaming?: boolean;
  urgency?: 'high' | 'medium' | 'low';
}

interface Alert {
  id: string; label: string; detail: string;
  color: string; bg: string; chatMessage: string;
  type: 'stock' | 'traffic' | 'weather' | 'gap';
}

@Component({
  selector: 'app-conseiller',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conseiller.html',
  styleUrl: './conseiller.scss',
})
export class ConseillerComponent implements AfterViewChecked, OnInit, OnDestroy {
  @ViewChild('chatBottom') chatBottom!: ElementRef;

  private http = inject(HttpClient);

  storeId        = 'store-lac2';
  selectedId     = signal<string>('');
  chatOpen       = signal<boolean>(true);
  chatTab        = signal<'coach' | 'alertes'>('coach');
  flippedProduct = signal<string | null>(null);
  chatInput      = signal<string>('');
  isTyping       = signal(false);
  shouldScroll   = false;
  liveAdvisors   = signal<any[]>([]);

  private destroy$       = new Subject<void>();
  private refreshTimer: any = null;
  private _lastAdvisorId = '';

  // ── Advisors dynamiques depuis WS ─────────────────────
  // Objectif : jamais de chiffre inventé. Target réel de la DB (objectifs),
  // sinon quote-part de l'objectif magasin ; prévision EOD = quote-part du
  // forecast TimesFM du magasin (proportionnelle au CA), pas un ×1.25 fictif.
  advisors = computed((): any[] => {
    const mapAdvisor = (list: any[]) => {
      const totalRev   = list.reduce((s, a) => s + (a.revenue ?? a.caRealized ?? 0), 0);
      const storeTgt   = Number(this.ws.liveMetrics()?.ca_target ?? 0);
      const storeEod   = this.ws.forecastEod();
      const fallbackTgt = storeTgt > 0 && list.length ? storeTgt / list.length : 0;

      return [...list]
        .sort((a: any, b: any) => (b.revenue ?? b.caRealized ?? 0) - (a.revenue ?? a.caRealized ?? 0))
        .map((a: any, i: number) => {
          const revenue = a.revenue ?? a.caRealized ?? 0;
          const target  = Number(a.target ?? a.caObjectif ?? 0) || fallbackTgt;
          const attainment = a.attainment != null
            ? Math.round(a.attainment)
            : target > 0 ? Math.round(revenue / target * 100) : 0;
          const share = totalRev > 0 ? revenue / totalRev : (list.length ? 1 / list.length : 0);
          return {
            id:          a.id ?? a.name?.replace(/ /g, '_').toLowerCase() ?? `adv_${i}`,
            name:        a.name ?? '',
            initials:    this._initials(a.name ?? ''),
            avatarColor: this._avatarColor(i),
            role:        this._roleFromName(a.name ?? ''),
            caRealized:  Math.round(revenue),
            caObjectif:  Math.round(target),
            hasTarget:   target > 0,
            performance: attainment,
            previsionEod: storeEod > 0 ? Math.round(storeEod * share) : 0,
            coachScore:  this._coachScore(attainment),
            nbVentes:    a.nb_ventes ?? 0,
            status:      attainment >= 80 ? 'top' : attainment >= 50 ? 'ok' : 'urgent',
          };
        });
    };

    const wsAdvisors = this.ws.liveMetrics()?.advisors;
    if (wsAdvisors?.length) return mapAdvisor(wsAdvisors);
    const apiList = this.liveAdvisors();
    if (apiList.length) return mapAdvisor(apiList);
    return this.data.getAdvisors().map((a) => ({ ...a, nbVentes: 0 }));
  });

  selected = computed(() => {
    const list = this.advisors();
    return list.find(a => a.id === this.selectedId()) ?? list[0] ?? null;
  });

  perfColor    = computed(() => this.advPerfColor(this.selected()?.performance ?? 0));
  caPercent    = computed(() => Math.min(100, Math.round(((this.selected()?.caRealized ?? 0) / Math.max(this.selected()?.caObjectif ?? 1, 1)) * 100)));
  selectedCaLive = computed(() => this.selected()?.caRealized ?? 0);
  advisorsList = computed(() => this.advisors());
  hoursLeft = computed(() => Math.max(0, 20 - new Date().getHours()));

  // ── Alertes temps réel — 100% sorties agents (AlertBus / Analyste / ticker RT)
  alerts = computed<Alert[]>(() => {
    const gap     = this.ws.gapPct();
    const gapAmt  = this.ws.gapAmount();
    const urgency = this.ws.urgencyLevel();
    const weather = (this.ws.weatherIcon() + ' ' + this.ws.weatherLabel()).trim();
    const signals = this.ws.liveMetrics()?.context_signals ?? [];
    const ticker  = this.ws.liveSalesTicker();
    const supAlerts = this.ws.supervisorInsights()?.critical_stock_alerts ?? [];
    const list: Alert[] = [];

    // 1. Ruptures / stocks critiques — flux temps réel du simulateur POS + inventory
    for (const t of ticker.filter(x => x.severity === 'rupture' || x.severity === 'critical').slice(0, 3)) {
      const name = t.product_name || `SKU ${t.sku}`;
      list.push({
        id: `rt-${t.sku}-${t.timestamp}`, type: 'stock',
        label: t.severity === 'rupture' ? `Rupture — ${name}` : `Stock critique — ${name}`,
        detail: `${t.stock_after} unité(s) restante(s) · vente -${t.units_sold} à ${this.tickerTime(t.timestamp)}`,
        color: '#E74C3C', bg: '#FDEDEC',
        chatMessage: `Stock ${t.severity === 'rupture' ? 'en rupture' : 'critique'} sur ${name} (${t.stock_after} unités). Comment gérer les clients intéressés et quelle alternative proposer ?`,
      });
    }

    // 2. Alertes stock du SupervisorAgent (cross-domain inventory)
    for (const a of supAlerts.slice(0, 2)) {
      const name = a.product_name || a.name || `SKU ${a.sku ?? ''}`;
      list.push({
        id: `sup-${a.sku ?? name}`, type: 'stock',
        label: `Risque rupture — ${name}`,
        detail: a.message || `Niveau ${a.risk_level ?? 'CRITICAL'} détecté par l'agent inventory`,
        color: '#E74C3C', bg: '#FDEDEC',
        chatMessage: `L'agent inventory signale un risque de rupture sur ${name}. Quelle stratégie de vente adopter ?`,
      });
    }

    // 3. Gap objectif — calcul temps réel de l'Agent Analyste (ReAct)
    if (gap > 0 && (urgency === 'HIGH' || gap > 25)) {
      list.push({
        id: 'gap-alert', type: 'gap',
        label:  `Gap ${gap.toFixed(0)}% — Urgence ${urgency}`,
        detail: `${gapAmt > 0 ? gapAmt.toFixed(0) + ' DT à rattraper · ' : ''}analyse Agent Analyste · ${this.hoursLeft()}h restantes`,
        color: urgency === 'HIGH' ? '#E74C3C' : '#F9A825',
        bg:    urgency === 'HIGH' ? '#FDEDEC' : '#FFF8E1',
        chatMessage: `L'analyste détecte un gap de ${gap.toFixed(0)}% (${gapAmt.toFixed(0)} DT). Quels produits prioriser maintenant ?`,
      });
    }

    // 4. Signaux contexte (météo/événements) — Agent Stratège
    const weatherSig = signals.find((s: any) => s.type === 'weather' && s.level !== 'low');
    if (weatherSig && weather) {
      list.push({
        id: 'weather', type: 'weather',
        label: `${weather} — Signal contexte actif`,
        detail: weatherSig.detail || 'Signal météo détecté par l\'Agent Stratège',
        color: '#2D9CDB', bg: '#E8F4FD',
        chatMessage: `Météo: ${weather}. Comment exploiter ce contexte pour booster les ventes ?`,
      });
    }

    return list;
  });

  // ── Recommandations — sorties réelles de l'Agent Stratège + Superviseur ──
  agentRecos = computed(() => {
    const actions = this.ws.strateActions() ?? [];
    const coachReco = this.ws.supervisorInsights()?.coach_recommendation;
    const list = actions.slice(0, 3).map((a, i) => ({
      id: `strat-${i}`,
      priorite: a.priorite ?? i + 1,
      action: a.action,
      produit: a.produit_cible,
      argument: a.argument_vente,
      impact: a.impact_estime,
      source: 'Agent Stratège',
      chatMessage: `Comment appliquer concrètement : "${a.action}" sur ${a.produit_cible} ? Donne-moi le script complet.`,
    }));
    if (coachReco?.product_to_push && list.length < 3) {
      list.push({
        id: 'sup-reco',
        priorite: list.length + 1,
        action: coachReco.message_for_advisor || `Pousser ${coachReco.product_to_push}`,
        produit: coachReco.product_to_push,
        argument: `Priorité ${coachReco.priority ?? 'normale'} · confiance ${Math.round((coachReco.confidence ?? 0) * 100)}%`,
        impact: '',
        source: 'SupervisorAgent',
        chatMessage: `Le superviseur recommande de pousser ${coachReco.product_to_push}. Donne-moi le script de vente.`,
      });
    }
    return list;
  });

  // Produits scorés par le SupervisorAgent (score multi-critères Sales×Inventory)
  scoredProducts = computed(() => this.ws.supervisorInsights()?.scored_products ?? []);

  tickerTime(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  recoToChat(reco: any) {
    this.chatTab.set('coach'); this.chatOpen.set(true); this.sendMessage(reco.chatMessage);
  }

  // ── Messages chat ─────────────────────────────────────
  messages = signal<ChatMessage[]>([]);

  // ── Produits ──────────────────────────────────────────
  products: Product[] = [
    {
      id: 'p1', name: 'iPhone 16 Pro', category: 'SMARTPHONE',
      price: '1,299', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#6C5CE7', script: 'Script iPhone 16 Pro',
      scriptLines: [
        '"Vous utilisez votre téléphone pour quoi principalement ?"',
        'Montrez la puce A18 Pro — différence réelle en photos et vidéo.',
        'Bundle: iPhone 16 Pro + coque + Assurance = +340 DT panier moyen.',
        'Objection prix: "Sur 24 mois c\'est 54 DT/mois."',
        'Urgence: "Il ne reste que 3 unités en stock."',
      ]
    },
    {
      id: 'p2', name: 'Forfait 5G Max', category: 'FORFAIT',
      price: '49', unit: 'DT/mois', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#00B894', script: 'Script Forfait 5G Max',
      scriptLines: [
        '"Combien de Go vous utilisez par mois en moyenne ?"',
        '100Go 5G + appels illimités = même prix que 3 recharges/mois.',
        'Bundle avec terminal = engagement 24 mois + remise immédiate.',
        '"Vous partez avec le téléphone aujourd\'hui via avance postpayé."',
        'Cible: 60% des clients recharge → forfait.',
      ]
    },
    {
      id: 'p3', name: 'Assurance Premium', category: 'SERVICE',
      price: '9', unit: 'DT/mois', margin: 'Top', marginColor: '#6C5CE7',
      hot: false, accentColor: '#E74C3C', script: 'Script Assurance Premium',
      scriptLines: [
        'Timing: proposer APRÈS confirmation de l\'achat du terminal.',
        '"Avec l\'Assurance Premium, écran remplacé en 48h."',
        '"9 DT/mois — un café par semaine. Réparation écran = 280 DT sans."',
        'Taux de conversion cible: 70% des ventes de terminaux.',
        'Ne jamais oublier — marge 80%.',
      ]
    },
    {
      id: 'p4', name: 'Apple Watch S10', category: 'ACCESSOIRE',
      price: '449', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#F9A825', script: 'Script Apple Watch S10',
      scriptLines: [
        'Ciblez les acheteurs iPhone: "La Watch s\'associe parfaitement à votre iPhone."',
        'Démonstration: notifs, suivi santé en temps réel.',
        'Contexte couvert: "La Watch est étanche à 50m."',
        'Bundle: Watch + bracelet sport + Assurance = +80 DT marge.',
        'Proposez paiement en 3x si hésitation sur le prix.',
      ]
    },
    {
      id: 'p5', name: 'AirPods Pro 3', category: 'ACCESSOIRE',
      price: '279', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#2D9CDB', script: 'Script AirPods Pro 3',
      scriptLines: [
        '"Vous utilisez des écouteurs actuellement ? Laissez-moi vous montrer la différence."',
        'Faites-les écouter la réduction de bruit active.',
        'Contexte couvert: "Parfait pour les déplacements, résistant à l\'eau."',
        'Comparez à Samsung — meilleure réduction de bruit au même prix.',
        'Ajoutez housse de protection = +25 DT, haute marge.',
      ]
    },
    {
      id: 'p6', name: 'Pack Pro Business', category: 'BUNDLE',
      price: '89', unit: 'DT/mois', margin: 'Top', marginColor: '#6C5CE7',
      hot: false, accentColor: '#6C5CE7', script: 'Script Pack Pro Business',
      scriptLines: [
        'Cible: indépendants, gérants de TPE.',
        '"Ligne 5G Pro + Fibre 1Go + Cloud Backup 1To."',
        'Avantage fiscal: intégralement déductible.',
        'Engagement 24 mois = stabilité + revenus récurrents.',
        'Offrez visite installation gratuite = différenciateur clé.',
      ]
    },
  ];

  quickPrompts = [
    'Script bundle assurance ?',
    'Argument 5G face aux concurrents ?',
    'Comment gérer objection prix ?',
    'Stratégie pic trafic 17h30 ?',
    'Upsell accessoires — contexte météo ?',
    'Comment atteindre l\'objectif ?',
  ];

  constructor(
    private data: MockDataService,
    private api:  ApiService,
    public  ws:   WebSocketService,
  ) {}

  ngOnInit() {
    this.api.getAdvisors(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: d => this.liveAdvisors.set(d.advisors ?? []), error: () => {} });

    this.ws.connectStore(this.storeId);

    this.refreshTimer = setInterval(() => {
      this.api.getAdvisors(this.storeId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: d => this.liveAdvisors.set(d.advisors ?? []), error: () => {} });
    }, 30000);

    // Sélectionner le 1er advisor après chargement
    setTimeout(() => {
      const list = this.advisors();
      if (!this.selectedId() && list.length > 0) {
        this._selectAndGreet(list[0].id);
      }
    }, 800);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) { this.scrollChat(); this.shouldScroll = false; }
  }

  // ── Sélection + message contextuel ────────────────────
  selectAdvisor(id: string) { this._selectAndGreet(id); }

  private _selectAndGreet(id: string) {
    if (this._lastAdvisorId === id) return;
    this._lastAdvisorId = id;
    this.selectedId.set(id);
    this.ws.connectAdvisor(id);
    this.messages.set([]);
    this._sendContextualGreeting();
  }

  private _sendContextualGreeting() {
    const adv = this.advisors().find(a => a.id === this.selectedId()) ?? this.advisors()[0];
    if (!adv) return;

    const perf    = adv.performance ?? 0;
    const ca      = adv.caRealized  ?? 0;
    const target  = adv.caObjectif  ?? 0;
    const prenom  = adv.name.split(' ').find((p: string) => p.length > 1) ?? adv.name.split(' ')[0];
    const hours   = Math.max(0, 20 - new Date().getHours());
    const weather = (this.ws.weatherIcon() + ' ' + this.ws.weatherLabel()).trim() || '⛅ Tunis';
    const actions = this.ws.strateActions() ?? [];
    const gap     = this.ws.gapPct();

    let greetText = '';
    let urgency: 'high' | 'medium' | 'low' = 'low';

    if (perf >= 90) {
      greetText = `Bravo ${prenom} ! Tu es à ${perf}% de ton objectif — excellent rythme 🏆\n\nMétéo: ${weather} · ${hours}h restantes.\n\n${actions.length > 0 ? `Pour aller encore plus loin: ${actions[0].action} → ${actions[0].produit_cible}` : 'Continue sur ta lancée — tu es le top performer aujourd\'hui !'}`;
      urgency = 'low';
    } else if (perf >= 70) {
      greetText = `Bien joué ${prenom} ! ${perf}% d'atteinte — ${ca} / ${target} DT 💪\n\nMétéo: ${weather} · ${hours}h restantes · ${(target - ca).toFixed(0)} DT à réaliser.\n\n${actions.length > 0 ? `Action recommandée: ${actions[0].action} → ${actions[0].produit_cible}\nArgument: ${actions[0].argument_vente}` : 'Continue avec les bundles terminal + forfait — panier moyen le plus élevé.'}`;
      urgency = 'medium';
    } else if (perf >= 40) {
      greetText = `${prenom}, tu es à ${perf}% — ${ca} / ${target} DT avec ${hours}h restantes ⚡\n\nGap: ${(target - ca).toFixed(0)} DT à rattraper.\nMétéo: ${weather}\n\n${actions.length > 0 ? `Priorité maintenant: ${actions[0].action}\nProduit: ${actions[0].produit_cible}\nArgument: ${actions[0].argument_vente}` : 'Pousse les forfaits Flexi 25Go et l\'Assurance Premium sur chaque vente.'}`;
      urgency = 'medium';
    } else {
      greetText = `${prenom}, attention 🚨 — ${perf}% seulement, ${ca} / ${target} DT.\n\nIl reste ${hours}h pour rattraper ${(target - ca).toFixed(0)} DT — c'est urgent.\n\n${actions.length > 0 ? `Action immédiate: ${actions[0].action}\nProduit cible: ${actions[0].produit_cible}\nArgument: ${actions[0].argument_vente}\nImpact estimé: ${actions[0].impact_estime}` : 'Chaque client compte — propose un bundle terminal + forfait à chaque visite. L\'avance postpayé supprime la barrière prix.'}`;
      urgency = 'high';
    }

    // Message local immédiat
    this.messages.update(list => [...list, {
      id: 'greet-local-' + Date.now(), role: 'coach' as const,
      text: greetText, time: this._now(),
      sources: ['Agent Analyste', 'Agent Stratège', ...(actions.length ? ['RAG Milvus'] : [])],
      rag_used: actions.length > 0, urgency,
    }]);
    this.shouldScroll = true;

    // Enrichissement via backend
    this._callBackendGreeting(adv, perf, gap, weather, actions);
  }

  private _callBackendGreeting(adv: any, perf: number, gap: number, weather: string, actions: any[]) {
    const hours = Math.max(0, 20 - new Date().getHours());
    const prompt = `Message de coaching pour ${adv.name} à ${perf}% objectif (${adv.caRealized}/${adv.caObjectif} DT), ${hours}h restantes. Météo: ${weather}. Urgence: ${this.ws.urgencyLevel()}.`;

    this.http.post<any>(`${environment.apiUrl}/api/v1/coach/chat`, {
      message: prompt, advisor_name: adv.name, store_id: 'store-lac2',
      context: {
        current_revenue: adv.caRealized, daily_target: adv.caObjectif,
        gap_pct: gap, urgency: this.ws.urgencyLevel(), weather,
        strategie_actions: actions, cause_racine: this.ws.causeRacine(),
        focus_produits: this.ws.focusProduits(),
        analyst_summary: this.ws.analystSummary(),
      },
    }).subscribe({
      next: (resp) => {
        if (resp?.reply && resp.reply.length > 30) {
          this.messages.update(list => {
            const filtered = list.filter(m => !m.id.startsWith('greet-local-'));
            return [...filtered, {
              id: 'greet-rag-' + Date.now(), role: 'coach' as const,
              text: resp.reply, time: this._now(),
              sources: ['Agent Analyste', 'Agent Stratège', ...(resp.rag_used ? ['RAG Milvus'] : ['Ollama LLM'])],
              rag_used: resp.rag_used ?? false,
              urgency: perf < 50 ? 'high' : perf < 80 ? 'medium' : 'low',
            }];
          });
          this.shouldScroll = true;
        }
      },
      error: () => {},
    });
  }

  // ── Envoyer message ───────────────────────────────────
  sendMessage(text?: string) {
    const msg = (text ?? this.chatInput()).trim();
    if (!msg || this.isTyping()) return;

    this.messages.update(list => [...list, {
      id: 'u' + Date.now(), role: 'user' as const, text: msg, time: this._now(),
    }]);
    this.chatInput.set('');
    this.isTyping.set(true);
    this.shouldScroll = true;

    this.messages.update(list => [...list, {
      id: 'typing', role: 'coach' as const, text: '', time: this._now(), typing: true,
    }]);

    this._callBackend(msg);
  }

  private async _callBackend(userMsg: string) {
    const adv     = this.selected();
    const actions = this.ws.strateActions() ?? [];
    const metrics = this.ws.liveMetrics();

    const body = JSON.stringify({
      message: userMsg, advisor_name: adv?.name ?? 'Conseiller', store_id: 'store-lac2',
      context: {
        current_revenue:   adv?.caRealized ?? 0,
        daily_target:      adv?.caObjectif ?? 0,
        gap_pct:           this.ws.gapPct(),
        urgency:           this.ws.urgencyLevel(),
        analyst_summary:   this.ws.analystSummary(),
        strategie:         this.ws.strategie(),
        strategie_actions: actions,
        cause_racine:      this.ws.causeRacine(),
        focus_produits:    this.ws.focusProduits(),
        weather:           (this.ws.weatherIcon() + ' ' + this.ws.weatherLabel()).trim(),
        forecast_eod:      metrics?.forecast_eod ?? 0,
        nb_ventes:         adv?.nbVentes ?? 0,
      },
    });

    const streamId = 'stream-' + Date.now();

    // Insert streaming placeholder
    this._removeTyping();
    this.messages.update(list => [...list, {
      id: streamId, role: 'coach' as const,
      text: '', time: this._now(), streaming: true,
    }]);

    try {
      const resp = await fetch(`${environment.apiUrl}/api/v1/coach/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(35_000),
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let accText   = '';
      let ragUsed   = false;
      let source    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.done) {
              ragUsed = evt.rag_used ?? false;
              source  = evt.source  ?? '';
            } else if (evt.token) {
              accText += evt.token;
              this.messages.update(list =>
                list.map(m => m.id === streamId ? { ...m, text: accText } : m)
              );
              this.shouldScroll = true;
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }

      // Finalise message
      this.messages.update(list =>
        list.map(m => m.id === streamId ? {
          ...m, streaming: false,
          sources: this._buildSources(userMsg, source, ragUsed),
          rag_used: ragUsed, urgency: 'low' as const,
        } : m)
      );

    } catch {
      this.messages.update(list =>
        list.filter(m => m.id !== streamId).concat({
          id: 'c' + Date.now(), role: 'coach' as const,
          text: this._localFallback(userMsg), time: this._now(),
          sources: ['Règles métier', 'POS live'], urgency: 'low' as const,
        })
      );
    } finally {
      this.isTyping.set(false);
      this.shouldScroll = true;
    }
  }

  private _removeTyping() {
    this.messages.update(list => list.filter(m => m.id !== 'typing'));
  }

  private _buildSources(msg: string, source: string, rag?: boolean): string[] {
    const s: string[] = [];
    if (rag)                              s.push('RAG Milvus');
    if (source?.includes('llm'))          s.push('Ollama LLM');
    if (source === 'fallback')            s.push('Règles métier');
    if (msg.toLowerCase().includes('stock'))    s.push('Inventaire live');
    if (msg.toLowerCase().includes('météo'))    s.push('Open-Meteo');
    if (msg.toLowerCase().includes('forecast')) s.push('TimesFM');
    s.push('Agent Stratège');
    return [...new Set(s)].slice(0, 4);
  }

  private _localFallback(msg: string): string {
    const m       = msg.toLowerCase();
    const adv     = this.selected();
    const gap     = this.ws.gapPct();
    const urgency = this.ws.urgencyLevel();
    const actions = this.ws.strateActions() ?? [];
    const weather = (this.ws.weatherIcon() + ' ' + this.ws.weatherLabel()).trim();

    if (actions.length > 0 && (m.includes('action') || m.includes('faire') || m.includes('quoi'))) {
      const a = actions[0];
      return `Action prioritaire: ${a.action}\n\nProduit: ${a.produit_cible}\nArgument: ${a.argument_vente}\nImpact estimé: ${a.impact_estime}`;
    }
    if (m.includes('assurance') || m.includes('insurance')) {
      return `Script Assurance Premium (marge 80%):\n\n1. Proposer APRÈS la vente du terminal.\n2. "9 DT/mois — un café par semaine. Réparation écran = 280 DT sans assurance."\n3. Taux de conversion cible: 70% des ventes terminaux.`;
    }
    if (m.includes('5g') || m.includes('concurrent')) {
      return `Argument 5G Ooredoo:\n\n1. Couverture 5G testée en boutique sur votre téléphone.\n2. Débit garanti vs partagé chez les concurrents.\n3. Forfait 5G Max = même prix que 3 recharges/mois + appels illimités.`;
    }
    if (m.includes('prix') || m.includes('cher') || m.includes('objection')) {
      return `Réponse objection prix:\n\n1. "1299 DT = 54 DT/mois sur 24 mois — moins que votre abonnement Netflix."\n2. Avance postpayé: terminal aujourd'hui, 0 DT supplémentaire.\n3. Offrez paiement en 3x sans frais.`;
    }
    if (m.includes('météo') || m.includes('pluie') || m.includes('couvert') || m.includes('accessoire')) {
      return `Stratégie ${weather}:\n\n1. Accessoires en avant — demande +40% par temps couvert.\n2. AirPods Pro 3 (résistant eau) + Apple Watch S10 (étanche 50m).\n3. "Parfait par temps couvert — protégez votre investissement."`;
    }
    if (m.includes('objectif') || m.includes('gap') || m.includes('rattraper')) {
      const ca  = adv?.caRealized ?? 0;
      const tgt = adv?.caObjectif ?? 0;
      return `Gap: ${(tgt - ca).toFixed(0)} DT à rattraper.\n\n1. Un iPhone 16 Pro = 1299 DT → comble le gap immédiatement.\n2. Bundle forfait + terminal = panier moyen 800 DT.\n3. Assurance Premium sur chaque vente = marge 80%.`;
    }
    return `Gap ${gap.toFixed(0)}% — ${urgency}.\n\n${actions.slice(0, 2).map((a: any) => `• ${a.action} → ${a.produit_cible}`).join('\n') || '• Bundle terminal + forfait\n• Assurance Premium sur chaque vente'}`;
  }

  // ── UI ────────────────────────────────────────────────
  openChat() {
    this.chatOpen.set(true); this.chatTab.set('coach');
    if (!this.selectedId() && this.advisors().length > 0) {
      this._selectAndGreet(this.advisors()[0].id);
    }
  }

  sendQuick(prompt: string) {
    this.chatTab.set('coach'); this.chatOpen.set(true); this.sendMessage(prompt);
  }

  alertToChat(alert: any) {
    this.chatTab.set('coach'); this.chatOpen.set(true); this.sendMessage(alert.chatMessage);
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  updateInput(e: Event) {
    this.chatInput.set((e.target as HTMLTextAreaElement).value);
  }

  dismissAlert(id: string) {}

  statusClass(s: string): string {
    return ({ top: 'status--top', ok: 'status--ok', urgent: 'status--urgent', attente: 'status--attente' })[s] ?? '';
  }

  statusText(s: string): string {
    return ({ top: 'Top', ok: 'OK', urgent: 'Urgent', attente: 'En attente' })[s] ?? s;
  }

  advPerfColor(p: number) { return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C'; }

  toggleFlip(id: string) { this.flippedProduct.update(cur => cur === id ? null : id); }
  isFlipped(id: string)  { return this.flippedProduct() === id; }
  trackById(_: number, item: { id: string }) { return item.id; }

  // ── Helpers ───────────────────────────────────────────
  private _initials(name: string): string {
    return name.split(' ').map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2);
  }

  private _avatarColor(i: number): string {
    return ['#6C5CE7','#00B894','#F9A825','#2D9CDB','#E74C3C','#A29BFE'][i % 6];
  }

  private _roleFromName(name: string): string {
    const n = name.toUpperCase();
    if (n.includes('ZOUITEN'))                          return 'Forfaits & Services';
    if (n.includes('MANSOUR') && n.includes('HELA'))    return 'Postpaye & Terminaux';
    if (n.includes('BEN AMMAR') || n.includes('MERIAM')) return 'Smartphones & Data';
    if (n.includes('KHOULOUD'))                         return 'Recharge & Accessoires';
    return 'Conseiller de vente';
  }

  private _coachScore(attainment: number): number {
    return Math.min(1, Math.max(0, +((attainment / 100) * 0.9 + 0.05).toFixed(2)));
  }

  private _now(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private scrollChat() {
    try { this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  // ── Overview dashboard signals ──────────────────────────────────────────────

  focusAdv = computed(() => {
    const list = this.advisors();
    const id   = this.selectedId();
    return list.find(a => a.id === id) ?? list[0] ?? null;
  });

  teamTotal = computed(() => {
    const list = this.advisors();
    if (!list.length) return { ca: 0, attainment: 0, ventes: 0, panierMoyen: 0 };
    const ca      = list.reduce((s, a) => s + (a.caRealized ?? 0), 0);
    const ventes  = list.reduce((s, a) => s + (a.nbVentes  ?? 0), 0);
    const target  = list.reduce((s, a) => s + (a.caObjectif ?? 0), 0);
    return {
      ca:          Math.round(ca),
      attainment:  Math.round((ca / Math.max(target, 1)) * 1000) / 10,
      ventes,
      panierMoyen: ventes > 0 ? Math.round(ca / ventes) : 0,
    };
  });

  // Répartition réelle par catégorie — product_mix calculé par le backend
  // (sales.transactions du jour), plus de 55/20/15/10 codé en dur.
  categoryDonut = computed(() => {
    const COLORS = ['#6C5CE7', '#27AE60', '#F9A825', '#2D9CDB', '#E74C3C', '#A29BFE'];
    const mix: any[] = this.ws.liveMetrics()?.product_mix ?? [];
    const real = mix
      .filter(m => (m.revenue ?? 0) > 0)
      .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
      .slice(0, 4);

    let cats: { label: string; pct: number; amount: number; color: string }[];
    if (real.length) {
      const total = real.reduce((s, m) => s + (m.revenue ?? 0), 0) || 1;
      cats = real.map((m, i) => ({
        label:  m.product ?? 'Autre',
        pct:    Math.round((m.revenue ?? 0) / total * 100),
        amount: Math.round(m.revenue ?? 0),
        color:  COLORS[i % COLORS.length],
      }));
    } else {
      // Aucune donnée mix reçue : donut neutre, pas de fausses catégories
      cats = [{ label: 'En attente de données', pct: 100, amount: this.teamTotal().ca, color: '#E2E8F0' }];
    }

    const R = 62, C = 2 * Math.PI * R;
    let cum = 0;
    return cats.map(c => {
      const arc        = (c.pct / 100) * C;
      const dashOffset = (C - cum).toFixed(1);
      cum += arc;
      return { ...c, dashArray: `${arc.toFixed(1)} ${C.toFixed(1)}`, dashOffset };
    });
  });

  recActions = computed(() => {
    // Actions réelles du Stratège dès la première disponible — le statique
    // n'apparaît qu'avant le tout premier cycle agent.
    const acts = this.ws.strateActions() ?? [];
    if (acts.length > 0) {
      return acts.slice(0, 3).map((a: any, i: number) => ({
        icon: ['rocket', 'chart', 'gift'][i % 3],
        title: a.action ?? a.produit_cible,
        desc:  a.argument_vente ?? a.produit_cible,
        impact: a.impact_estime || (i === 1 ? 'moyen' : 'élevé'),
      }));
    }
    return [
      { icon: 'rocket', title: 'En attente du cycle Stratège',   desc: 'Les actions IA arrivent après le premier cycle agent', impact: '' },
    ];
  });

  todayStr = computed(() =>
    new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  );

  pointsForts = computed(() => {
    const adv = this.focusAdv();
    if (!adv) return [];
    const pts: string[] = [];
    if (adv.performance >= 100) pts.push('Excellentes ventes de smartphones premium');
    if (adv.nbVentes >= 10)     pts.push('Bonne vente de forfaits data');
    if (adv.performance >= 80)  pts.push('Panier moyen au-dessus de l\'objectif');
    if (!pts.length) {
      pts.push('Potentiel à exploiter sur les forfaits 5G');
      pts.push('Travailler le panier moyen sur les accessoires');
    }
    return pts.slice(0, 3);
  });

  panierMoyen(adv: any): number {
    if (!adv?.nbVentes) return 0;
    return Math.round((adv.caRealized ?? 0) / adv.nbVentes);
  }

  vsObjDay(adv: any): number {
    return Math.round((adv?.caRealized ?? 0) - (adv?.caObjectif ?? 0));
  }

  minPct(v: number): number { return Math.min(v, 100); }

  // Prévision fin de journée réelle (quote-part du forecast TimesFM magasin)
  // — remplace les anciens chiffres mensuels inventés (CA×15, objectif×30).
  eodForecast(adv: any): number { return Math.round(adv?.previsionEod ?? 0); }
  eodVsTarget(adv: any): number {
    return Math.round((adv?.previsionEod ?? 0) - (adv?.caObjectif ?? 0));
  }
  eodProgress(adv: any): number {
    const t = adv?.caObjectif ?? 0;
    return t > 0 ? Math.min(Math.round((adv?.previsionEod ?? 0) / t * 100), 200) : 0;
  }

  isTopPerf(adv: any): boolean { return (adv?.performance ?? 0) >= 100; }

  setFocusAdvisor(id: string): void { this.selectAdvisor(id); }

  get priorityProducts() { return [this.products[0], this.products[1], this.products[4], this.products[5]]; }

  // ── New design helpers ──────────────────────────────────────────────────────

  alertCountBadge      = computed(() => this.alerts().length);
  underObjectifCount   = computed(() => this.advisors().filter(a => (a.performance ?? 0) < 50).length);
  upsellOpportunityCount = computed(() => this.advisors().filter(a => (a.performance ?? 0) >= 100).length);

  advMainBadge(adv: any): { label: string; color: string; bg: string; icon: string } {
    const p = adv?.performance ?? 0;
    if (p >= 100) return { label: 'TOP PERF',      color: '#F59E0B', bg: '#FFFBEB',  icon: 'star' };
    if (p < 50)   return { label: 'Sous objectif', color: '#E74C3C', bg: '#FDEDEC',  icon: 'warning' };
    return            { label: 'Action IA',       color: '#2D9CDB', bg: '#EBF5FB',  icon: 'action' };
  }

  advSecondBadge(adv: any, rank: number): string | null {
    if (rank === 0 && (adv?.performance ?? 0) >= 100) return 'Upsell suggéré';
    if (rank === 1 && (adv?.performance ?? 0) >= 100) return 'Action IA';
    return null;
  }

  liveAlerts = computed(() => {
    const priorities = [
      { label: 'HAUTE PRIORITÉ',  color: '#E74C3C', bg: '#FDEDEC' },
      { label: 'PRIORITÉ MOYENNE', color: '#F9A825', bg: '#FFF8E1' },
      { label: 'OPPORTUNITÉ',      color: '#27AE60', bg: '#E8F8F5' },
    ];
    return this.alerts().slice(0, 3).map((a, i) => ({
      ...a, ...priorities[i] ?? priorities[2],
      timeAgo: `il y a ${i + 1} min`,
    }));
  });

  // Timeline réelle : flux WebSocket des ventes simulées + alertes stock,
  // horodatage réel des événements (plus de "now - i minutes" fictif).
  timelineAlerts = computed(() => {
    const ticker = this.ws.liveSalesTicker();
    if (ticker.length) {
      return ticker.slice(0, 6).map(t => {
        const isAlert = t.severity === 'rupture' || t.severity === 'critical';
        const color = t.severity === 'rupture' ? '#E74C3C'
                    : t.severity === 'critical' ? '#E74C3C'
                    : t.severity === 'warning'  ? '#F9A825' : '#27AE60';
        const category = isAlert
          ? { label: 'Inventaire', color: '#E74C3C', bg: '#FDEDEC' }
          : { label: 'Vente',      color: '#27AE60', bg: '#E8F8F5' };
        const name = t.product_name || `SKU ${t.sku}`;
        return {
          time: this.tickerTime(t.timestamp),
          label: isAlert
            ? `${t.severity === 'rupture' ? 'Rupture' : 'Stock critique'} — ${name} (${t.stock_after} u.)`
            : `Vente ${name}${t.amount ? ' — ' + Math.round(t.amount) + ' DT' : ''}`,
          color, category,
        };
      });
    }
    // Fallback : alertes agents si le ticker n'a pas encore émis
    return this.alerts().slice(0, 3).map(a => ({
      time: '',
      label: a.label,
      color: a.color,
      category: a.type === 'stock'
        ? { label: 'Inventaire', color: '#2D9CDB', bg: '#EBF5FB' }
        : { label: 'Analyse', color: '#F9A825', bg: '#FFF8E1' },
    }));
  });

  iaActions = computed(() => {
    const badges = [
      { badge: 'Urgent',       badgeColor: '#E74C3C', badgeBg: '#FDEDEC' },
      { badge: 'À suivre',     badgeColor: '#F9A825', badgeBg: '#FFF8E1' },
      { badge: 'Opportunité',  badgeColor: '#27AE60', badgeBg: '#E8F8F5' },
    ];
    return this.recActions().map((a, i) => ({ ...a, ...(badges[i] ?? badges[2]) }));
  });
}