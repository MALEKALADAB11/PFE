import { Component, signal, computed, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive,  } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WebSocketService } from '../../core/services/websocket.service';
import { LayoutService } from '../../core/services/layout.service';

interface NavItem {
  label:  string;
  route:  string;
  icon:   string;
  isNew?: boolean;
}

@Component({
  selector:    'app-navbar',
  standalone:  true,
  imports:     [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl:    './navbar.scss'
})
export class NavbarComponent implements OnInit {

  currentTime = signal(this.getTime());
  currentDate = signal(this.getDate());
  storeName   = signal('Lac 2');

  navItems: NavItem[] = [
    { label: 'Dashboard',  route: '/dashboard',  icon: 'grid'           },
    { label: 'Inventory',  route: '/inventory',  icon: 'package', isNew: true },
    { label: 'Advisors',   route: '/conseiller', icon: 'user'           },
    { label: 'Coach Chat', route: '/chat',       icon: 'message-circle' },
    { label: 'Monitoring', route: '/monitoring', icon: 'activity'       },
  ];

  // ── Computed depuis WebSocket ─────────────────────────
  urgencyLevel = computed(() => this.ws.urgencyLevel());
  urgencyScore = computed(() => this.ws.urgencyScore());
  gapPct       = computed(() => this.ws.gapPct());
  lastUpdated  = computed(() => this.ws.lastUpdated());
  isConnected  = computed(() => this.ws.connected());
  agentsLive   = computed(() => this.ws.liveMetrics()?.agents_live ?? 5);

  urgencyLabel = computed(() => {
    const map: Record<string, string> = {
      HIGH:   '🔴 HIGH',
      MEDIUM: '🟡 MED',
      LOW:    '🟢 LOW',
    };
    return map[this.urgencyLevel()] ?? this.urgencyLevel();
  });

  urgencyClass = computed(() => ({
    HIGH:   'urgency-pill--high',
    MEDIUM: 'urgency-pill--medium',
    LOW:    'urgency-pill--low',
  })[this.urgencyLevel()] ?? '');

  constructor(
    public  ws:        WebSocketService,
    public  layout:    LayoutService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    setInterval(() => {
      this.currentTime.set(this.getTime());
      this.currentDate.set(this.getDate());
    }, 60_000);
  }

  private getTime(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private getDate(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ── SafeHtml pour éviter le warning sanitizer ─────────
  getIcon(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.getRawIcon(name));
  }

  private getRawIcon(name: string): string {
    const icons: Record<string, string> = {
      'grid': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
      </svg>`,
      'package': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27,6.96 12,12.01 20.73,6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>`,
      'user': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`,
      'message-circle': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>`,
      'activity': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
      </svg>`,
    };
    return icons[name] ?? '';
  }
}