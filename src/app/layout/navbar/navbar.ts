import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

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
export class NavbarComponent {

  currentTime  = signal(this.getTime());
  agentsActive = signal(5);
  storeName    = signal('Lac 2');

  navItems: NavItem[] = [
    { label: 'Dashboard',  route: '/dashboard',  icon: 'grid'           },
    { label: 'Inventory',  route: '/inventory',  icon: 'package', isNew: true },
    { label: 'Advisors',   route: '/conseiller', icon: 'user'           },
    { label: 'Coach Chat', route: '/chat',       icon: 'message-circle' },
    { label: 'Monitoring', route: '/monitoring', icon: 'activity'       },
  ];

  private getTime(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  getIcon(name: string): string {
    const icons: Record<string, string> = {
      'grid': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
      </svg>`,

      'package': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>`,

      'user': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`,

      'message-circle': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>`,

      'activity': `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
      </svg>`,
    };
    return icons[name] ?? '';
  }
}