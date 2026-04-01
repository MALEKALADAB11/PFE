import { Component, signal, computed, ViewChild,
         ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MockDataService } from '../../core/services/mock-data';
import { Advisor } from '../../core/models/advisor';


type MessageRole = 'user' | 'coach' | 'system';
type ConvMode    = 'general' | 'advisor' | 'inventory' | 'strategy';

interface Message {
  id:        string;
  role:      MessageRole;
  text:      string;
  time:      string;
  typing?:   boolean;
  sources?:  string[];
  confidence?: number;
}

interface Conversation {
  id:       string;
  title:    string;
  mode:     ConvMode;
  preview:  string;
  time:     string;
  unread:   number;
  messages: Message[];
}

interface SuggestedPrompt {
  label:    string;
  text:     string;
  category: string;
  color:    string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat.html',
  styleUrl:    './chat.scss'
})
export class ChatComponent implements AfterViewChecked {

  @ViewChild('msgEnd') msgEnd!: ElementRef;

  advisors      : Advisor[] = [];
  shouldScroll  = false;
  inputValue    = signal('');
  isTyping      = signal(false);
  activeConvId  = signal('c1');
  searchQuery   = signal('');
  showSidebar   = signal(true);

  // ── Conversations ──
  conversations = signal<Conversation[]>([
    {
      id: 'c1', title: 'Session coaching Karim', mode: 'advisor',
      preview: 'Objectif 93% — stratégie pic trafic',
      time: '14:32', unread: 0,
      messages: [
        {
          id: 'm0', role: 'system',
          text: 'Session coaching démarrée · Karim Benali · Lac 2 · 14:09',
          time: '14:09'
        },
        {
          id: 'm1', role: 'coach',
          text: 'Bonjour Karim ! Tu es à 93% de ton objectif avec 3h28 restantes. La pluie crée une opportunité sur les accessoires (+40%). Je surveille la boutique en temps réel. Que veux-tu travailler ?',
          time: '14:09',
          sources: ['POS live', 'Météo API', 'TimesFM'],
          confidence: 0.91
        },
        {
          id: 'm2', role: 'user',
          text: 'Comment profiter de la pluie pour les accessoires ?',
          time: '14:10'
        },
        {
          id: 'm3', role: 'coach',
          text: 'Signal météo actif +40% demande accessoires jusqu\'à 18h. Voici ma stratégie :\n\n1. Repositionner Amine en zone accessoires — il est à 38%, il a besoin de trafic facile.\n2. Mettre AirPods Pro et Apple Watch en vitrine — argument clé : résistance à l\'eau.\n3. Script d\'accroche : "Parfait par ce temps, et résistant à la pluie."\n4. Objectif : 5 ventes accessoires avant 17h = +200 DT CA.',
          time: '14:10',
          sources: ['Météo API', 'Stock API', 'RAG'],
          confidence: 0.88
        },
      ]
    },
    {
      id: 'c2', title: 'Analyse stock critique', mode: 'inventory',
      preview: 'iPhone 16 Pro — 3 unités restantes',
      time: '14:15', unread: 2,
      messages: [
        {
          id: 's1', role: 'system',
          text: 'Session inventaire · Inventory Agent · 14:15',
          time: '14:15'
        },
        {
          id: 's2', role: 'coach',
          text: 'Alerte stock critique détectée : iPhone 16 Pro à 3 unités. Risque rupture 91% d\'ici 24h. Je recommande de commander 15 unités avant vendredi. Veux-tu que je génère le bon de commande ?',
          time: '14:15',
          sources: ['Stock API', 'Forecast Agent', 'Inventory Agent'],
          confidence: 0.91
        },
      ]
    },
    {
      id: 'c3', title: 'Stratégie équipe soir', mode: 'strategy',
      preview: 'Pic trafic 17h–19h · Concert',
      time: '13:50', unread: 0,
      messages: [
        {
          id: 'st1', role: 'system',
          text: 'Session stratégie · Orchestrator · 13:50',
          time: '13:50'
        },
        {
          id: 'st2', role: 'coach',
          text: 'Concert ce soir à 2km. Pic de trafic prévu 17h–19h (+60%). Voici le plan équipe recommandé pour maximiser ce créneau.',
          time: '13:50',
          sources: ['Events API', 'TimesFM', 'Gap Detector'],
          confidence: 0.85
        },
      ]
    },
  ]);

