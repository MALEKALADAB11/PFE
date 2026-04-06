import { Component, computed, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Advisor } from '../../core/models/advisor';
import { MockDataService } from '../../core/services/mock-data';


interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  margin: 'High' | 'Medium' | 'Premium';
  marginColor: string;
  hot: boolean;
  script: string;
  scriptLines: string[];
  accentColor: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
  time: string;
}

interface Alert {
  id: string;
  label: string;
  detail: string;
  color: string;
  bg: string;
  chatMessage: string;
}

@Component({
  selector: 'app-conseiller',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conseiller.html',
  styleUrl:    './conseiller.scss'
})
export class ConseillerComponent implements AfterViewChecked {

  @ViewChild('chatBottom') chatBottom!: ElementRef;

  // ── State ──
  advisors        = signal<Advisor[]>([]);
  selectedId      = signal<string>('kb');
  chatOpen        = signal<boolean>(true);
  chatTab         = signal<'coach' | 'alertes'>('coach');
  flippedProduct  = signal<string | null>(null);
  chatInput       = signal<string>('');
  shouldScroll    = false;

  selected = computed(() =>
    this.advisors().find(a => a.id === this.selectedId())!
  );

  perfColor = computed(() => {
    const p = this.selected().performance;
    return p >= 80 ? '#00B894' : p >= 50 ? '#F9A825' : '#E74C3C';
  });

  caPercent = computed(() =>
    Math.round((this.selected().caRealized / this.selected().caObjectif) * 100)
  );

  // ── Alerts ──
  alerts = signal<Alert[]>([
    {
      id: 'a1',
      label: 'Critical stock — iPhone 16 Pro',
      detail: '3 units remaining · 91% stockout risk',
      color: '#E74C3C', bg: '#FDEDEC',
      chatMessage: 'Critical iPhone 16 Pro stock (3 units). How to handle interested customers?'
    },
    {
      id: 'a2',
      label: 'Traffic peak expected 17h-19h',
      detail: 'Concert 20h at 2km · +60% expected visitors',
      color: '#F9A825', bg: '#FFF8E1',
      chatMessage: 'Traffic peak strategy 16h30? Concert tonight, how to prepare my team?'
    },
    {
      id: 'a3',
      label: 'Rain +40% accessories',
      detail: 'Active weather signal until 18h00',
      color: '#2D9CDB', bg: '#E8F4FD',
      chatMessage: 'How to take advantage of the rain to boost accessory sales?'
    },
  ]);

  // ── Quick prompts ──
  quickPrompts = [
    'Insurance bundle script?',
    '5G argument against SFR?',
    'How to handle price objection?',
    'Traffic peak strategy 16h30?',
    'Rain accessories upsell?',
    'Reach 2,000 DT milestone?',
  ];

  // ── Chat messages ──
  messages = signal<ChatMessage[]>([
    {
      id: 'm0', role: 'coach',
      text: `Hello Karim! You are at 93% of your target with 3h28 remaining. Rain creates an opportunity on accessories (+40%). I am monitoring the store in real time. What would you like to work on?`,
      time: '10:09'
    }
  ]);

