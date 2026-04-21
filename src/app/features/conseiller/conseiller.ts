import {
  Component, computed, signal,
  ElementRef, ViewChild,
  AfterViewChecked, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule }      from '@angular/common';
import { Advisor }           from '../../core/models/advisor';
import { MockDataService }   from '../../core/services/mock-data';
import { WebSocketService }  from '../../core/services/websocket.service';
import { ApiService } from '../../core/services/api';

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

  storeId    = 'store-lac2';
  advisors   = signal<Advisor[]>([]);
  selectedId = signal<string>('kb');
  chatOpen   = signal<boolean>(true);
  chatTab    = signal<'coach' | 'alertes'>('coach');
  flippedProduct = signal<string | null>(null);
  chatInput  = signal<string>('');
  shouldScroll = false;

  // ── Live data ────────────────────────────────────────
  liveAdvisors = signal<Advisor[]>([]);
  wsConnected  = signal(false);

  // ── Computed selected advisor ─────────────────────────
  selected = computed(() => {
    const live = this.liveAdvisors();
    const mock = this.advisors();
    const list = live.length ? live : mock;
    return list.find(a => a.id === this.selectedId())!;
  });

  perfColor = computed(() => {
    const p = this.selected()?.performance ?? 0;
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  });

  caPercent = computed(() => {
    const s = this.selected();
    if (!s) return 0;

    // Utiliser données live WS si disponibles
    const liveData = this.ws.liveAdvisors();
    const liveAdv  = liveData.find((l: any) => l.advisor_id === s.id);
    if (liveAdv) {
      const ca     = liveAdv.ca_today ?? s.caRealized;
      const target = s.caObjectif ?? 2000;
      return Math.round((ca / target) * 100);
    }
    return Math.round((s.caRealized / s.caObjectif) * 100);
  });

  // CA en temps réel pour le selected advisor
  selectedCaLive = computed(() => {
    const s       = this.selected();
    const liveData = this.ws.liveAdvisors();
    const liveAdv  = liveData.find((l: any) => l.advisor_id === s?.id);
    return liveAdv ? Math.round(liveAdv.ca_today) : (s?.caRealized ?? 0);
  });

  // ── Team ranking avec données live ───────────────────
  advisorsList = computed(() => {
    const live = this.ws.liveAdvisors();
    const list = this.liveAdvisors().length
               ? this.liveAdvisors()
               : this.advisors();

    if (!live.length) return list;

    return list.map(adv => {
      const wsData = live.find((l: any) => l.advisor_id === adv.id);
      if (!wsData) return adv;
      const ca   = Math.round(wsData.ca_today);
      const perf = Math.round((ca / adv.caObjectif) * 100);
      return {
        ...adv,
        caRealized:  ca,
        performance: perf,
        status: perf >= 80 ? 'top' : perf >= 50 ? 'ok' : 'urgent'
      };
    }).sort((a, b) => b.performance - a.performance);
  });

  // ── Alerts ───────────────────────────────────────────
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
      chatMessage: 'Strategy for the 5 PM traffic peak? Concert tonight — how should I prepare?'
    },
    {
      id: 'a3',
      label:  'Rain drives +40% accessory demand',
      detail: 'Weather signal active until 6:00 PM',
      color:  '#2D9CDB', bg: '#E8F4FD',
      chatMessage: 'How can I leverage the rain signal to boost accessory sales?'
    },
  ]);

  quickPrompts = [
    'Insurance bundle script?',
    '5G argument vs competitors?',
    'How to handle price objection?',
    'Strategy for 5 PM peak traffic?',
    'Accessory upsell — rain context?',
    'How to reach 2,000 DT target?',
  ];

  messages = signal<ChatMessage[]>([
    {
      id:   'm0',
      role: 'coach',
      text: `Hi Karim! You are at 93% of your daily target with 3h28 remaining. The rain creates an opportunity for accessories (+40%). I'm monitoring the store in real time. What do you want to work on?`,
      time: '10:09 AM'
    }
  ]);

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
        'Price objection: "Over 24 months it\'s 54 DT/month."',
        'Create urgency: "We only have 3 units left."',
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
        '2Gb symmetric = fast upload, ideal for remote work and gaming.',
        'Bundle fiber + 4K TV decoder = +15 DT but 60% better retention.',
        'Ask when their contract ends.',
        'If < 3 months: offer pre-subscription with deferred activation.',
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
        '"With Premium Insurance, screen replacement in 48h."',
        'Reframe: "It\'s 9 DT/month — a coffee per week."',
        'Show screen repair cost = 280 DT without insurance.',
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
        'Demo in store: show notifications, live health tracking.',
        'Rain opportunity: "The Watch is waterproof to 50m."',
        'Bundle: Watch + extra sport band + AppleCare = +80 DT margin.',
        'Offer 3x installments if hesitation on price.',
      ]
    },
    {
      id: 'p5', name: 'AirPods Pro 3', category: 'ACCESSORY',
      price: '279', unit: 'DT',
      margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#2D9CDB',
      script: 'AirPods Pro 3 Script',
      scriptLines: [
        '"Do you use earbuds right now? Let me show you the difference."',
        'Let them listen to the active noise cancellation.',
        'Rain context: "Perfect for commuting, water resistant."',
        'Compare to Samsung — superior ANC quality at similar price.',
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
        'Target: self-employed professionals, business owners.',
        '"5G Pro mobile line + 1Gb fiber + 1TB cloud backup."',
        'Tax advantage: fully deductible as a business expense.',
        '24-month commitment = stability + recurring revenue.',
        'Offer free setup visit = key differentiator.',
      ]
    },
  ];

  constructor(
    private data: MockDataService,
    private api:  ApiService,
    private ws:   WebSocketService
  ) {
    this.advisors.set(this.data.getAdvisors());
  }

  ngOnInit() {
    // 1 — Charger advisors depuis API
    this.api.getAdvisors(this.storeId).subscribe({
      next: d => this.liveAdvisors.set(d.advisors ?? []),
      error: () => {}
    });

    // 2 — Connecter WebSocket store pour CA live
    this.ws.connectStore(this.storeId);

    // 3 — Connecter WebSocket advisor pour coach updates
    this.ws.connectAdvisor(this.selectedId());

    // 4 — Refresh HTTP toutes les 30s
    setInterval(() => {
      this.api.getAdvisors(this.storeId).subscribe({
        next: d => this.liveAdvisors.set(d.advisors ?? []),
        error: () => {}
      });
    }, 30000);
  }

  ngOnDestroy() {
    this.ws.disconnect();
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollChat();
      this.shouldScroll = false;
    }
  }

  selectAdvisor(id: string) {
    this.selectedId.set(id);
    this.ws.connectAdvisor(id);
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      top:    'status--top',    ok:     'status--ok',
      urgent: 'status--urgent', attente:'status--attente'
    };
    return m[s] ?? '';
  }

  statusText(s: string): string {
    const m: Record<string, string> = {
      top: 'Top', ok: 'OK', urgent: 'Urgent', attente: 'Waiting'
    };
    return m[s] ?? s;
  }

  advPerfColor(p: number): string {
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  }

  toggleFlip(id: string) {
    this.flippedProduct.update(cur => cur === id ? null : id);
  }

  isFlipped(id: string) { return this.flippedProduct() === id; }

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
      return 'Insurance bundle script:\n\n1. Timing: offer AFTER device purchase.\n2. "It\'s 9 DT/month — a coffee per week. Screen replacement in 48h."\n3. Show repair cost = 280 DT without insurance.\n4. Target: 70% conversion on device sales.';

    if (m.includes('5g') || m.includes('competitor'))
      return 'Against competitors on 5G:\n\n1. Our network covers 94% vs 87% competitors.\n2. Guaranteed speed vs shared bandwidth.\n3. Let the customer test their current network in store.\n4. Highlight exclusive 5G Pro bundle pricing.';

    if (m.includes('price') || m.includes('objection'))
      return 'Price reframing:\n\n1. Break it down: "1,299 DT = 54 DT/month over 24 months."\n2. "Less than your Netflix + Spotify subscription."\n3. Pro camera, 5-year durability, trade-in value.\n4. Offer 3x installments with no fees.';

    if (m.includes('peak') || m.includes('traffic') || m.includes('5 pm'))
      return 'Team plan for the 5–7 PM peak:\n\n1. Karim → premium handsets.\n2. Sara → fiber and Pro offers.\n3. Amine → accessories (easy traffic).\n4. Leila → welcome and orientation.\n5. Prepare 3 iPhones in window by 4:45 PM.';

    if (m.includes('rain') || m.includes('accessor'))
      return 'Accessories strategy — rain context:\n\n1. Active signal: +40% demand until 6 PM.\n2. Priority: AirPods Pro 3 (water resistant), Apple Watch (waterproof 50m).\n3. Hook: "Perfect in this weather, certified water resistant."\n4. Move Amine to accessories zone immediately.';

    if (m.includes('stock') || m.includes('iphone'))
      return 'iPhone 16 Pro stock critical (3 units):\n\nStrategy: create urgency.\nFor hesitant customers: reservation with 10% deposit.\nRedirect others to Samsung A55 (24 units available).';

    if (m.includes('target') || m.includes('2,000') || m.includes('2000')) {
      const ca   = this.selectedCaLive();
      const gap  = 2000 - ca;
      return `Reaching 2,000 DT target:\n\nCurrent: ${ca.toLocaleString()} DT · Gap: ${Math.round(gap).toLocaleString()} DT\n\n1. One iPhone 16 Pro closes the gap immediately.\n2. Two accessory bundles = ~300 DT.\n3. Premium Insurance on every device sale.`;
    }

    return `Analyzing: "${msg.slice(0, 60)}..."\n\nCross-referencing live POS data, weather signals, stock levels, and TimesFM forecasts. Want me to drill down on a specific product or advisor?`;
  }

  private scrollChat() {
    try {
      this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}