import {
  Component,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

import { WebSocketService } from '../../core/services/websocket.service';
import { ApiService }        from '../../core/services/api';
import { MockDataService }   from '../../core/services/mock-data';
import { Advisor }           from '../../core/models/advisor';

type MessageRole = 'user' | 'coach' | 'system';
type ConvMode    = 'general' | 'advisor' | 'inventory' | 'strategy';

interface Message {
  id:          string;
  role:        MessageRole;
  text:        string;
  time:        string;
  typing?:     boolean;
  sources?:    string[];
  confidence?: number;
  rag_used?:   boolean;
}

interface Conversation {
  id:       string;
  title:    string;
  mode:     ConvMode;
  preview:  string;
  time:     string;
  unread:   number;
  messages: Message[];
  advisorName?: string;
}

interface SuggestedPrompt {
  label:    string;
  text:     string;
  category: string;
  color:    string;
}

// ── Inventory chat response shape ─────────────────────────────────────────
interface InventoryChatResponse {
  answer:      string;
  intent:      string;
  sku:         string | null;
  data_source: string;
  timestamp:   string;
}

@Component({
  selector:    'app-chat',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl:    './chat.scss',
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('msgEnd') msgEnd!: ElementRef;

  private ws   = inject(WebSocketService);
  private api  = inject(ApiService);
  private http = inject(HttpClient);

  advisors: Advisor[]  = [];
  shouldScroll         = false;

  inputValue    = signal('');
  isTyping      = signal(false);
  activeConvId  = signal('c1');
  searchQuery   = signal('');
  showSidebar   = signal(true);
  prefillMeta   = signal<{ sku?: string; name?: string; mode?: string } | null>(null);

  editingConvId = signal<string | null>(null);
  editingTitle  = signal('');
  chatDomain    = signal<'sales' | 'stock'>('sales');

  // ── SKU context tracking for multi-turn inventory conversations ───
  private currentSkuContext = signal<string | null>(null);

  // ── Données live depuis le WebSocket ───────────────────────────
  liveGapPct        = computed(() => this.ws.gapPct()         ?? 0);
  liveUrgency       = computed(() => this.ws.urgencyLevel()   ?? 'MEDIUM');
  liveSummary       = computed(() => this.ws.analystSummary() ?? '');
  liveStrategie     = computed(() => this.ws.strategie()      ?? '');
  liveActions       = computed(() => this.ws.strateActions()  ?? []);
  liveCause         = computed(() => this.ws.causeRacine()    ?? '');
  liveFocus         = computed(() => this.ws.focusProduits()  ?? []);
  liveWeather       = computed(() => {
    const icon  = this.ws.weatherIcon()  ?? '';
    const label = this.ws.weatherLabel() ?? '';
    return `${icon} ${label}`.trim() || '☁️ Tunis';
  });
  liveMetrics       = computed(() => this.ws.liveMetrics());

  // ── Suggestions dynamiques depuis l'état live ───────────────────
  dynamicSuggestions = computed<SuggestedPrompt[]>(() => {
    const actions  = this.liveActions();
    const focus    = this.liveFocus();
    const urgency  = this.liveUrgency();
    const weather  = this.liveWeather();
    const gap      = this.liveGapPct();

    const suggs: SuggestedPrompt[] = [];

    // Suggestion 1 — basée sur la 1ère action du stratège
    if (actions.length > 0) {
      suggs.push({
        label:    actions[0].action.slice(0, 45) + (actions[0].action.length > 45 ? '…' : ''),
        text:     `Comment appliquer cette action: "${actions[0].action}" avec le produit ${actions[0].produit_cible}?`,
        category: 'Stratège',
        color:    '#6C5CE7',
      });
    }

    // Suggestion 2 — basée sur le gap
    if (gap > 50) {
      suggs.push({
        label:    `Rattraper gap de ${gap.toFixed(0)}%`,
        text:     `J'ai un gap de ${gap.toFixed(0)}% sur l'objectif. Quels produits prioriser maintenant pour rattraper le maximum?`,
        category: 'Urgence',
        color:    '#E74C3C',
      });
    } else if (gap > 20) {
      suggs.push({
        label:    'Script bundle terminal + forfait',
        text:     'Donne-moi un script de vente pour proposer un bundle terminal + forfait 5G à un client indécis.',
        category: 'Script',
        color:    '#F9A825',
      });
    }

    // Suggestion 3 — basée sur la météo
    if (weather.includes('🌧') || weather.includes('pluie') || weather.includes('Pluie')) {
      suggs.push({
        label:    'Stratégie météo pluie',
        text:     `La météo est "${weather}". Quels produits Ooredoo pousser et quel argument utiliser avec les clients qui entrent dans la boutique?`,
        category: 'Météo',
        color:    '#2D9CDB',
      });
    } else {
      suggs.push({
        label:    'Argument 5G face aux concurrents',
        text:     'Quels arguments utiliser face à un client qui compare Ooredoo 5G avec la concurrence?',
        category: 'Argument',
        color:    '#00B894',
      });
    }

    // Suggestion 4 — produit focus
    if (focus.length > 0) {
      suggs.push({
        label:    `Script ${focus[0]}`,
        text:     `Donne-moi un script de vente complet pour le produit "${focus[0]}" adapté au contexte actuel de la boutique.`,
        category: 'Produit',
        color:    '#00B894',
      });
    } else {
      suggs.push({
        label:    'Gérer objection prix iPhone',
        text:     'Comment répondre à un client qui dit que l\'iPhone 16 Pro est trop cher par rapport à Samsung?',
        category: 'Objection',
        color:    '#F9A825',
      });
    }

    // Toujours avoir 4 suggestions
    while (suggs.length < 4) {
      suggs.push({
        label:    'Technique de closing',
        text:     'Donne-moi la technique de closing la plus efficace pour un client hésitant entre deux terminaux.',
        category: 'Closing',
        color:    '#6C5CE7',
      });
    }

    return suggs.slice(0, 4);
  });

  conversations = signal<Conversation[]>([]);

  activeConv = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId())
    ?? this.conversations()[0]
  );

  filteredConvs = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.conversations();
    return this.conversations().filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q)
    );
  });

  modeColors: Record<ConvMode, string> = {
    general:   '#6C5CE7',
    advisor:   '#00B894',
    inventory: '#E74C3C',
    strategy:  '#F9A825',
  };

  modeLabels: Record<ConvMode, string> = {
    general:   'Général',
    advisor:   'Conseiller',
    inventory: 'Inventaire',
    strategy:  'Stratégie',
  };

  constructor(private data: MockDataService) {
    this.advisors = this.data.getAdvisors();
  }

  ngOnInit(): void {
    // Créer la conversation initiale avec contexte live
    this._initConversations();

    // Essayer de récupérer un prefill depuis sessionStorage
    try {
      const raw = sessionStorage.getItem('chat_prefill');
      if (raw) {
        sessionStorage.removeItem('chat_prefill');
        const parsed = JSON.parse(raw);
        this.inputValue.set(parsed.text ?? '');
        this.prefillMeta.set({ sku: parsed.sku, name: parsed.name, mode: parsed.mode });
        if (parsed.mode === 'inventory') {
          const existing = this.conversations().find(c => c.mode === 'inventory');
          if (existing) this.selectConv(existing.id);
          else this.newConvWithMode('inventory', parsed.name ?? 'Stock alert');
          // Seed the SKU context from the prefill so the first turn resolves it
          if (parsed.sku) this.currentSkuContext.set(parsed.sku);
        }
      }
    } catch { /* ignore */ }

    this.shouldScroll = true;
  }

  ngOnDestroy(): void {}

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  // ── Init conversations avec message contextuel ──────────────────
  private _initConversations(): void {
    const gap      = this.liveGapPct();
    const urgency  = this.liveUrgency();
    const summary  = this.liveSummary();
    const weather  = this.liveWeather();
    const actions  = this.liveActions();
    const cause    = this.liveCause();

    const action1  = actions[0]?.action ?? 'Focus bundle terminal + forfait';
    const produit1 = actions[0]?.produit_cible ?? 'Forfait Flexi 25Go';

    const greetMsg = summary
      ? `Bonjour ! ${summary} \n\nContexte: ${weather}. ${cause ? `Cause principale: ${cause}. ` : ''}Action prioritaire: ${action1} → ${produit1}.`
      : `Bonjour ! Je suis votre CoachAgent IA Ooredoo. Je surveille la boutique en temps réel. Comment puis-je vous aider?`;

    const initConv: Conversation = {
      id:       'c1',
      title:    'Session coaching — Lac 2',
      mode:     'strategy',
      preview:  greetMsg.slice(0, 60),
      time:     this.now(),
      unread:   0,
      messages: [
        {
          id:   'sys1',
          role: 'system',
          text: `Session démarrée · CoachAgent IA · ${this.now()}`,
          time: this.now(),
        },
        {
          id:         'greet1',
          role:       'coach',
          text:       greetMsg,
          time:       this.now(),
          sources:    ['POS live', 'Agent Analyste', 'Agent Stratège', ...(actions.length ? ['RAG Milvus'] : [])],
          confidence: 0.88,
          rag_used:   actions.length > 0,
        },
      ],
    };

    this.conversations.set([initConv]);
  }

  // ── Envoyer un message ──────────────────────────────────────────
  send(text?: string): void {
    const msg = (text ?? this.inputValue()).trim();
    if (!msg || this.isTyping()) return;

    this.addMessage({ id: 'u' + Date.now(), role: 'user', text: msg, time: this.now() });
    this.inputValue.set('');
    this.isTyping.set(true);
    this.shouldScroll = true;

    // Afficher le typing indicator
    this.addMessage({ id: 'typing', role: 'coach', text: '', time: this.now(), typing: true });

    // Route to the correct backend based on conversation mode
    const mode = this.activeConv()?.mode ?? 'general';
    if (mode === 'inventory') {
      this._callInventoryBackend(msg);
    } else {
      this._callCoachBackend(msg);
    }
  }

  // ── Appel backend inventory /api/inventory/chat ─────────────────
  private _callInventoryBackend(userMsg: string): void {
    const prefill = this.prefillMeta();
    const skuCtx  = this.currentSkuContext() ?? prefill?.sku ?? null;

    const payload = {
      message:              userMsg,
      store_id:             'I63',
      conversation_history: this.activeConv()
        ?.messages
        .filter(m => m.role === 'user' || m.role === 'coach')
        .map(m => ({
          role:    m.role === 'coach' ? 'assistant' : 'user',
          content: m.text,
        })) ?? [],
      sku_context: skuCtx,
    };

    this.http
      .post<InventoryChatResponse>(
        'http://localhost:8000/api/inventory/chat',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      )
      .subscribe({
        next: (resp) => {
          this._removeTyping();

          // Carry the resolved SKU forward to the next turn
          if (resp.sku) this.currentSkuContext.set(resp.sku);

          this.addMessage({
            id:         'c' + Date.now(),
            role:       'coach',
            text:       resp.answer,
            time:       this.now(),
            sources:    this._buildInventorySources(resp.intent, resp.data_source),
            confidence: resp.data_source === 'fresh_analysis' ? 0.95 : 0.88,
          });

          this.isTyping.set(false);
          this.shouldScroll = true;
        },
        error: (err) => {
          this._removeTyping();
          this.addMessage({
            id:   'err' + Date.now(),
            role: 'coach',
            text: 'Unable to reach inventory agent. Please check your connection.',
            time: this.now(),
          });
          this.isTyping.set(false);
          console.error('[Chat] inventory backend error', err);
        },
      });
  }

  private _buildInventorySources(intent: string, dataSource: string): string[] {
    const map: Record<string, string[]> = {
      explain_recommendation: ['Decision Agent', 'DB Recommendations'],
      explain_alert:          ['Analysis Agent', 'Risk Engine'],
      discuss_decision:       ['Decision Agent', 'Analysis Agent'],
      weather_or_context:     ['Context Agent', 'Open-Meteo'],
      broad_overview:         ['All Agents'],
      free_question:          ['Inventory Knowledge'],
    };
    const sources = [...(map[intent] ?? ['Inventory Agent'])];
    if (dataSource === 'fresh_analysis') sources.push('Live Pipeline');
    return sources;
  }

  // ── Appel backend /api/v1/coach/chat avec contexte live ─────────
  private _callCoachBackend(userMsg: string): void {
    const metrics = this.liveMetrics();
    const actions = this.liveActions();

    const payload = {
      message:      userMsg,
      advisor_name: this.activeConv()?.advisorName ?? 'Conseiller',
      store_id:     'store-lac2',
      context: {
        current_revenue:   metrics?.ca_today        ?? 0,
        daily_target:      metrics?.ca_target        ?? 1007,
        gap_pct:           this.liveGapPct(),
        urgency:           this.liveUrgency(),
        analyst_summary:   this.liveSummary(),
        strategie:         this.liveStrategie(),
        strategie_actions: actions,
        cause_racine:      this.liveCause(),
        focus_produits:    this.liveFocus(),
        weather:           this.liveWeather(),
        forecast_eod:      metrics?.forecast_eod     ?? 0,
        advisors:          metrics?.advisors          ?? [],
      },
    };

    this.http
      .post<{ reply: string; source: string; timestamp: string; rag_used?: boolean }>(
        'http://localhost:8000/api/v1/coach/chat',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      )
      .subscribe({
        next: (resp) => {
          this._removeTyping();
          const sources = this._buildSources(userMsg, resp.source, resp.rag_used);
          this.addMessage({
            id:         'c' + Date.now(),
            role:       'coach',
            text:       resp.reply,
            time:       this.now(),
            sources,
            confidence: resp.rag_used ? 0.91 : 0.82,
            rag_used:   resp.rag_used ?? false,
          });
          this.isTyping.set(false);
          this.shouldScroll = true;
        },
        error: (err) => {
          console.error('[COACH] Backend error:', err);
          this._removeTyping();
          // Fallback local enrichi avec contexte live
          const fallback = this._localFallback(userMsg);
          this.addMessage({
            id:         'c' + Date.now(),
            role:       'coach',
            text:       fallback,
            time:       this.now(),
            sources:    ['Fallback local', 'POS live'],
            confidence: 0.65,
            rag_used:   false,
          });
          this.isTyping.set(false);
          this.shouldScroll = true;
        },
      });
  }

  // ── Sources selon l'origine de la réponse ──────────────────────
  private _buildSources(msg: string, source: string, rag_used?: boolean): string[] {
    const srcs: string[] = [];
    if (rag_used) srcs.push('RAG Milvus');
    if (source === 'llm' || source === 'llm+rag') srcs.push('Ollama LLM');
    if (source === 'fallback') srcs.push('Règles métier');

    const m = msg.toLowerCase();
    if (m.includes('stock') || m.includes('iphone'))          srcs.push('Inventaire live');
    if (m.includes('météo') || m.includes('pluie'))           srcs.push('Open-Meteo');
    if (m.includes('forecast') || m.includes('prévision'))    srcs.push('Prophet + TimesFM');
    if (m.includes('script') || m.includes('argument'))       srcs.push('Scripts I63');
    if (this.liveActions().length)                            srcs.push('Agent Stratège');
    if (this.liveSummary())                                   srcs.push('Agent Analyste');

    return [...new Set(srcs)].slice(0, 4);
  }

  // ── Fallback local enrichi avec données live ────────────────────
  private _localFallback(msg: string): string {
    const m       = msg.toLowerCase();
    const gap     = this.liveGapPct();
    const urgency = this.liveUrgency();
    const actions = this.liveActions();
    const weather = this.liveWeather();
    const focus   = this.liveFocus();

    if (actions.length > 0 && (m.includes('action') || m.includes('quoi') || m.includes('faire'))) {
      const a = actions[0];
      return `Action prioritaire (Agent Stratège): ${a.action}\n\nProduit cible: ${a.produit_cible}\n\nArgument: ${a.argument_vente}\n\nImpact estimé: ${a.impact_estime}`;
    }

    if (m.includes('gap') || m.includes('objectif') || m.includes('retard')) {
      return `Gap actuel: ${gap.toFixed(0)}% — Urgence ${urgency}.\n\nPriorité: ${focus.length ? focus.join(', ') : 'Bundle terminal + forfait'}.\n\nAvance postpayé = 0 DT aujourd'hui → facilite la décision client. Chaque transaction compte.`;
    }

    if (m.includes('météo') || m.includes('pluie') || m.includes('accessoire')) {
      return `Contexte ${weather} — clients captifs en boutique.\n\nPousser: AirPods Pro 3 (279 DT), Apple Watch S10 (449 DT), coques et protections.\n\nArgument: "Avec la météo, votre téléphone a besoin d'être protégé — voici notre offre du moment."`;
    }

    if (m.includes('closing') || m.includes('hésit') || m.includes('convainc')) {
      return `Script closing (historique I63 — réduit temps décision de 12min à 3min):\n\n"Avec l'avance postpayé, vous partez avec le terminal aujourd'hui sans frais supplémentaires. Stock limité cette semaine — c'est le bon moment." → Signature immédiate.`;
    }

    if (m.includes('5g') || m.includes('forfait')) {
      return `Argument 5G Ooredoo: vitesse réelle testée en boutique, couverture Lac 2 confirmée, compatibilité avec tous les terminaux récents.\n\nForfait Flexi 25Go = même prix que 3 recharges mensuelles mais avec data illimitée + appels.`;
    }

    return `Contexte boutique: CA ${this.liveMetrics()?.ca_today?.toFixed(0) ?? 0} / ${this.liveMetrics()?.ca_target ?? 1007} TND | Gap ${gap.toFixed(0)}% | Urgence ${urgency}.\n\n${this.liveSummary() || 'Analyse en cours...'}\n\nAction recommandée: ${actions[0]?.action ?? 'Focus bundle terminal + forfait premium.'}`;
  }

  // ── Supprimer le typing indicator ──────────────────────────────
  private _removeTyping(): void {
    this.conversations.update(convs =>
      convs.map(c =>
        c.id === this.activeConvId()
          ? { ...c, messages: c.messages.filter(m => m.id !== 'typing') }
          : c
      )
    );
  }

  // ── Nouvelle conversation ───────────────────────────────────────
  newConv(): void {
    this.newConvWithMode('general', 'Nouvelle session');
  }

  newConvWithMode(mode: ConvMode, title: string, advisorName?: string): void {
    const id        = 'conv_' + Date.now();
    const modeLabel = this.modeLabels[mode];
    const actions   = this.liveActions();
    const gap       = this.liveGapPct();
    const weather   = this.liveWeather();

    let greet = '';
    if (mode === 'inventory') {
      greet = 'Bonjour ! Je suis votre CoachAgent Inventaire. Stock live, scores de risque et données de réapprovisionnement prêts. Que voulez-vous savoir ?';
    } else if (mode === 'strategy') {
      greet = `Bonjour ${advisorName ?? ''} ! Gap actuel: ${gap.toFixed(0)}%. Météo: ${weather}. ${actions.length ? `Action prioritaire: ${actions[0].action}` : 'Analyse en cours...'}`;
    } else {
      greet = `Bonjour ! Je surveille la boutique Lac 2 en temps réel. Gap: ${gap.toFixed(0)}% | Météo: ${weather}. Comment puis-je vous aider ?`;
    }

    const conv: Conversation = {
      id,
      title,
      mode,
      preview:     greet.slice(0, 60),
      time:        this.now(),
      unread:      0,
      advisorName: advisorName,
      messages: [
        {
          id:   'sys_' + Date.now(),
          role: 'system',
          text: `${modeLabel} session démarrée · ${this.now()}`,
          time: this.now(),
        },
        {
          id:         'greet_' + Date.now(),
          role:       'coach',
          text:       greet,
          time:       this.now(),
          sources:    mode === 'inventory'
            ? ['Agent Inventaire', 'Stock API']
            : ['Agent Analyste', 'Agent Stratège', 'RAG Milvus'],
          confidence: 0.90,
          rag_used:   actions.length > 0,
        },
      ],
    };

    this.conversations.update(list => [conv, ...list]);
    this.activeConvId.set(id);
    // Reset SKU context when starting a fresh inventory conversation
    if (mode === 'inventory') this.currentSkuContext.set(null);
    this.shouldScroll = true;
  }

  newConvForAdvisor(advisorName: string): void {
    this.newConvWithMode('advisor', `Coaching — ${advisorName}`, advisorName);
  }

  selectConv(id: string): void {
    this.activeConvId.set(id);
    this.conversations.update(convs =>
      convs.map(c => (c.id === id ? { ...c, unread: 0 } : c))
    );
    this.shouldScroll = true;
  }

  deleteConv(id: string, e: Event): void {
    e.stopPropagation();
    const convs = this.conversations().filter(c => c.id !== id);
    this.conversations.set(convs);
    if (this.activeConvId() === id && convs.length > 0) {
      this.activeConvId.set(convs[0].id);
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  onInput(e: Event): void {
    this.inputValue.set((e.target as HTMLTextAreaElement).value);
  }

  onSearch(e: Event): void {
    this.searchQuery.set((e.target as HTMLInputElement).value);
  }

  private addMessage(msg: Message): void {
    this.conversations.update(convs =>
      convs.map(c =>
        c.id === this.activeConvId()
          ? {
              ...c,
              messages: [...c.messages, msg],
              preview:  msg.role === 'user' ? msg.text.slice(0, 50) : c.preview,
              time:     msg.time,
            }
          : c
      )
    );
  }

  private now(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  // ── Right panel live metrics ──────────────────────────────────────
  liveCAToday     = computed(() => Math.round(this.liveMetrics()?.ca_today  ?? 1033));
  liveCATarget2   = computed(() => Math.round(this.liveMetrics()?.ca_target ?? 1007));
  liveCAPctChange = computed(() => {
    const ca = this.liveCAToday(), t = this.liveCATarget2();
    return t > 0 ? +((ca - t) / t * 100).toFixed(1) : 0;
  });
  liveObjectiveOk = computed(() => this.liveCAToday() >= this.liveCATarget2());
  dailyObjPct     = computed(() =>
    Math.min(Math.round(this.liveCAToday() / Math.max(this.liveCATarget2(), 1) * 100), 100)
  );
  liveTraffic     = computed(() =>
    this.liveMetrics()?.traffic_per_hour ?? this.liveMetrics()?.traffic ?? 30
  );
  liveCapacityPct = computed(() => this.liveMetrics()?.capacity_pct      ?? 75);
  stockCritique   = computed(() => this.liveMetrics()?.critical_sku_count ?? 2);

  objDonut = computed(() => {
    const R = 28, C = 2 * Math.PI * R;
    const arc = (this.dailyObjPct() / 100) * C;
    return { dashArray: `${arc.toFixed(1)} ${C.toFixed(1)}`, dashOffset: C.toFixed(1) };
  });

  actionCards = computed(() => {
    const suggs  = this.dynamicSuggestions();
    const icons  = ['strategie', 'argument', 'produit', 'closing'];
    const cats   = ['STRATÉGIE', 'ARGUMENT', 'PRODUIT', 'CLOSING'];
    const colors = ['#6C5CE7', '#27AE60', '#2D9CDB', '#F9A825'];
    return suggs.map((s, i) => ({
      ...s,
      icon:  icons[i]  ?? icons[0],
      cat:   cats[i]   ?? s.category.toUpperCase(),
      color: colors[i] ?? s.color,
    }));
  });

  // ── Domain switcher ───────────────────────────────────────────────
  switchDomain(domain: 'sales' | 'stock'): void {
    this.chatDomain.set(domain);
  }

  // ── Conversation rename ───────────────────────────────────────────
  startRename(id: string, currentTitle: string, e: Event): void {
    e.stopPropagation();
    this.editingConvId.set(id);
    this.editingTitle.set(currentTitle);
  }

  saveRename(id: string, e?: Event): void {
    e?.stopPropagation();
    const t = this.editingTitle().trim();
    if (t) {
      this.conversations.update(convs =>
        convs.map(c => c.id === id ? { ...c, title: t } : c)
      );
    }
    this.editingConvId.set(null);
  }

  cancelRename(): void { this.editingConvId.set(null); }

  onRenameKey(e: KeyboardEvent, id: string): void {
    if (e.key === 'Enter')  { e.preventDefault(); this.saveRename(id); }
    if (e.key === 'Escape') { e.stopPropagation(); this.cancelRename(); }
  }
}