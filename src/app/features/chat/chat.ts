import {
  Component,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Advisor } from '../../core/models/advisor';
import { MockDataService } from '../../core/services/mock-data';

type MessageRole = 'user' | 'coach' | 'system';
type ConvMode = 'general' | 'advisor' | 'inventory' | 'strategy';

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  time: string;
  typing?: boolean;
  sources?: string[];
  confidence?: number;
}

interface Conversation {
  id: string;
  title: string;
  mode: ConvMode;
  preview: string;
  time: string;
  unread: number;
  messages: Message[];
}

interface SuggestedPrompt {
  label: string;
  text: string;
  category: string;
  color: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('msgEnd') msgEnd!: ElementRef;

  advisors: Advisor[] = [];
  shouldScroll = false;

  inputValue = signal('');
  isTyping = signal(false);
  activeConvId = signal('c1');
  searchQuery = signal('');
  showSidebar = signal(true);
  prefillMeta = signal<{ sku?: string; name?: string; mode?: string } | null>(null);

  conversations = signal<Conversation[]>([
    {
      id: 'c1',
      title: 'Karim coaching session',
      mode: 'advisor',
      preview: '93% target — peak traffic strategy',
      time: '2:32 PM',
      unread: 0,
      messages: [
        {
          id: 'm0',
          role: 'system',
          text: 'Coaching session started · Karim Benali · Lac 2 · 2:09 PM',
          time: '2:09 PM'
        },
        {
          id: 'm1',
          role: 'coach',
          text: 'Hi Karim! You are at 93% of your daily target with 3h28 remaining. The rain creates an opportunity for accessories (+40%). I am monitoring the store in real time. What do you want to work on?',
          time: '2:09 PM',
          sources: ['POS live', 'Weather API', 'TimesFM'],
          confidence: 0.91
        }
      ]
    },
    {
      id: 'c2',
      title: 'Critical stock analysis',
      mode: 'inventory',
      preview: 'iPhone 16 Pro — 3 units remaining',
      time: '2:15 PM',
      unread: 2,
      messages: [
        {
          id: 's1',
          role: 'system',
          text: 'Inventory session · Inventory Agent · 2:15 PM',
          time: '2:15 PM'
        },
        {
          id: 's2',
          role: 'coach',
          text: 'Critical stock alert detected: iPhone 16 Pro at 3 units. 91% stockout risk within 24h. I recommend ordering 15 units before Friday.',
          time: '2:15 PM',
          sources: ['Stock API', 'Forecast Agent', 'Inventory Agent'],
          confidence: 0.91
        }
      ]
    }
  ]);

  activeConv = computed(() =>
    this.conversations().find(c => c.id === this.activeConvId()) ?? this.conversations()[0]
  );

  filteredConvs = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.conversations();