  // ── Products (contextual) ──
  products: Product[] = [
    {
      id: 'p1', name: 'iPhone 16 Pro', category: 'Smartphone',
      price: '1 299', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#6C5CE7',
      script: 'iPhone 16 Pro Sales Script',
      scriptLines: [
        'Open with the need: "What do you mainly use your phone for?"',
        'Highlight the A18 Pro chip — explain the concrete difference in photo and video.',
        'Proposed bundle: iPhone 16 Pro + Apple case + AppleCare+ = average basket +340 DT.',
        'Price objection: "Over 24 months it is 54 DT/month, less than a streaming subscription."',
        'Urgency: "We only have 3 units left — I cannot guarantee stock tomorrow."',
      ]
    },
    {
      id: 'p2', name: 'Fibre 2Gb Pro', category: 'Internet',
      price: '49', unit: 'DT/m', margin: 'Medium', marginColor: '#F9A825',
      hot: true, accentColor: '#00B894',
      script: 'Fiber Pro Sales Script',
      scriptLines: [
        'Qualify: "How many people in your household use the internet?"',
        'Différenciation : 2Gb symétrique = upload rapide, idéal télétravail et gaming.',
        'Fiber bundle + 4K TV decoder = +15 DT but +60% retention.',
        'Current operator objection: ask for the contract end date.',
        'If end < 3 months: offer pre-subscription with deferred activation.',
      ]
    },
    {
      id: 'p3', name: 'Assurance Premium', category: 'Service',
      price: '9', unit: 'DT/m', margin: 'High', marginColor: '#00B894',
      hot: false, accentColor: '#E74C3C',
      script: 'Premium Insurance Script',
      scriptLines: [
        'Ideal timing: offer just after the terminal purchase is confirmed.',
        '"With Premium insurance, if you break the screen tomorrow, replacement within 48h."',
        'Reframe: "It is 9 DT/month — the price of a coffee per week."',
        'Psychological lever: show screen repair cost = 280 DT without insurance.',
        'Recommended conversion rate: target 70% of terminal sales.',
      ]
    },
    {
      id: 'p4', name: 'Apple Watch S10', category: 'Accessory',
      price: '449', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#F9A825',
      script: 'Apple Watch S10 Script',
      scriptLines: [
        'Target iPhone buyers: "Do you have an iPhone? The Watch connects perfectly."',
        'Demonstrate in store: show notifications, live health tracking.',
        'Rain = opportunity: "The Watch is waterproof 50m, perfect for this weather."',
        'Bundle: Watch + extra sport band + AppleCare = +80 DT margin.',
        'Financing: offer 3x interest-free if hesitation on price.',
      ]
    },
    {
      id: 'p5', name: 'AirPods Pro 3', category: 'Accessory',
      price: '279', unit: 'DT', margin: 'High', marginColor: '#00B894',
      hot: true, accentColor: '#2D9CDB',
      script: 'AirPods Pro 3 Script',
      scriptLines: [
        'Opening: "Are you using earphones right now? Let me let you hear the difference."',
        'Let them hear the active noise cancellation — the experience sells better than arguments.',
        'Rain context: "Perfect for travel, water resistant."',
        'Price objection: compare to Samsung competitor = superior ANC quality.',
        'Add protective case = +25 DT, high margin.',
      ]
    },
    {
      id: 'p6', name: 'Pack Pro Business', category: 'Bundle',
      price: '89', unit: 'DT/m', margin: 'Premium', marginColor: '#6C5CE7',
      hot: false, accentColor: '#6C5CE7',
      script: 'Pack Pro Business Script',
      scriptLines: [
        'Target: professional clients, craftsmen, traders.',
        '"The Pro Pack includes 5G Pro mobile line + 1Gb fiber + 1TB cloud backup."',
        'Tax advantage: deductible as a business expense.',
        '24-month commitment = stability for the customer + recurring revenue for us.',
        'Offer free deployment visit = differentiator vs competitor.',
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
      top: 'status--top', ok: 'status--ok',
      urgent: 'status--urgent', attente: 'status--attente'
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
      role: 'user',
      text: msg,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }]);

    this.chatInput.set('');
    this.shouldScroll = true;

    // Simulated coach reply
    setTimeout(() => {
      this.messages.update(list => [...list, {
        id:   'c' + Date.now(),
        role: 'coach',
        text: this.generateReply(msg),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }]);
      this.shouldScroll = true;
    }, 900);
  }

  sendQuick(prompt: string) {
    this.chatTab.set('coach');
    this.chatOpen.set(true);
    this.sendMessage(prompt);
  }

  // ── Alert → Chat ──
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
    if (m.includes('assurance'))
      return 'For insurance: offer it AFTER the terminal purchase is confirmed. Script: "It is 9 DT/month — the price of a coffee per week. And if the screen breaks, replacement within 48h." Target rate: 70% of terminal sales.';
    if (m.includes('5g') || m.includes('sfr'))
      return 'Against SFR on 5G: our network covers 94% vs 87% for SFR in Tunisia. Key argument: guaranteed vs shared speed. Ask the customer to test their current network in the store — the result speaks for itself.';
    if (m.includes('prix') || m.includes('objection'))
      return 'Price reframing technique: "It is not 1,299 DT, it is 54 DT/month over 24 months — less than your Netflix subscription." Then follow up on value: camera, durability, ecosystem.';
    if (m.includes('trafic') || m.includes('pic'))
      return 'For the 17h-19h peak: reposition Amine and Sara in the accessories zone. Karim takes the premium terminals. Set up 3 iPhones in the display. Target: reduce wait time < 3 min per customer.';
    if (m.includes('pluie') || m.includes('accessoire') || m.includes('rain') || m.includes('accessory'))
      return 'Active weather signal +40% accessory demand. Highlight: AirPods Pro (water resistant), Apple Watch (weather tracking), waterproof cases. Opening argument: "Perfect for this weather."';
    if (m.includes('stock') || m.includes('iphone'))
      return 'Critical iPhone 16 Pro stock (3 units). Strategy: create urgency — "We only have 3 left in stock." For hesitant customers, offer reservation with 10% deposit. Redirect others to Samsung A55 (24 units in stock).';
    return `Generating advice for: "${msg}". In the meantime, check the quick prompts below for immediate answers.`;
  }

  private scrollChat() {
    try {
      this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}