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
      id: 'c1', title: 'Coaching session - Karim', mode: 'advisor',
      preview: 'Target 93% — peak traffic strategy',
      time: '14:32', unread: 0,
      messages: [
        {
          id: 'm0', role: 'system',
          text: 'Coaching session started · Karim Benali · Lac 2 · 14:09',
          time: '14:09'
        },
        {
          id: 'm1', role: 'coach',
          text: 'Hello Karim! You are at 93% of your target with 3h28 remaining. Rain creates an opportunity on accessories (+40%). I am monitoring the store in real time. What would you like to work on?',
          time: '14:09',
          sources: ['POS live', 'Météo API', 'TimesFM'],
          confidence: 0.91
        },
        {
          id: 'm2', role: 'user',
          text: 'How to take advantage of the rain for accessories?',
          time: '14:10'
        },
        {
          id: 'm3', role: 'coach',
          text: 'Active weather signal +40% accessory demand until 18h. Here is my strategy:\n\n1. Reposition Amine in the accessories zone — he is at 38%, he needs easy traffic.\n2. Display AirPods Pro and Apple Watch — key argument: water resistance.\n3. Opening script: "Perfect for this weather, and rain resistant."\n4. Target: 5 accessory sales before 17h = +200 DT revenue.',
          time: '14:10',
          sources: ['Météo API', 'Stock API', 'RAG'],
          confidence: 0.88
        },
      ]
    },
    {
      id: 'c2', title: 'Critical stock analysis', mode: 'inventory',
      preview: 'iPhone 16 Pro — 3 unités restantes',
      time: '14:15', unread: 2,
      messages: [
        {
          id: 's1', role: 'system',
          text: 'Inventory session · Inventory Agent · 14:15',
          time: '14:15'
        },
        {
          id: 's2', role: 'coach',
          text: 'Critical stock alert detected: iPhone 16 Pro at 3 units. 91% stockout risk within 24h. I recommend ordering 15 units before Friday. Would you like me to generate the purchase order?',
          time: '14:15',
          sources: ['Stock API', 'Forecast Agent', 'Inventory Agent'],
          confidence: 0.91
        },
      ]
    },
    {
      id: 'c3', title: 'Evening team strategy', mode: 'strategy',
      preview: 'Traffic peak 17h-19h · Concert',
      time: '13:50', unread: 0,
      messages: [
        {
          id: 'st1', role: 'system',
          text: 'Strategy session · Orchestrator · 13:50',
          time: '13:50'
        },
        {
          id: 'st2', role: 'coach',
          text: 'Concert tonight at 2km. Traffic peak expected 17h-19h (+60%). Here is the recommended team plan to maximize this time slot.',
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
    { label: 'Insurance bundle script',   text: 'Give me the insurance bundle + terminal script for Karim.', category: 'Script',    color: '#6C5CE7' },
    { label: '5G argument vs SFR',        text: 'What arguments to use against a customer comparing with SFR 5G?', category: 'Argument', color: '#00B894' },
    { label: 'Handle price objection',      text: 'Comment reformuler le prix de l\'iPhone 16 Pro face à une objection ?', category: 'Objection', color: '#F9A825' },
    { label: 'Peak traffic strategy 17h',         text: 'Optimal strategy for the 17h-19h traffic peak with my current team?', category: 'Strategy', color: '#2D9CDB' },
    { label: 'Rain accessories upsell',  text: 'Accessories upsell script in rain context — what exactly to say?', category: 'Script',    color: '#00B894' },
    { label: 'Analyze Sofia gap',        text: 'Analyse le gap de performance de Sofia L. et propose un plan d\'action.', category: 'Analysis',   color: '#E74C3C' },
    { label: 'End of day forecast',  text: 'What is the end-of-day revenue forecast for Lac 2?', category: 'Forecast',  color: '#6C5CE7' },
    { label: 'Stock redistribution',      text: 'Recommend a stock redistribution between stores for the Apple Watch S10.', category: 'Stock',     color: '#F9A825' },
  ];

  modeColors: Record<ConvMode, string> = {
    general:   '#6C5CE7',
    advisor:   '#00B894',
    inventory: '#E74C3C',
    strategy:  '#F9A825',
  };

  modeLabels: Record<ConvMode, string> = {
    general:   'General',
    advisor:   'Advisor',
    inventory: 'Inventory',
    strategy:  'Strategy',
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
      id, title: 'New session',
      mode: 'general',
      preview: 'Session started',
      time: this.now(), unread: 0,
      messages: [
        {
          id: 'sys_' + Date.now(), role: 'system',
          text: `New session started · ${this.now()}`,
          time: this.now()
        },
        {
          id: 'greet_' + Date.now(), role: 'coach',
          text: 'Hello! I am your CoachAgent AI. I monitor store performance, stock, weather and events in real time. How can I help you?',
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
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  private getSources(msg: string): string[] {
    const m = msg.toLowerCase();
    if (m.includes('stock') || m.includes('iphone'))
      return ['Stock API', 'Inventory Agent', 'TimesFM'];
    if (m.includes('weather') || m.includes('rain') || m.includes('accessory'))
      return ['Météo API', 'RAG', 'Coaching Agent'];
    if (m.includes('forecast') || m.includes('prévision'))
      return ['TimesFM', 'Gap Detector', 'POS live'];
    if (m.includes('script') || m.includes('argument'))
      return ['RAG', 'Coaching Agent', 'DSPy'];
    return ['Orchestrator', 'Coaching Agent'];
  }

  private generateReply(msg: string): string {
    const m = msg.toLowerCase();

    if (m.includes('assurance'))
      return 'Insurance bundle script:\n\n1. Timing: offer AFTER terminal purchase is confirmed.\n2. Key phrase: "With Premium insurance, if you break the screen tomorrow, replacement within 48h. That is 9 DT/month — the price of a coffee per week."\n3. Visual lever: show screen repair cost = 280 DT without insurance.\n4. Target conversion rate: 70% of terminal sales.';

    if (m.includes('5g') || m.includes('sfr'))
      return '5G arguments against SFR:\n\n1. Network coverage: 94% vs 87% for SFR in Tunisia.\n2. Guaranteed vs shared speed — let them test it in the store.\n3. Device compatibility: our 5G catalog is wider.\n4. Price: compare over 24 months, not the sticker price.\n5. Final argument: "Test your SFR network here now" — the test speaks for itself.';

    if (m.includes('objection') || m.includes('prix'))
      return 'Price reframing technique:\n\n1. Never repeat the gross price. Break it down: "1,299 DT = 54 DT/month over 24 months."\n2. Concrete comparison: "Less than your Netflix + Spotify subscription."\n3. Value vs cost: pro camera, 5-year durability, residual resale value.\n4. If objection persists: offer 3x interest-free financing.';

    if (m.includes('pic') || m.includes('trafic') || m.includes('17h'))
      return 'Team plan for 17h-19h peak:\n\n1. Karim → premium terminal zone (he is at 93%, he can close).\n2. Sara → fiber and Pro offers (waiting customers = time to qualify).\n3. Amine → accessories (easy traffic, fast-selling item).\n4. Leila → welcome and guidance (reduce wait time < 3 min).\n5. Set up 3 iPhones in the display by 16h45.';

    if (m.includes('rain') || m.includes('accessory') || m.includes('pluie') || m.includes('accessoire'))
      return 'Accessories strategy in rain context:\n\n1. Active signal: +40% demand until 18h.\n2. Priority products: AirPods Pro 3 (water resistant), Apple Watch S10 (waterproof 50m), cases.\n3. Universal opening argument: "Perfect for this weather, and certified water resistant."\n4. Reposition Amine in this zone immediately.\n5. Target: 5 accessory sales before 17h.';

    if (m.includes('sofia') || m.includes('gap'))
      return 'Sofia L. gap analysis:\n\nCurrent gap: 60% — 40% target attainment. Identified causes:\n1. Rain context = less spontaneous traffic in her fiber zone.\n2. Conversion 38% vs avg. 52% — closing issue, not volume.\n\nAction plan:\n1. Temporary shift to accessories (easier traffic).\n2. Pair with Karim to observe a closing demonstration.\n3. Focus on closing: ask the decision question directly.';

    if (m.includes('prévision') || m.includes('forecast') || m.includes('eod'))
      return 'End of day forecast Lac 2:\n\nTimesFM · MAPE 14.3% · CI 80%\n\n• EOD Forecast: 6,800 DT [5,400 - 8,200]\n• Target: 8,000 DT\n• Remaining gap: ~1,200 DT in 3h28\n• Optimistic scenario (17h peak): 7,400 DT\n• Key lever: rain accessories + evening concert peak.';

    if (m.includes('redistribution') || m.includes('apple watch'))
      return 'Apple Watch S10 redistribution:\n\nBTQ-14 (here): 2 units · critical stock\nBTQ-08 (Menzah): 12 units · overstock\n\nInventory Agent recommendation:\nTransfer of 6 units BTQ-08 → BTQ-14\nInternal delivery delay: 4h\nConfidence: 0.84\n\nRequired action: validate the transfer order in the logistics system.';

    return `Analysis in progress for: "${msg.slice(0, 60)}..."\n\nI am cross-referencing live POS data, weather, stock and TimesFM forecasts. Here is what I detect: the store is at 53% of the daily target with a traffic peak expected in 3h. Would you like me to refine this analysis for a specific advisor or product?`;
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}