    return this.conversations().filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.preview.toLowerCase().includes(q)
    );
  });

  suggestions: SuggestedPrompt[] = [
    {
      label: 'Insurance bundle script',
      text: 'Give me the insurance + device bundle script for Karim.',
      category: 'Script',
      color: '#6C5CE7'
    },
    {
      label: '5G argument vs competitors',
      text: 'What arguments to use against a customer comparing with competitors on 5G?',
      category: 'Argument',
      color: '#00B894'
    },
    {
      label: 'Handle price objection',
      text: 'How to reframe the iPhone 16 Pro price when a customer objects?',
      category: 'Objection',
      color: '#F9A825'
    },
    {
      label: 'Stock redistribution',
      text: 'Recommend a stock redistribution between stores for Apple Watch S10.',
      category: 'Stock',
      color: '#F9A825'
    }
  ];

  modeColors: Record<ConvMode, string> = {
    general: '#6C5CE7',
    advisor: '#00B894',
    inventory: '#E74C3C',
    strategy: '#F9A825'
  };

  modeLabels: Record<ConvMode, string> = {
    general: 'General',
    advisor: 'Advisor',
    inventory: 'Inventory',
    strategy: 'Strategy'
  };

  constructor(private data: MockDataService) {
    this.advisors = this.data.getAdvisors();
  }

  ngOnInit(): void {
    try {
      const raw = sessionStorage.getItem('chat_prefill');

      if (!raw) return;

      sessionStorage.removeItem('chat_prefill');

      const parsed = JSON.parse(raw);
      const text = parsed.text ?? '';

      this.inputValue.set(text);

      this.prefillMeta.set({
        sku: parsed.sku,
        name: parsed.name,
        mode: parsed.mode
      });

      if (parsed.mode === 'inventory') {
        const existing = this.conversations().find(c => c.mode === 'inventory');

        if (existing) {
          this.selectConv(existing.id);
        } else {
          this.newConvWithMode('inventory', parsed.name ?? 'Stock alert');
        }
      }

      this.shouldScroll = true;
    } catch {
      // ignore sessionStorage errors
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.msgEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
      this.shouldScroll = false;
    }
  }

  send(text?: string): void {
    const msg = (text ?? this.inputValue()).trim();

    if (!msg || this.isTyping()) return;

    this.addMessage({
      id: 'u' + Date.now(),
      role: 'user',
      text: msg,
      time: this.now()
    });

    this.inputValue.set('');
    this.isTyping.set(true);
    this.shouldScroll = true;

    this.addMessage({
      id: 'typing',
      role: 'coach',
      text: '',
      time: this.now(),
      typing: true
    });

    setTimeout(() => {
      this.conversations.update(convs =>
        convs.map(c =>
          c.id === this.activeConvId()
            ? { ...c, messages: c.messages.filter(m => m.id !== 'typing') }
            : c
        )
      );

      this.addMessage({
        id: 'c' + Date.now(),
        role: 'coach',
        text: this.generateReply(msg),
        time: this.now(),
        sources: this.getSources(msg),
        confidence: +(0.78 + Math.random() * 0.19).toFixed(2)
      });

      this.isTyping.set(false);
      this.shouldScroll = true;
    }, 1000);
  }

  newConv(): void {
    this.newConvWithMode('general', 'New session');
  }

  newConvWithMode(mode: ConvMode, title: string): void {
    const id = 'conv_' + Date.now();
    const modeLabel = this.modeLabels[mode];

    const conv: Conversation = {
      id,
      title,
      mode,
      preview: 'Session started',
      time: this.now(),
      unread: 0,
      messages: [
        {
          id: 'sys_' + Date.now(),
          role: 'system',
          text: `${modeLabel} session started · ${this.now()}`,
          time: this.now()
        },
        {
          id: 'greet_' + Date.now(),
          role: 'coach',
          text: mode === 'inventory'
            ? 'Hello! I am your Inventory CoachAgent. I have live stock levels, risk scores, and replenishment data ready. What would you like to know?'
            : 'Hello! I am your AI CoachAgent. I am monitoring store performance, stock levels, weather signals, and local events in real time. How can I help you?',
          time: this.now(),
          sources: mode === 'inventory'
            ? ['Inventory Agent', 'Stock API']
            : ['Orchestrator', 'Data Agent'],
          confidence: 0.95
        }
      ]
    };

    this.conversations.update(list => [conv, ...list]);
    this.activeConvId.set(id);
    this.shouldScroll = true;
  }

  selectConv(id: string): void {
    this.activeConvId.set(id);

    this.conversations.update(convs =>
      convs.map(c => c.id === id ? { ...c, unread: 0 } : c)
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
              preview: msg.role === 'user' ? msg.text.slice(0, 50) : c.preview,
              time: msg.time
            }
          : c
      )
    );
  }

  private now(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private getSources(msg: string): string[] {
    const m = msg.toLowerCase();

    if (m.includes('stock') || m.includes('iphone')) {
      return ['Stock API', 'Inventory Agent', 'TimesFM'];
    }

    if (m.includes('weather') || m.includes('rain') || m.includes('accessor')) {
      return ['Weather API', 'RAG', 'Coaching Agent'];
    }

    if (m.includes('forecast') || m.includes('eod')) {
      return ['TimesFM', 'Gap Detector', 'POS live'];
    }

    if (m.includes('script') || m.includes('argument') || m.includes('objection')) {
      return ['RAG', 'Coaching Agent', 'DSPy'];
    }

    return ['Orchestrator', 'Coaching Agent'];
  }

  private generateReply(msg: string): string {
    const m = msg.toLowerCase();

    if (m.includes('stock') || m.includes('iphone')) {
      return 'Inventory analysis: stock risk is high. Recommended action: validate replenishment, check nearby stores, and avoid pushing unavailable products in the sales flow.';
    }

    if (m.includes('rain') || m.includes('accessor')) {
      return 'Rain context detected. Recommended strategy: push accessories, waterproof devices, cases, and quick add-ons near the checkout zone.';
    }

    if (m.includes('forecast') || m.includes('eod')) {
      return 'EOD forecast: current trend indicates a possible revenue gap. Main levers: accessories, premium bundles, and advisor reallocation during peak traffic.';
    }

    if (m.includes('5g')) {
      return '5G argument: focus on speed, coverage, device compatibility, and real in-store network testing.';
    }

    return `Analyzing your request: "${msg.slice(0, 60)}..."\n\nI am cross-referencing sales, stock, advisor performance, and forecast signals.`;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}