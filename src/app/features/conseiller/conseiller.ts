import { Component, computed, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Advisor } from '../../core/models/advisor';
import { MockDataService } from '../../core/services/mock-data';


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
export class ConseillerComponent implements AfterViewChecked {

  @ViewChild('chatBottom') chatBottom!: ElementRef;

  advisors       = signal<Advisor[]>([]);
  selectedId     = signal<string>('kb');
  chatOpen       = signal<boolean>(true);
  chatTab        = signal<'coach' | 'alertes'>('coach');
  flippedProduct = signal<string | null>(null);
  chatInput      = signal<string>('');
  shouldScroll   = false;

  selected = computed(() =>
    this.advisors().find(a => a.id === this.selectedId())!
  );

  perfColor = computed(() => {
    const p = this.selected()?.performance ?? 0;
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  });

  caPercent = computed(() => {
    const s = this.selected();
    if (!s) return 0;
    return Math.round((s.caRealized / s.caObjectif) * 100);
  });

  // ── Alerts ──
  alerts = signal<Alert[]>([
    {
      id: 'a1',
      label:  'Critical stock — iPhone 16 Pro',
      detail: '3 units remaining · 91% stockout risk',
      color:  '#E74C3C', bg: '#FDEDEC',
      chatMessage: 'iPhone 16 Pro stock is critical (3 units left). How should I handle interested customers?'
    },
    {
      id: 'a2',
      label:  'Peak traffic expected 5–7 PM',
      detail: 'Concert tonight 2km away · +60% visitors expected',
      color:  '#F9A825', bg: '#FFF8E1',
      chatMessage: 'Strategy for the 5 PM traffic peak? Concert tonight — how should I prepare my team?'
    },
    {
      id: 'a3',
      label:  'Rain drives +40% accessory demand',
      detail: 'Weather signal active until 6:00 PM',
      color:  '#2D9CDB', bg: '#E8F4FD',
      chatMessage: 'How can I leverage the rain signal to boost accessory sales?'
    },
  ]);

  // ── Quick prompts ──
  quickPrompts = [
    'Insurance bundle script?',
    '5G argument vs competitors?',
    'How to handle price objection?',
    'Strategy for 5 PM peak traffic?',
    'Accessory upsell — rain context?',
    'How to reach 2,000 DT target?',
  ];

  // ── Chat messages ──
  messages = signal<ChatMessage[]>([
    {
      id:   'm0',
      role: 'coach',
      text: `Hi Karim! You are at 93% of your daily target with 3h28 remaining. The rain creates an opportunity for accessories (+40%). I'm monitoring the store in real time. What do you want to work on?`,
      time: '10:09 AM'
    }
  ]);

  // ── Products ──
  products: Product[] = [
    {
      id: 'p1', name: 'iPhone 16 Pro', category: 'SMARTPHONE',
      price: '1,299', unit: 'DT',
      margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#6C5CE7',
      script: 'iPhone 16 Pro Sales Script',
      scriptLines: [
        'Open with the need: "What do you mainly use your phone for?"',
        'Highlight the A18 Pro chip — show the real difference in photos and video.',
        'Bundle: iPhone 16 Pro + case + AppleCare+ = +340 DT average basket.',
        'Price objection: "Over 24 months it\'s 54 DT/month — less than a streaming subscription."',
        'Create urgency: "We only have 3 units left — I can\'t guarantee stock tomorrow."',
      ]
    },
    {
      id: 'p2', name: 'Fiber 2G Pro', category: 'INTERNET',
      price: '49', unit: 'DT/mo',
      margin: 'Medium', marginColor: '#F9A825',
      hot: true, accentColor: '#00B894',
      script: 'Fiber Pro Sales Script',
      scriptLines: [
        'Qualify: "How many people at home use the internet simultaneously?"',
        'Differentiation: 2Gb symmetric = fast upload, ideal for remote work and gaming.',
        'Bundle fiber + 4K TV decoder = +15 DT but 60% better retention.',
        'Current provider objection: ask when their contract ends.',
        'If contract ends < 3 months: offer pre-subscription with deferred activation.',
      ]
    },
    {
      id: 'p3', name: 'Premium Insurance', category: 'SERVICE',
      price: '9', unit: 'DT/mo',
      margin: 'High', marginColor: '#00B894',
      hot: false, accentColor: '#E74C3C',
      script: 'Premium Insurance Script',
      scriptLines: [
        'Best timing: offer AFTER the device purchase is confirmed.',
        '"With Premium Insurance, if you break the screen tomorrow, replacement in 48h."',
        'Reframe: "It\'s 9 DT/month — the price of a coffee per week."',
        'Psychological lever: show screen repair cost = 280 DT without insurance.',
        'Target conversion rate: 70% of device sales.',
      ]
    },
    {
      id: 'p4', name: 'Apple Watch S10', category: 'ACCESSORY',
      price: '449', unit: 'DT',
      margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#F9A825',
      script: 'Apple Watch S10 Script',
      scriptLines: [
        'Target iPhone buyers: "You have an iPhone? The Watch pairs perfectly."',
        'Demo in store: show notifications, live health tracking in real time.',
        'Rain opportunity: "The Watch is waterproof to 50m — perfect in this weather."',
        'Bundle: Watch + extra sport band + AppleCare = +80 DT margin.',
        'Financing: offer 3x installments if hesitation on price.',
      ]
    },
    {
      id: 'p5', name: 'AirPods Pro 3', category: 'ACCESSORY',
      price: '279', unit: 'DT',
      margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#2D9CDB',
      script: 'AirPods Pro 3 Script',
      scriptLines: [
        'Hook: "Do you use earbuds right now? Let me show you the difference."',
        'Let them listen to the active noise cancellation — experience sells better than words.',
        'Rain context: "Perfect for commuting, water resistant."',
        'Price objection: compare to Samsung — superior ANC quality at similar price.',
        'Add protective case = +25 DT, high margin item.',
      ]
    },
    {
      id: 'p6', name: 'Pro Business Pack', category: 'BUNDLE',
      price: '89', unit: 'DT/mo',
      margin: 'Top', marginColor: '#6C5CE7',
      hot: false, accentColor: '#6C5CE7',
      script: 'Pro Business Pack Script',
      scriptLines: [
        'Target: self-employed professionals, craftsmen, business owners.',
        '"The Pro Pack includes 5G Pro mobile line + 1Gb fiber + 1TB cloud backup."',
        'Tax advantage: fully deductible as a business expense.',
        '24-month commitment = stability for the client + recurring revenue for us.',
        'Offer free setup visit = key differentiator vs competitors.',
      ]
    },
  ];

