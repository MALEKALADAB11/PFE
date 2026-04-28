import {
  Component, computed, signal,
  ElementRef, ViewChild,
  AfterViewChecked, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { Subject }          from 'rxjs';
import { takeUntil }        from 'rxjs/operators';
import { MockDataService }  from '../../core/services/mock-data';
import { WebSocketService } from '../../core/services/websocket.service';
import { ApiService }       from '../../core/services/api';

interface Product {
  id:          string;
  name:        string;
  category:    string;
  price:       string;
  unit:        string;
  margin:      'High' | 'Medium' | 'Top';
  marginColor: string;
  hot:         boolean;
  script:      string;
  scriptLines: string[];
  accentColor: string;
}

interface ChatMessage {
  id:   string;
  role: 'user' | 'coach';
  text: string;
  time: string;
}

interface Alert {
  id:          string;
  label:       string;
  detail:      string;
  color:       string;
  bg:          string;
  chatMessage: string;
}

@Component({
  selector:    'app-conseiller',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './conseiller.html',
  styleUrl:    './conseiller.scss'
})
export class ConseillerComponent
  implements AfterViewChecked, OnInit, OnDestroy {

  @ViewChild('chatBottom') chatBottom!: ElementRef;

  storeId      = 'store-lac2';
  selectedId   = signal<string>('');
  chatOpen     = signal<boolean>(true);
  chatTab      = signal<'coach' | 'alertes'>('coach');
  flippedProduct = signal<string | null>(null);
  chatInput    = signal<string>('');
  shouldScroll = false;

  liveAdvisors   = signal<any[]>([]);
  private destroy$      = new Subject<void>();
  private refreshTimer: any = null;
  private _agentTimer:  any = null;
  private _msgInitDone  = false;

  // ─────────────────────────────────────────────────────
  // Advisors dynamiques depuis WS
  // ─────────────────────────────────────────────────────
  advisors = computed((): any[] => {
    const wsAdvisors = this.ws.liveMetrics()?.advisors;
    if (wsAdvisors?.length) {
      return [...wsAdvisors]
        .sort((a: any, b: any) => (b.revenue ?? 0) - (a.revenue ?? 0))
        .map((a: any, i: number) => ({
          id:           a.id ?? a.name?.replace(/ /g, '_').toLowerCase() ?? `adv_${i}`,
          name:         a.name ?? '',
          initials:     this._initials(a.name ?? ''),
          avatarColor:  this._avatarColor(i),
          role:         this._roleFromName(a.name ?? ''),
          caRealized:   Math.round(a.revenue    ?? 0),
          caObjectif:   Math.round(a.target     ?? 4500),
          performance:  Math.round(a.attainment ?? 0),
          previsionEod: Math.round((a.revenue   ?? 0) * 1.25),
          coachScore:   this._coachScore(a.attainment ?? 0),
          nbVentes:     a.nb_ventes ?? 0,
          status:       (a.attainment ?? 0) >= 80 ? 'top'
                      : (a.attainment ?? 0) >= 50 ? 'ok'
                      : 'urgent',
        }));
    }
    const apiList = this.liveAdvisors();
    if (apiList.length) {
      return [...apiList]
        .sort((a: any, b: any) =>
          (b.revenue ?? b.caRealized ?? 0) - (a.revenue ?? a.caRealized ?? 0)
        )
        .map((a: any, i: number) => ({
          id:           a.id ?? a.name?.replace(/ /g, '_').toLowerCase() ?? `adv_${i}`,
          name:         a.name ?? '',
          initials:     this._initials(a.name ?? ''),
          avatarColor:  this._avatarColor(i),
          role:         this._roleFromName(a.name ?? ''),
          caRealized:   Math.round(a.revenue    ?? a.caRealized ?? 0),
          caObjectif:   Math.round(a.target     ?? 4500),
          performance:  Math.round(a.attainment ?? a.performance ?? 0),
          previsionEod: Math.round((a.revenue   ?? 0) * 1.25),
          coachScore:   this._coachScore(a.attainment ?? 0),
          nbVentes:     a.nb_ventes ?? 0,
          status:       (a.attainment ?? 0) >= 80 ? 'top'
                      : (a.attainment ?? 0) >= 50 ? 'ok'
                      : 'urgent',
        }));
    }
    return [];
  });

  selected = computed(() => {
    const list = this.advisors();
    if (!list.length) return null;
    return list.find(a => a.id === this.selectedId()) ?? list[0];
  });

  perfColor = computed(() => {
    const p = this.selected()?.performance ?? 0;
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  });

  caPercent = computed(() => {
    const s = this.selected();
    if (!s?.caObjectif) return 0;
    return Math.min(100, Math.round((s.caRealized / s.caObjectif) * 100));
  });

  selectedCaLive = computed(() => this.selected()?.caRealized ?? 0);

  // ── Contexte Stratège ─────────────────────────────────
  weatherContext = computed(() =>
    this.ws.liveMetrics()?.store_context?.weather ?? ''
  );
  weatherIcon = computed(() => {
    const w = this.weatherContext();
    return w ? w.split(' ')[0] : '';
  });
  weatherLabel = computed(() => {
    const w = this.weatherContext();
    return w ? w.split(' ').slice(1).join(' ') : '';
  });

  nextHolidayLabel = computed(() => {
    const signals = this.ws.contextSignals() ?? [];
    const h = signals.find((s: any) => s.type === 'holiday');
    return h?.label ?? '';
  });

  promoLabel = computed(() =>
    this.ws.liveMetrics()?.store_context?.promo ?? ''
  );

  strateActions = computed(() => {
    const ws = this.ws.strateActions();
    if (ws?.length) return ws;
    return this.ws.liveMetrics()?.strategie_actions ?? [];
  });

  causeRacine = computed(() =>
    this.ws.causeRacine()
    || this.ws.liveMetrics()?.cause_racine
    || ''
  );

  urgencyLevel   = computed(() => this.ws.urgencyLevel()  ?? 'LOW');
  gapPct         = computed(() => this.ws.gapPct()        ?? 0);
  forecastEod    = computed(() => this.ws.forecastEod()   ?? 0);
  hoursRemaining = computed(() => Math.max(0, 20 - new Date().getHours()));

  contextTag = computed(() => {
    const signals = this.ws.contextSignals() ?? [];
    const weather = signals.find((s: any) => s.type === 'weather');
    if (weather?.level === 'high' || weather?.level === 'med') return weather.label ?? '';
    const promo = this.promoLabel();
    if (promo) return promo;
    return `Gap ${this.gapPct().toFixed(0)}% — ${this.urgencyLevel()}`;
  });

  // ── Produits dynamiques ───────────────────────────────
  products = computed((): Product[] => {
    const signals    = this.ws.contextSignals() ?? [];
    const actions    = this.strateActions();
    const focus      = this.ws.focusProduits() ?? [];
    const weatherSig = signals.find((s: any) => s.type === 'weather');
    const isRain     = (weatherSig?.label ?? '').toLowerCase().includes('pluie')
                    || (weatherSig?.label ?? '').toLowerCase().includes('nuage');
    const isHoliday  = signals.some((s: any) => s.type === 'holiday');

    const base: Product[] = [
      {
        id: 'p1', name: 'iPhone 16 Pro', category: 'SMARTPHONE',
        price: '1,299', unit: 'DT',
        margin: 'High', marginColor: '#00B894',
        hot: true, accentColor: '#6C5CE7',
        script: 'Script Vente iPhone 16 Pro',
        scriptLines: [
          '"Pour quoi utilisez-vous principalement votre téléphone ?"',
          'Montrez la différence avec la puce A18 Pro — photos et vidéo.',
          'Bundle : iPhone + coque + assurance = +340 DT de panier.',
          'Objection prix : "Sur 24 mois c\'est 54 DT/mois."',
          'Urgence : "Il ne nous reste que 3 unités."',
        ]
      },
      {
        id: 'p2', name: 'Forfait 5G Max', category: 'FORFAIT',
        price: '49', unit: 'DT/mois',
        margin: 'Medium', marginColor: '#F9A825',
        hot: true, accentColor: '#00B894',
        script: 'Script Forfait 5G Max',
        scriptLines: [
          '"Vous êtes satisfait de votre forfait actuel ?"',
          '5G = débit 10x supérieur + appels HD illimités.',
          'Bundle téléphone + forfait = économie garantie.',
          'Demandez quand expire leur contrat actuel.',
          'Si < 3 mois : pré-souscription avec activation différée.',
        ]
      },
      {
        id: 'p3', name: 'Assurance Premium', category: 'SERVICE',
        price: '9', unit: 'DT/mois',
        margin: 'High', marginColor: '#00B894',
        hot: false, accentColor: '#E74C3C',
        script: 'Script Assurance Premium',
        scriptLines: [
          'Proposer APRÈS confirmation d\'achat du terminal.',
          '"Remplacement écran en 48h avec l\'Assurance Premium."',
          'Recadrer : "9 DT/mois — un café par semaine."',
          'Montrer coût réparation = 280 DT sans assurance.',
          'Taux de conversion cible : 70% des ventes terminaux.',
        ]
      },
      {
        id: 'p4', name: 'Apple Watch S10', category: 'ACCESSOIRE',
        price: '449', unit: 'DT',
        margin: 'High', marginColor: '#00B894',
        hot: isRain, accentColor: '#F9A825',
        script: 'Script Apple Watch S10',
        scriptLines: [
          'Ciblez les acheteurs iPhone : "La Watch se couple parfaitement."',
          'Démo en boutique : notifications, suivi santé en direct.',
          isRain ? 'Contexte météo : "La Watch est étanche à 50m."'
                 : 'Sport : "Idéale pour suivre votre activité."',
          'Bundle : Watch + bracelet sport + AppleCare = +80 DT.',
          'Proposez 3x sans frais si hésitation sur le prix.',
        ]
      },
      {
        id: 'p5', name: 'AirPods Pro 3', category: 'ACCESSOIRE',
        price: '279', unit: 'DT',
        margin: 'High', marginColor: '#00B894',
        hot: isRain, accentColor: '#2D9CDB',
        script: 'Script AirPods Pro 3',
        scriptLines: [
          '"Vous utilisez des écouteurs ? Laissez-moi vous montrer."',
          'Faites écouter la réduction de bruit active.',
          isRain ? 'Contexte météo : "Résistant à l\'eau — parfait par ce temps."'
                 : 'Pour le sport et le travail — qualité audio incomparable.',
          'Comparez à Samsung — meilleure ANC à prix similaire.',
          'Housse de protection = +25 DT, article haute marge.',
        ]
      },
      {
        id: 'p6', name: 'Pack Pro Business', category: 'BUNDLE',
        price: '89', unit: 'DT/mois',
        margin: 'Top', marginColor: '#6C5CE7',
        hot: isHoliday, accentColor: '#6C5CE7',
        script: 'Script Pack Pro Business',
        scriptLines: [
          'Cible : indépendants, dirigeants de PME.',
          '"Ligne 5G Pro + Fibre 1Gb + Backup Cloud 1To."',
          'Avantage fiscal : déductible comme charge professionnelle.',
          'Engagement 24 mois = stabilité + revenus récurrents.',
          'Offrir installation gratuite = différenciateur clé.',
        ]
      },
    ];

    // Réordonner selon focus Stratège
    const focusKeywords = [
      ...focus.map((f: string) => f.toLowerCase()),
      ...actions.map((a: any) => (a.produit_cible ?? '').toLowerCase()),
    ];

    if (focusKeywords.length) {
      return [...base].sort((a, b) => {
        const aMatch = focusKeywords.some(k =>
          a.name.toLowerCase().includes(k) || a.category.toLowerCase().includes(k)
        );
        const bMatch = focusKeywords.some(k =>
          b.name.toLowerCase().includes(k) || b.category.toLowerCase().includes(k)
        );
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    if (isRain) {
      return [...base].sort((a, b) => {
        if (a.category === 'ACCESSOIRE' && b.category !== 'ACCESSOIRE') return -1;
        if (a.category !== 'ACCESSOIRE' && b.category === 'ACCESSOIRE') return 1;
        return 0;
      });
    }

    return base;
  });

  // ── Alertes ───────────────────────────────────────────
  alerts = signal<Alert[]>([
    {
      id: 'a1',
      label:  'Stock critique — iPhone 16 Pro',
      detail: '3 unités restantes · Risque rupture 91%',
      color:  '#E74C3C', bg: '#FDEDEC',
      chatMessage: 'Le stock iPhone 16 Pro est critique (3 unités). Comment gérer les clients intéressés ?'
    },
    {
      id: 'a2',
      label:  'Pic de trafic prévu 17h-19h',
      detail: 'Concert ce soir à 2km · +60% visiteurs attendus',
      color:  '#F9A825', bg: '#FFF8E1',
      chatMessage: 'Stratégie pour le pic de trafic à 17h ? Concert ce soir — comment se préparer ?'
    },
    {
      id: 'a3',
      label:  'Météo — +40% demande accessoires',
      detail: 'Signal météo actif jusqu\'à 18h',
      color:  '#2D9CDB', bg: '#E8F4FD',
      chatMessage: 'Comment exploiter le signal météo pour booster les ventes d\'accessoires ?'
    },
  ]);

  quickPrompts = [
    'Script bundle assurance ?',
    'Argument 5G face aux concurrents ?',
    'Comment gérer objection prix ?',
    'Stratégie pic trafic 17h30 ?',
    'Upsell accessoires — contexte météo ?',
    'Comment atteindre l\'objectif ?',
  ];

  messages = signal<ChatMessage[]>([]);

  constructor(
    private data: MockDataService,
    private api:  ApiService,
    public  ws:   WebSocketService
  ) {}

  ngOnInit() {
    // 1 — API advisors
    this.api.getAdvisors(this.storeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (d: any) => {
          this.liveAdvisors.set(d.advisors ?? []);
          this._tryInitMessage();
        },
        error: () => {}
      });

    // 2 — WS store
    if (!this.ws.connected()) {
      this.ws.connectStore(this.storeId);
    }

    // 3 — WS advisor
    this.ws.connectAdvisor(this.selectedId() || 'ahmed_ben_ali');

    // 4 — Message initial immédiat
    this._tryInitMessage();

    // 5 — Sync toutes les 3s
    this._agentTimer = setInterval(() => {
      this._syncAlertsFromAgents();
      this._tryInitMessage();
    }, 3000);

    // 6 — Refresh HTTP
    this.refreshTimer = setInterval(() => {
      this.api.getAdvisors(this.storeId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next:  (d: any) => this.liveAdvisors.set(d.advisors ?? []),
          error: () => {}
        });
    }, 60000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this._agentTimer)  clearInterval(this._agentTimer);
    this.destroy$.next();
    this.destroy$.complete();
    // NE PAS déconnecter le WS global
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this._scrollChat();
      this.shouldScroll = false;
    }
  }

  // ─────────────────────────────────────────────────────
  // Message initial coach
  // ─────────────────────────────────────────────────────
  private _tryInitMessage() {
    if (this._msgInitDone) return;

    const adv  = this.selected();
    const live = this.ws.liveMetrics();
    // Attendre qu'on ait au moins quelque chose
    if (!adv && !live) return;

    this._msgInitDone = true;

    const now    = new Date();
    const time   = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const name   = adv?.name?.split(' ')[0] ?? 'Conseiller';
    const perf   = adv?.performance ?? 0;
    const ca     = adv?.caRealized  ?? 0;
    const target = adv?.caObjectif  ?? 4500;
    const gap    = Math.max(0, target - ca);
    const heures = this.hoursRemaining();
    const actions = this.strateActions();
    const weather = this.weatherLabel() || this.weatherIcon();

    let msg = '';
    if (perf >= 80) {
      msg = `Bravo ${name} ! Tu es à ${perf}% de ton objectif — excellent rythme.`;
    } else if (perf >= 50) {
      msg = `Bonjour ${name} ! Tu es à ${perf}% de ton objectif avec ${heures}h restantes.`;
    } else if (perf > 0) {
      msg = `${name}, gap de ${gap.toLocaleString()} DT à combler — ${heures}h pour agir.`;
    } else {
      msg = `Coach IA actif. Urgence : ${this.urgencyLevel()} — Gap : ${this.gapPct().toFixed(0)}%.`;
    }

    if (weather) {
      msg += ` La météo (${weather}) crée une opportunité sur les accessoires.`;
    }

    if (actions.length > 0) {
      msg += ` Action prioritaire : ${actions[0].action} → ${actions[0].produit_cible}.`;
    }

    msg += ` Je surveille la boutique en temps réel. Sur quoi veux-tu travailler ?`;

    this.messages.set([{ id: 'm0', role: 'coach', text: msg, time }]);
    this.shouldScroll = true;
  }

  // ─────────────────────────────────────────────────────
  // Sync alertes agents
  // ─────────────────────────────────────────────────────
  private _syncAlertsFromAgents() {
    const signals = this.ws.contextSignals() ?? [];
    const actions = this.strateActions();
    const urgency = this.urgencyLevel();
    const dynamic: Alert[] = [];

    const wSig = signals.find((s: any) =>
      s.type === 'weather' && (s.level === 'high' || s.level === 'med')
    );
    if (wSig) {
      dynamic.push({
        id: 'a-weather',
        label:  wSig.label ?? 'Signal météo',
        detail: `Impact trafic détecté`,
        color: '#2D9CDB', bg: '#E8F4FD',
        chatMessage: `Signal météo : ${wSig.label}. Quelle stratégie adopter ?`
      });
    }

    const sSig = signals.find((s: any) => s.type === 'stock');
    if (sSig) {
      dynamic.push({
        id: 'a-stock',
        label:  sSig.label ?? 'Stock critique',
        detail: 'Risque de rupture détecté',
        color: '#E74C3C', bg: '#FDEDEC',
        chatMessage: `${sSig.label}. Comment gérer les clients intéressés ?`
      });
    }

    if (urgency === 'HIGH') {
      dynamic.push({
        id: 'a-urgency',
        label:  `🔴 Urgence HIGH — Gap ${this.gapPct().toFixed(0)}%`,
        detail: this.causeRacine() || 'Action immédiate requise',
        color: '#E74C3C', bg: '#FDEDEC',
        chatMessage: `Urgence HIGH. Gap ${this.gapPct().toFixed(0)}%. ${this.causeRacine()}. Que faire ?`
      });
    }

    if (actions.length > 0) {
      const a1 = actions[0];
      dynamic.push({
        id: 'a-stratege',
        label:  `🎯 Action : ${a1.produit_cible ?? ''}`,
        detail: a1.action ?? '',
        color: '#6C5CE7', bg: '#F0EDFD',
        chatMessage: `Comment exécuter : ${a1.action} ?`
      });
    }

    const hSig = signals.find((s: any) => s.type === 'holiday');
    if (hSig) {
      dynamic.push({
        id: 'a-holiday',
        label:  hSig.label ?? 'Jour férié',
        detail: 'Adapter la stratégie au contexte',
        color: '#F9A825', bg: '#FFF8E1',
        chatMessage: `${hSig.label}. Quelle stratégie pour ce contexte ?`
      });
    }

    if (dynamic.length > 0) {
      const dynamicIds = new Set(dynamic.map(a => a.id));
      const manual = this.alerts().filter(a =>
        !dynamicIds.has(a.id) &&
        !['a-weather','a-stock','a-urgency','a-stratege','a-holiday'].includes(a.id)
      );
      this.alerts.set([...dynamic, ...manual]);
    }
  }

  // ─────────────────────────────────────────────────────
  // Actions UI
  // ─────────────────────────────────────────────────────
  selectAdvisor(id: string) {
    this.selectedId.set(id);
    this.ws.connectAdvisor(id);
    this._msgInitDone = false;
    this.messages.set([]);
    setTimeout(() => this._tryInitMessage(), 200);
  }

  openChat() {
    this.chatOpen.set(true);
    this.chatTab.set('coach');
  }

  sendMessage(text?: string) {
    const msg = (text ?? this.chatInput()).trim();
    if (!msg) return;

    // ── Message utilisateur ───────────────────────────────
    this.messages.update(list => [...list, {
      id:   'u' + Date.now(),
      role: 'user' as const,
      text: msg,
      time: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit'
      })
    }]);
    this.chatInput.set('');
    this.shouldScroll = true;

    // ── Indicateur typing ─────────────────────────────────
    const typingId = 'typing-' + Date.now();
    this.messages.update(list => [...list, {
      id:   typingId,
      role: 'coach' as const,
      text: '...',
      time: ''
    }]);
    this.shouldScroll = true;

    // ── Contexte complet pour le LLM ─────────────────────
    const context = {
      strategie:         this.ws.liveMetrics()?.strategie         ?? '',
      strategie_actions: this.ws.liveMetrics()?.strategie_actions ?? [],
      cause_racine:      this.causeRacine(),
      weather:           this.weatherContext(),
      urgency:           this.urgencyLevel(),
    };

    // ── Appel API CoachAgent ──────────────────────────────
    this.api.coachChat({
      message:      msg,
      advisor_name: this.selected()?.name ?? '',
      store_id:     this.storeId,
      context,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.messages.update(list => [
          ...list.filter(m => m.id !== typingId),
          {
            id:   'c' + Date.now(),
            role: 'coach' as const,
            text: res.reply ?? '',
            time: new Date().toLocaleTimeString('fr-FR', {
              hour: '2-digit', minute: '2-digit'
            })
          }
        ]);
        this.shouldScroll = true;
      },
      error: () => {
        // Fallback local si API indisponible
        this.messages.update(list => [
          ...list.filter(m => m.id !== typingId),
          {
            id:   'c' + Date.now(),
            role: 'coach' as const,
            text: this._generateReply(msg),
            time: new Date().toLocaleTimeString('fr-FR', {
              hour: '2-digit', minute: '2-digit'
            })
          }
        ]);
        this.shouldScroll = true;
      }
    });
}

  sendQuick(prompt: string) {
    this.chatTab.set('coach');
    this.chatOpen.set(true);
    this.sendMessage(prompt);
  }

  alertToChat(alert: Alert) {
    this.chatTab.set('coach');
    this.chatOpen.set(true);
    this.sendMessage(alert.chatMessage);
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  updateInput(e: Event) {
    this.chatInput.set((e.target as HTMLTextAreaElement).value);
  }

  dismissAlert(id: string) {
    this.alerts.update(list => list.filter(a => a.id !== id));
  }

  toggleFlip(id: string) {
    this.flippedProduct.update(cur => cur === id ? null : id);
  }

  isFlipped(id: string) { return this.flippedProduct() === id; }

  // ─────────────────────────────────────────────────────
  // Réponses coach contextualisées
  // ─────────────────────────────────────────────────────
  private _generateReply(msg: string): string {
    const m       = msg.toLowerCase();
    const adv     = this.selected();
    const ca      = adv?.caRealized ?? 0;
    const target  = adv?.caObjectif ?? 4500;
    const gap     = Math.max(0, target - ca);
    const actions = this.strateActions();
    const weather = this.weatherLabel() || this.weatherIcon();
    const urgency = this.urgencyLevel();

    const strateCtx = actions.length > 0
      ? `\n\n💡 Action Stratège : ${actions[0].action} → ${actions[0].produit_cible}`
      : '';

    if (m.includes('assurance') || m.includes('insurance')) {
      return `Script Assurance Premium :\n\n1. Proposer APRÈS confirmation d'achat.\n2. "Remplacement écran en 48h avec l'Assurance Premium."\n3. Recadrer : "9 DT/mois — un café par semaine."\n4. Montrer coût réparation = 280 DT sans assurance.\n5. Taux de conversion cible : 70% des ventes terminaux.`;
    }

    if (m.includes('5g') || m.includes('concurrent')) {
      return `Argument 5G face aux concurrents :\n\n1. Notre réseau couvre 94% vs 87% concurrents.\n2. Débit garanti vs bande passante partagée.\n3. Faites tester le réseau actuel du client en boutique.\n4. Mettez en avant le bundle exclusif 5G Pro.${strateCtx}`;
    }

    if (m.includes('prix') || m.includes('objection') || m.includes('cher')) {
      return `Recadrage prix :\n\n1. Décomposer : "1 299 DT = 54 DT/mois sur 24 mois."\n2. "Moins que votre abonnement Netflix + Spotify."\n3. Caméra pro, durabilité 5 ans, valeur de reprise.\n4. Proposer 3x sans frais si hésitation.`;
    }

    if (m.includes('trafic') || m.includes('pic') || m.includes('17h') || m.includes('18h')) {
      const list = this.advisors();
      const roles = ['terminaux premium', 'fibre et offres Pro', 'accessoires', 'accueil et orientation'];
      return `Plan équipe pour le pic 17h-19h :\n\n${
        list.map((a, i) => `${i+1}. ${a.name?.split(' ')[0]} → ${roles[i] ?? 'support'}`).join('\n')
      }\n\nPréparez les produits phares en vitrine avant 16h45.${strateCtx}`;
    }

    if (m.includes('pluie') || m.includes('accessoire') || m.includes('météo')) {
      return `Stratégie accessoires — contexte météo ${weather} :\n\n1. Signal actif : +40% demande.\n2. Priorité : AirPods Pro 3 (résistant eau), Apple Watch (étanche 50m).\n3. Accroche : "Parfait par ce temps, certifié résistant à l'eau."\n4. Déplacer un conseiller en zone accessoires immédiatement.`;
    }

    if (m.includes('stock') || m.includes('iphone') || m.includes('rupture')) {
      return `Stock iPhone 16 Pro critique (3 unités) :\n\nStratégie : créer l'urgence.\nClients hésitants : réservation avec acompte 10%.\nRediriger vers Samsung A55 (24 unités disponibles).`;
    }

    if (m.includes('objectif') || m.includes('target') || m.includes('dépasser')) {
      return `Atteindre l'objectif ${target.toLocaleString()} DT :\n\nActuel : ${ca.toLocaleString()} DT · Gap : ${Math.round(gap).toLocaleString()} DT\n\n1. Un iPhone 16 Pro comble le gap immédiatement.\n2. Deux bundles accessoires = ~300 DT.\n3. Assurance Premium sur chaque vente de terminal.${strateCtx}`;
    }

    if (m.includes('stratégie') || m.includes('agent') || m.includes('recommand') || m.includes('exécuter')) {
      if (actions.length > 0) {
        const txt = actions.slice(0, 3).map((a: any, i: number) =>
          `${i+1}. ${a.action}\n   → ${a.produit_cible}${a.argument_vente ? '\n   💬 ' + a.argument_vente : ''}`
        ).join('\n\n');
        return `Recommandations Agent Stratège :\n\n${txt}\n\nCause racine : ${this.causeRacine() || 'Gap structurel'}\nUrgence : ${urgency}`;
      }
    }

    return `Analyse de votre question...\n\nCroisant données POS live, signaux météo, stocks et prévisions TimesFM.${strateCtx}\n\nVoulez-vous que je détaille un produit ou un conseiller spécifique ?`;
  }

  // ─────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────
  statusClass(s: string): string {
    return ({ top: 'status--top', ok: 'status--ok',
              urgent: 'status--urgent', attente: 'status--attente' } as any)[s] ?? '';
  }

  statusText(s: string): string {
    return ({ top: 'Top', ok: 'OK', urgent: 'Urgent', attente: 'Waiting' } as any)[s] ?? s;
  }

  advPerfColor(p: number): string {
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  }

  private _initials(name: string): string {
    return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  }

  private _avatarColor(i: number): string {
    return ['#2D9CDB','#9B51E0','#27AE60','#F2994A'][i % 4];
  }

  private _roleFromName(name: string): string {
    const roles: Record<string, string> = {
      'Ahmed Ben Ali':  'Smartphones · 5G',
      'Nour Hamdi':     'Fibre · Offres Pro',
      'Rami Jlassi':    'Accessoires',
      'Ines Baccouche': 'Rétention · CRM',
    };
    return roles[name] ?? 'Conseiller';
  }

  private _coachScore(attainment: number): string {
    return Math.min(0.99, 0.50 + (attainment / 100) * 0.49).toFixed(2);
  }

  private _scrollChat() {
    try {
      this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}