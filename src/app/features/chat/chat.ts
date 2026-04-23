import { Component, signal, computed, ViewChild,
         ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Advisor } from '../../core/models/advisor';
import { MockDataService } from '../../core/services/mock-data';

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
  selector:    'app-chat',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './chat.html',
  styleUrl:    './chat.scss'
})
export class ChatComponent implements AfterViewChecked {

  @ViewChild('msgEnd') msgEnd!: ElementRef;

  advisors:    Advisor[] = [];
  shouldScroll = false;
  inputValue   = signal('');
  isTyping     = signal(false);
  activeConvId = signal('c1');
  searchQuery  = signal('');
  showSidebar  = signal(true);

  // ── Conversations ──
  conversations = signal<Conversation[]>([
    {
      id: 'c1', title: 'Karim coaching session',
      mode: 'advisor',
      preview: '93% target — peak traffic strategy',
      time: '2:32 PM', unread: 0,
      messages: [
        {
          id: 'm0', role: 'system',
          text: 'Coaching session started · Karim Benali · Lac 2 · 2:09 PM',
          time: '2:09 PM'
        },
        {
          id: 'm1', role: 'coach',
          text: 'Hi Karim! You are at 93% of your daily target with 3h28 remaining. The rain creates an opportunity for accessories (+40%). I\'m monitoring the store in real time. What do you want to work on?',
          time: '2:09 PM',
          sources: ['POS live', 'Weather API', 'TimesFM'],
          confidence: 0.91
        },
        {
          id: 'm2', role: 'user',
          text: 'How can I take advantage of the rain for accessories?',
          time: '2:10 PM'
        },
        {
          id: 'm3', role: 'coach',
          text: 'Rain signal active — +40% accessory demand until 6 PM. Here\'s my strategy:\n\n1. Move Amine to the accessories zone — he\'s at 38% and needs easy traffic.\n2. Place AirPods Pro and Apple Watch in the display window — key pitch: water resistance.\n3. Hook script: "Perfect in this weather, and certified water resistant."\n4. Target: 5 accessory sales before 5 PM = +200 DT revenue.',
          time: '2:10 PM',
          sources: ['Weather API', 'Stock API', 'RAG'],
          confidence: 0.88
        },
      ]
    },
    {
      id: 'c2', title: 'Critical stock analysis',
      mode: 'inventory',
      preview: 'iPhone 16 Pro — 3 units remaining',
      time: '2:15 PM', unread: 2,
      messages: [
        {
          id: 's1', role: 'system',
          text: 'Inventory session · Inventory Agent · 2:15 PM',
          time: '2:15 PM'
        },
        {
          id: 's2', role: 'coach',
          text: 'Critical stock alert detected: iPhone 16 Pro at 3 units. 91% stockout risk within 24h. I recommend ordering 15 units before Friday. Should I generate the purchase order?',
          time: '2:15 PM',
          sources: ['Stock API', 'Forecast Agent', 'Inventory Agent'],
          confidence: 0.91
        },
      ]
    },
    {
      id: 'c3', title: 'Evening team strategy',
      mode: 'strategy',
      preview: 'Peak traffic 5–7 PM · Concert',
      time: '1:50 PM', unread: 0,
      messages: [
        {
          id: 'st1', role: 'system',
          text: 'Strategy session · Orchestrator · 1:50 PM',
          time: '1:50 PM'
        },
        {
          id: 'st2', role: 'coach',
          text: 'Concert tonight 2km away. Peak traffic expected 5–7 PM (+60%). Here is the recommended team plan to maximize this window.',
          time: '1:50 PM',
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
    {
      label: 'Insurance bundle script',
      text:  'Give me the insurance + device bundle script for Karim.',
      category: 'Script', color: '#6C5CE7'
    },
    {
      label: '5G argument vs competitors',
      text:  'What arguments to use against a customer comparing with competitors on 5G?',
      category: 'Argument', color: '#00B894'
    },
    {
      label: 'Handle price objection',
      text:  'How to reframe the iPhone 16 Pro price when a customer objects?',
      category: 'Objection', color: '#F9A825'
    },
    {
      label: '5 PM peak strategy',
      text:  'Optimal strategy for the 5–7 PM traffic peak with my current team?',
      category: 'Strategy', color: '#2D9CDB'
    },
    {
      label: 'Accessory upsell — rain',
      text:  'Accessory upsell script in rain context — what exactly should I say?',
      category: 'Script', color: '#00B894'
    },
    {
      label: 'Analyze Sofia\'s gap',
      text:  'Analyze Sofia L.\'s performance gap and propose an action plan.',
      category: 'Analysis', color: '#E74C3C'
    },
    {
      label: 'End of day forecast',
      text:  'What is the EOD revenue forecast for Lac 2?',
      category: 'Forecast', color: '#6C5CE7'
    },
    {
      label: 'Stock redistribution',
      text:  'Recommend a stock redistribution between stores for Apple Watch S10.',
      category: 'Stock', color: '#F9A825'
    },
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

    this.addMessage({
      id: 'u' + Date.now(), role: 'user',
      text: msg, time: this.now()
    });

    this.inputValue.set('');
    this.isTyping.set(true);
    this.shouldScroll = true;

    this.addMessage({
      id: 'typing', role: 'coach',
      text: '', time: this.now(), typing: true
    });

    setTimeout(() => {
      this.conversations.update(convs =>
        convs.map(c => c.id === this.activeConvId()
          ? { ...c, messages: c.messages.filter(m => m.id !== 'typing') }
          : c
        )
      );
      this.addMessage({
        id:         'c' + Date.now(),
        role:       'coach',
        text:       this.generateReply(msg),
        time:       this.now(),
        sources:    this.getSources(msg),
        confidence: +(0.78 + Math.random() * 0.19).toFixed(2)
      });
      this.isTyping.set(false);
      this.shouldScroll = true;
    }, 1000 + Math.random() * 600);
  }

  // ── New conversation ──
  newConv() {
    const id = 'conv_' + Date.now();
    const conv: Conversation = {
      id,
      title:   'New session',
      mode:    'general',
      preview: 'Session started',
      time:    this.now(),
      unread:  0,
      messages: [
        {
          id:   'sys_' + Date.now(), role: 'system',
          text: `New session started · ${this.now()}`,
          time: this.now()
        },
        {
          id:   'greet_' + Date.now(), role: 'coach',
          text: 'Hello! I\'m your AI CoachAgent. I\'m monitoring store performance, stock levels, weather signals, and local events in real time. How can I help you?',
          time: this.now(),
          sources:    ['Orchestrator', 'Data Agent'],
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
    if (m.includes('weather') || m.includes('rain') || m.includes('accessor'))
      return ['Weather API', 'RAG', 'Coaching Agent'];
    if (m.includes('forecast') || m.includes('eod'))
      return ['TimesFM', 'Gap Detector', 'POS live'];
    if (m.includes('script') || m.includes('argument') || m.includes('objection'))
      return ['RAG', 'Coaching Agent', 'DSPy'];
    return ['Orchestrator', 'Coaching Agent'];
  }

  private generateReply(msg: string): string {
    const m = msg.toLowerCase();

    if (m.includes('insurance'))
      return 'Insurance bundle script:\n\n1. Timing: offer AFTER device purchase is confirmed.\n2. Key phrase: "With Premium Insurance, if you break the screen tomorrow, replacement in 48h. It\'s 9 DT/month — a coffee per week."\n3. Visual lever: show screen repair cost = 280 DT without insurance.\n4. Target conversion rate: 70% of device sales.';

    if (m.includes('5g') || m.includes('competitor'))
      return '5G arguments vs competitors:\n\n1. Network coverage: 94% vs 87% for competitors.\n2. Guaranteed speed vs shared bandwidth — let them test in store.\n3. Wider 5G device catalog.\n4. Price: compare over 24 months, not the upfront price.\n5. Final argument: "Test your current network here right now" — the result speaks for itself.';

    if (m.includes('objection') || m.includes('price'))
      return 'Price reframing technique:\n\n1. Never repeat the full price. Break it down: "1,299 DT = 54 DT/month over 24 months."\n2. Concrete comparison: "Less than your Netflix + Spotify subscription."\n3. Value vs cost: pro camera, 5-year durability, trade-in value.\n4. If still blocked: offer 3x installments with no fees.';

    if (m.includes('peak') || m.includes('traffic') || m.includes('5 pm') || m.includes('5pm'))
      return 'Team plan for the 5–7 PM peak:\n\n1. Karim → premium handsets (93%, he can close deals).\n2. Sara → fiber and Pro offers (waiting clients = time to qualify).\n3. Amine → accessories (easy traffic, fast to sell).\n4. Leila → welcome and orientation (reduce wait time < 3 min).\n5. Prepare 3 iPhones in the display window by 4:45 PM.';

    if (m.includes('rain') || m.includes('accessor'))
      return 'Accessories strategy — rain context:\n\n1. Active signal: +40% demand until 6 PM.\n2. Priority products: AirPods Pro 3 (water resistant), Apple Watch S10 (waterproof 50m), protective cases.\n3. Universal hook: "Perfect in this weather, and certified water resistant."\n4. Move Amine to the accessories zone immediately.\n5. Target: 5 accessory sales before 5 PM.';

    if (m.includes('sofia') || m.includes('gap'))
      return 'Sofia L. gap analysis:\n\nCurrent gap: 60% — only 40% of target reached. Root causes:\n1. Rain context = less spontaneous foot traffic in her fiber zone.\n2. 38% conversion rate vs 52% average — closing problem, not volume.\n\nAction plan:\n1. Temporary shift to accessories (easier traffic).\n2. Pair with Karim to observe a closing demo.\n3. Closing focus: ask the decision question directly.';

    if (m.includes('forecast') || m.includes('eod'))
      return 'EOD forecast — Lac 2:\n\nTimesFM · MAPE 14.3% · 80% CI\n\n• EOD forecast: 6,800 DT [5,400 – 8,200]\n• Target: 8,000 DT\n• Remaining gap: ~1,200 DT in 3h28\n• Optimistic scenario (5 PM peak): 7,400 DT\n• Main lever: accessories rain signal + concert evening peak.';

    if (m.includes('redistribution') || m.includes('apple watch'))
      return 'Apple Watch S10 redistribution:\n\nBTQ-14 (here): 2 units · critical stock\nBTQ-08 (Menzah): 12 units · overstock\n\nInventory Agent recommendation:\nTransfer 6 units BTQ-08 → BTQ-14\nInternal delivery lead time: 4h\nConfidence: 0.84\n\nRequired action: validate the transfer order in the logistics system.';

    return `Analyzing your request: "${msg.slice(0, 60)}..."\n\nI\'m cross-referencing live POS data, weather signals, stock levels, and TimesFM forecasts. The store is at 53% of daily target with a traffic peak expected in 3h. Want me to drill down on a specific advisor or product?`;
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}