  constructor(private data: MockDataService) {
    this.advisors.set(this.data.getAdvisors());
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollChat();
      this.shouldScroll = false;
    }
  }

  // ── Advisor selection ──
  selectAdvisor(id: string) { this.selectedId.set(id); }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      top:     'status--top',
      ok:      'status--ok',
      urgent:  'status--urgent',
      attente: 'status--attente'
    };
    return m[s] ?? '';
  }

  statusText(s: string): string {
    const m: Record<string, string> = {
      top:     'Top',
      ok:      'OK',
      urgent:  'Urgent',
      attente: 'Waiting'
    };
    return m[s] ?? s;
  }

  advPerfColor(p: number): string {
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  }

  // ── Product flip ──
  toggleFlip(id: string) {
    this.flippedProduct.update(cur => cur === id ? null : id);
  }

  isFlipped(id: string) { return this.flippedProduct() === id; }

  // ── Chat ──
  openChat() {
    this.chatOpen.set(true);
    this.chatTab.set('coach');
  }

  sendMessage(text?: string) {
    const msg = (text ?? this.chatInput()).trim();
    if (!msg) return;

    this.messages.update(list => [...list, {
      id:   'u' + Date.now(),
      role: 'user' as const,
      text: msg,
      time: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      })
    }]);

    this.chatInput.set('');
    this.shouldScroll = true;

    setTimeout(() => {
      this.messages.update(list => [...list, {
        id:   'c' + Date.now(),
        role: 'coach' as const,
        text: this.generateReply(msg),
        time: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit'
        })
      }]);
      this.shouldScroll = true;
    }, 900);
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

  private generateReply(msg: string): string {
    const m = msg.toLowerCase();

    if (m.includes('insurance'))
      return 'Insurance bundle script:\n\n1. Timing: offer AFTER device purchase is confirmed.\n2. Key phrase: "It\'s 9 DT/month — a coffee per week. If the screen breaks, replacement in 48h."\n3. Visual lever: show screen repair = 280 DT without insurance.\n4. Target: 70% conversion on device sales.';

    if (m.includes('5g') || m.includes('competitor'))
      return 'Against competitors on 5G:\n\n1. Our network covers 94% vs 87% for the competition.\n2. Key argument: guaranteed speed vs shared bandwidth.\n3. Ask the customer to test their current network in store — the result speaks for itself.\n4. Highlight our exclusive 5G Pro bundle pricing.';

    if (m.includes('price') || m.includes('objection'))
      return 'Price reframing technique:\n\n1. Never repeat the full price. Break it down: "1,299 DT = 54 DT/month over 24 months."\n2. Concrete comparison: "Less than your Netflix + Spotify subscription."\n3. Value vs cost: pro camera, 5-year durability, trade-in value.\n4. If blocked: offer 3x installments with no fees.';

    if (m.includes('peak') || m.includes('traffic') || m.includes('5 pm'))
      return 'Team plan for the 5–7 PM peak:\n\n1. Karim → premium handsets (93%, he can close).\n2. Sara → fiber and Pro offers (waiting clients = qualify time).\n3. Amine → accessories (easy traffic, fast to sell).\n4. Leila → welcome and orientation (reduce wait < 3 min).\n5. Prepare 3 iPhones in the display window by 4:45 PM.';

    if (m.includes('rain') || m.includes('accessory') || m.includes('accessories'))
      return 'Accessories strategy — rain context:\n\n1. Active signal: +40% demand until 6 PM.\n2. Priority products: AirPods Pro 3 (water resistant), Apple Watch S10 (waterproof 50m), protective cases.\n3. Universal hook: "Perfect in this weather, certified water resistant."\n4. Move Amine to the accessories zone immediately.\n5. Target: 5 accessory sales before 5 PM.';

    if (m.includes('stock') || m.includes('iphone'))
      return 'iPhone 16 Pro stock critical (3 units):\n\nStrategy: create urgency — "We only have 3 left in stock."\n\nFor hesitant customers: offer a reservation with a 10% deposit.\n\nRedirect others to Samsung A55 (24 units available, strong alternative pitch).';

    if (m.includes('target') || m.includes('2,000') || m.includes('2000'))
      return 'Reaching the 2,000 DT target:\n\nCurrent gap: ~150 DT. With 3h28 left and the 5 PM peak incoming:\n\n1. One iPhone 16 Pro sale closes the gap immediately.\n2. Two accessory bundles = ~300 DT.\n3. Focus: Premium Insurance on every device sale today.';

    return `Analyzing your request: "${msg.slice(0, 60)}..."\n\nI'm cross-referencing live POS data, weather signals, stock levels, and TimesFM forecasts. Want me to drill down on a specific advisor or product?`;
  }

  private scrollChat() {
    try {
      this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}