  activeConv = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId())!
  );

  filteredConvs = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.conversations();
    return this.conversations().filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q)
    );
  });

  // ── Suggested prompts ──
  suggestions: SuggestedPrompt[] = [
    { label: 'Script bundle assurance',   text: 'Donne-moi le script bundle assurance + terminal pour Karim.', category: 'Script',    color: '#6C5CE7' },
    { label: 'Argument 5G vs SFR',        text: 'Quels arguments utiliser face à un client qui compare avec SFR 5G ?', category: 'Argument', color: '#00B894' },
    { label: 'Gérer objection prix',      text: 'Comment reformuler le prix de l\'iPhone 16 Pro face à une objection ?', category: 'Objection', color: '#F9A825' },
    { label: 'Stratégie pic 17h',         text: 'Stratégie optimale pour le pic trafic 17h–19h avec mon équipe actuelle ?', category: 'Stratégie', color: '#2D9CDB' },
    { label: 'Upsell accessoires pluie',  text: 'Script upsell accessoires en contexte pluie — que dire exactement ?', category: 'Script',    color: '#00B894' },
    { label: 'Analyser gap Sofia',        text: 'Analyse le gap de performance de Sofia L. et propose un plan d\'action.', category: 'Analyse',   color: '#E74C3C' },
    { label: 'Prévision fin de journée',  text: 'Quelle est la prévision CA fin de journée pour Lac 2 ?', category: 'Forecast',  color: '#6C5CE7' },
    { label: 'Redistribution stock',      text: 'Recommande une redistribution de stock entre boutiques pour l\'Apple Watch S10.', category: 'Stock',     color: '#F9A825' },
  ];

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

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  // ── Send message ──
  send(text?: string) {
    const msg = (text ?? this.inputValue()).trim();
    if (!msg || this.isTyping()) return;

    const userMsg: Message = {
      id:   'u' + Date.now(),
      role: 'user',
      text: msg,
      time: this.now()
    };

    this.addMessage(userMsg);
    this.inputValue.set('');
    this.isTyping.set(true);
    this.shouldScroll = true;

    // Add typing indicator
    const typingMsg: Message = {
      id: 'typing', role: 'coach',
      text: '', time: this.now(), typing: true
    };
    this.addMessage(typingMsg);

    setTimeout(() => {
      // Remove typing indicator
      this.conversations.update(convs =>
        convs.map(c => c.id === this.activeConvId()
          ? { ...c, messages: c.messages.filter(m => m.id !== 'typing') }
          : c
        )
      );

      const reply: Message = {
        id:         'c' + Date.now(),
        role:       'coach',
        text:       this.generateReply(msg),
        time:       this.now(),
        sources:    this.getSources(msg),
        confidence: +(0.78 + Math.random() * 0.19).toFixed(2)
      };

      this.addMessage(reply);
      this.isTyping.set(false);
      this.shouldScroll = true;
    }, 1000 + Math.random() * 600);
  }

  // ── New conversation ──
  newConv() {
    const id = 'conv_' + Date.now();
    const conv: Conversation = {
      id, title: 'Nouvelle session',
      mode: 'general',
      preview: 'Session démarrée',
      time: this.now(), unread: 0,
      messages: [
        {
          id: 'sys_' + Date.now(), role: 'system',
          text: `Nouvelle session démarrée · ${this.now()}`,
          time: this.now()
        },
        {
          id: 'greet_' + Date.now(), role: 'coach',
          text: 'Bonjour ! Je suis votre CoachAgent IA. Je surveille les performances de la boutique, le stock, la météo et les événements en temps réel. Comment puis-je vous aider ?',
          time: this.now(),
          sources: ['Orchestrator', 'Data Agent'],
          confidence: 0.95
        }
      ]
    };
    this.conversations.update(list => [conv, ...list]);
    this.activeConvId.set(id);
    this.shouldScroll = true;
  }

  // ── Select conversation ──
  selectConv(id: string) {
    this.activeConvId.set(id);
    this.conversations.update(convs =>
      convs.map(c => c.id === id ? { ...c, unread: 0 } : c)
    );
    this.shouldScroll = true;
  }

  // ── Delete conversation ──
  deleteConv(id: string, e: Event) {
    e.stopPropagation();
    const convs = this.conversations().filter(c => c.id !== id);
    this.conversations.set(convs);
    if (this.activeConvId() === id && convs.length > 0) {
      this.activeConvId.set(convs[0].id);
    }
  }

  // ── Input handlers ──
  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  onInput(e: Event) {
    this.inputValue.set((e.target as HTMLTextAreaElement).value);
  }

  onSearch(e: Event) {
    this.searchQuery.set((e.target as HTMLInputElement).value);
  }

  // ── Helpers ──
  private addMessage(msg: Message) {
    this.conversations.update(convs =>
      convs.map(c => c.id === this.activeConvId()
        ? {
            ...c,
            messages: [...c.messages, msg],
            preview:  msg.role === 'user' ? msg.text.slice(0, 50) : c.preview,
            time:     msg.time
          }
        : c
      )
    );
  }

  private now(): string {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  private getSources(msg: string): string[] {
    const m = msg.toLowerCase();
    if (m.includes('stock') || m.includes('iphone'))
      return ['Stock API', 'Inventory Agent', 'TimesFM'];
    if (m.includes('météo') || m.includes('pluie') || m.includes('accessoire'))
      return ['Météo API', 'RAG', 'Coaching Agent'];
    if (m.includes('prévision') || m.includes('forecast'))
      return ['TimesFM', 'Gap Detector', 'POS live'];
    if (m.includes('script') || m.includes('argument'))
      return ['RAG', 'Coaching Agent', 'DSPy'];
    return ['Orchestrator', 'Coaching Agent'];
  }

  private generateReply(msg: string): string {
    const m = msg.toLowerCase();

    if (m.includes('assurance'))
      return 'Script bundle assurance :\n\n1. Timing : proposer APRÈS validation de l\'achat terminal.\n2. Phrase clé : "Avec l\'assurance Premium, si vous cassez l\'écran demain, échange sous 48h. C\'est 9 DT/mois — soit un café par semaine."\n3. Levier visuel : montrer le tarif réparation écran = 280 DT sans assurance.\n4. Objectif taux conversion : 70% des ventes terminaux.';

    if (m.includes('5g') || m.includes('sfr'))
      return 'Arguments 5G face à SFR :\n\n1. Couverture réseau : 94% vs 87% pour SFR en Tunisie.\n2. Débit garanti vs partagé — faire tester en boutique.\n3. Compatibilité device : notre catalogue 5G est plus large.\n4. Prix : comparer sur 24 mois, pas le prix facial.\n5. Argument final : "Testez votre réseau SFR ici maintenant" — le test parle de lui-même.';

    if (m.includes('objection') || m.includes('prix'))
      return 'Technique reformulation prix :\n\n1. Ne jamais répéter le prix brut. Décomposer : "1 299 DT = 54 DT/mois sur 24 mois."\n2. Comparaison concrète : "Moins que votre abonnement Netflix + Spotify."\n3. Valeur vs coût : photo pro, durabilité 5 ans, revente valeur résiduelle.\n4. Si blocage persiste : proposer financement 3x sans frais.';

    if (m.includes('pic') || m.includes('trafic') || m.includes('17h'))
      return 'Plan équipe pour pic 17h–19h :\n\n1. Karim → zone terminaux haut de gamme (il est à 93%, il peut closer).\n2. Sara → fibre et offres Pro (clients qui attendent = temps de qualifier).\n3. Amine → accessoires (trafic facile, article rapide à vendre).\n4. Leila → accueil et orientation (réduire temps d\'attente < 3 min).\n5. Préparer 3 iPhones en vitrine dès 16h45.';

    if (m.includes('pluie') || m.includes('accessoire'))
      return 'Stratégie accessoires contexte pluie :\n\n1. Signal actif : +40% demande jusqu\'à 18h.\n2. Produits prioritaires : AirPods Pro 3 (résistant eau), Apple Watch S10 (étanche 50m), coques.\n3. Argument d\'accroche universel : "Parfait par ce temps, et certifié résistant à l\'eau."\n4. Repositionner Amine sur cette zone immédiatement.\n5. Objectif : 5 ventes accessoires avant 17h.';

    if (m.includes('sofia') || m.includes('gap'))
      return 'Analyse gap Sofia L. :\n\nGap actuel : 60% — objectif 40% atteinte. Causes identifiées :\n1. Contexte pluie = moins de passage spontané sur sa zone fibre.\n2. Conversion 38% vs moy. 52% — problème de closing, pas de volume.\n\nPlan d\'action :\n1. Shift temporaire vers accessoires (trafic plus facile).\n2. Pairer avec Karim pour observer une démonstration closing.\n3. Focus closing : poser la question de décision directement.';

    if (m.includes('prévision') || m.includes('forecast') || m.includes('eod'))
      return 'Prévision fin de journée Lac 2 :\n\nTimesFM · MAPE 14.3% · IC 80%\n\n• Prévision EOD : 6 800 DT [5 400 – 8 200]\n• Objectif : 8 000 DT\n• Gap restant : ~1 200 DT en 3h28\n• Scénario optimiste (pic 17h) : 7 400 DT\n• Levier principal : accessoires pluie + pic concert soir.';

    if (m.includes('redistribution') || m.includes('apple watch'))
      return 'Redistribution Apple Watch S10 :\n\nBTQ-14 (ici) : 2 unités · stock critique\nBTQ-08 (Menzah) : 12 unités · surstock\n\nRecommandation Inventory Agent :\nTransfert de 6 unités BTQ-08 → BTQ-14\nDélai livraison interne : 4h\nConfiance : 0.84\n\nAction requise : valider le bon de transfert dans le système logistique.';

    return `Analyse en cours pour : "${msg.slice(0, 60)}..."\n\nJe croise les données POS live, météo, stock et prévisions TimesFM. Voici ce que je détecte : la boutique est à 53% de l\'objectif journalier avec un pic de trafic prévu dans 3h. Veux-tu que j\'affine cette analyse sur un conseiller ou un produit spécifique ?`;
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}