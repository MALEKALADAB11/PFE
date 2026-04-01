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
  margin: 'Élevée' | 'Moyenne' | 'Haute';
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
      label: 'Stock critique — iPhone 16 Pro',
      detail: '3 unités restantes · Risque rupture 91%',
      color: '#E74C3C', bg: '#FDEDEC',
      chatMessage: 'Stock iPhone 16 Pro critique (3 unités). Comment gérer les clients intéressés ?'
    },
    {
      id: 'a2',
      label: 'Pic trafic prévu 17h–19h',
      detail: 'Concert 20h à 2km · +60% visiteurs attendus',
      color: '#F9A825', bg: '#FFF8E1',
      chatMessage: 'Stratégie pic trafic 16h30 ? Concert ce soir, comment préparer mon équipe ?'
    },
    {
      id: 'a3',
      label: 'Pluie +40% accessoires',
      detail: 'Signal météo actif jusqu\'à 18h00',
      color: '#2D9CDB', bg: '#E8F4FD',
      chatMessage: 'Comment profiter de la pluie pour booster les ventes accessoires ?'
    },
  ]);

  // ── Quick prompts ──
  quickPrompts = [
    'Script bundle assurance ?',
    'Argument 5G face à SFR ?',
    'Comment gérer objection prix ?',
    'Stratégie pic trafic 16h30 ?',
    'Upsell accessoires pluie ?',
    'Franchir palier 2 000 DT ?',
  ];

  // ── Chat messages ──
  messages = signal<ChatMessage[]>([
    {
      id: 'm0', role: 'coach',
      text: `Bonjour Karim ! Tu es à 93% de ton objectif avec 3h28 restantes. La pluie crée une opportunité sur les accessoires (+40%). Je surveille la boutique en temps réel. Que veux-tu travailler ?`,
      time: '10:09'
    }
  ]);

  // ── Products (contextual) ──
  products: Product[] = [
    {
      id: 'p1', name: 'iPhone 16 Pro', category: 'Smartphone',
      price: '1 299', unit: 'DT', margin: 'Élevée', marginColor: '#00B894',
      hot: true, accentColor: '#6C5CE7',
      script: 'Argumentaire iPhone 16 Pro',
      scriptLines: [
        'Ouvrir sur le besoin : "Vous utilisez votre téléphone pour quoi principalement ?"',
        'Mettre en avant la puce A18 Pro — expliquer la différence concrète en photo et vidéo.',
        'Bundle proposé : iPhone 16 Pro + coque Apple + AppleCare+ = panier moyen +340 DT.',
        'Objection prix : "Sur 24 mois c\'est 54 DT/mois, moins qu\'un abonnement streaming."',
        'Urgence : "Il nous reste 3 unités — je ne peux pas garantir le stock demain."',
      ]
    },
    {
      id: 'p2', name: 'Fibre 2Gb Pro', category: 'Internet',
      price: '49', unit: 'DT/m', margin: 'Moyenne', marginColor: '#F9A825',
      hot: true, accentColor: '#00B894',
      script: 'Argumentaire Fibre Pro',
      scriptLines: [
        'Qualifier : "Vous avez combien de personnes chez vous qui utilisent internet ?"',
        'Différenciation : 2Gb symétrique = upload rapide, idéal télétravail et gaming.',
        'Bundle fibre + décodeur TV 4K = +15 DT mais rétention +60%.',
        'Objection opérateur actuel : demander la date de fin d\'engagement.',
        'Si fin < 3 mois : proposer pré-souscription avec activation différée.',
      ]
    },
    {
      id: 'p3', name: 'Assurance Premium', category: 'Service',
      price: '9', unit: 'DT/m', margin: 'Élevée', marginColor: '#00B894',
      hot: false, accentColor: '#E74C3C',
      script: 'Script Assurance Premium',
      scriptLines: [
        'Timing idéal : proposer juste après validation de l\'achat du terminal.',
        '"Avec l\'assurance Premium, si vous cassez l\'écran demain, échange sous 48h."',
        'Reformulation : "C\'est 9 DT/mois — soit le prix d\'un café par semaine."',
        'Levier psychologique : montrer le coût de réparation écran = 280 DT sans assurance.',
        'Taux de conversion recommandé : viser 70% des ventes terminaux.',
      ]
    },
    {
      id: 'p4', name: 'Apple Watch S10', category: 'Accessoire',
      price: '449', unit: 'DT', margin: 'Élevée', marginColor: '#00B894',
      hot: true, accentColor: '#F9A825',
      script: 'Script Apple Watch S10',
      scriptLines: [
        'Cibler les acheteurs iPhone : "Vous avez un iPhone ? La Watch se connecte parfaitement."',
        'Démontrer en boutique : montrer les notifications, le suivi santé en direct.',
        'Pluie = opportunité : "La Watch est étanche 50m, parfaite par ce temps."',
        'Bundle : Watch + bracelet sport supplémentaire + AppleCare = +80 DT marge.',
        'Financement : proposer 3x sans frais si hésitation sur le prix.',
      ]
    },
    {
      id: 'p5', name: 'AirPods Pro 3', category: 'Accessoire',
      price: '279', unit: 'DT', margin: 'Élevée', marginColor: '#00B894',
      hot: true, accentColor: '#2D9CDB',
      script: 'Script AirPods Pro 3',
      scriptLines: [
        'Accroche : "Vous utilisez des écouteurs en ce moment ? Je peux vous faire écouter la différence."',
        'Faire écouter la réduction de bruit active — l\'expérience vend mieux que l\'argumentation.',
        'Contexte pluie : "Parfait pour les déplacements, résistant à l\'eau."',
        'Objection prix : comparer au concurrent Samsung = qualité ANC supérieure.',
        'Ajouter étui de protection = +25 DT, marge élevée.',
      ]
    },
    {
      id: 'p6', name: 'Pack Pro Business', category: 'Bundle',
      price: '89', unit: 'DT/m', margin: 'Haute', marginColor: '#6C5CE7',
      hot: false, accentColor: '#6C5CE7',
      script: 'Script Pack Pro Business',
      scriptLines: [
        'Cible : clients professionnels, artisans, commerçants.',
        '"Le Pack Pro inclut ligne mobile 5G Pro + fibre 1Gb + cloud backup 1To."',
        'Avantage fiscal : déductible en charge professionnelle.',
        'Durée d\'engagement 24 mois = stabilité pour le client + récurrence pour nous.',
        'Proposer visite de déploiement gratuite = différenciateur vs concurrent.',
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
      top: 'Top', ok: 'OK', urgent: 'Urgent', attente: 'Attente'
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
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }]);

    this.chatInput.set('');
    this.shouldScroll = true;

    // Simulated coach reply
    setTimeout(() => {
      this.messages.update(list => [...list, {
        id:   'c' + Date.now(),
        role: 'coach',
        text: this.generateReply(msg),
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
      return 'Pour l\'assurance : propose-la APRÈS validation de l\'achat terminal. Script : "C\'est 9 DT/mois — soit le prix d\'un café par semaine. Et si l\'écran casse, échange sous 48h." Taux cible : 70% des ventes terminaux.';
    if (m.includes('5g') || m.includes('sfr'))
      return 'Face à SFR sur la 5G : notre réseau couvre 94% vs 87% pour SFR en Tunisie. Argument clé : débit garanti vs partagé. Demande au client de tester son réseau actuel en boutique — le résultat parle de lui-même.';
    if (m.includes('prix') || m.includes('objection'))
      return 'Technique de reformulation prix : "Ce n\'est pas 1 299 DT, c\'est 54 DT/mois sur 24 mois — moins que votre abonnement Netflix." Puis enchaîner sur la valeur : photo, durabilité, écosystème.';
    if (m.includes('trafic') || m.includes('pic'))
      return 'Pour le pic 17h–19h : repositionne Amine et Sara en zone accessoires. Karim prend les terminaux haut de gamme. Prépare 3 iPhones en vitrine. Objectif : réduire le temps d\'attente < 3 min par client.';
    if (m.includes('pluie') || m.includes('accessoire'))
      return 'Signal météo actif +40% demande accessoires. Mettre en avant : AirPods Pro (résistant eau), Apple Watch (suivi météo), coques étanches. Argument d\'accroche : "Parfait par ce temps."';
    if (m.includes('stock') || m.includes('iphone'))
      return 'Stock iPhone 16 Pro critique (3 unités). Stratégie : créer l\'urgence — "Il nous reste 3 en stock." Pour les clients qui hésitent, proposer réservation avec acompte 10%. Rediriger les autres vers Samsung A55 (stock 24 unités).';
    return `Conseil en cours de génération pour : "${msg}". En attendant, vérifie les quick prompts ci-dessous pour des réponses immédiates.`;
  }

  private scrollChat() {
    try {
      this.chatBottom?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  trackById(_: number, item: { id: string }) { return item.id; }
}