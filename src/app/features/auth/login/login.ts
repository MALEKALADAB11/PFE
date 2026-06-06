import {
  Component, signal, computed, inject, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Router }       from '@angular/router';
import { AuthService } from '../../../core/services/auth';


type TabMode = 'manager' | 'vendeur';

interface QuickUser {
  id: string; name: string; role: string;
  initials: string; color: string;
  login: string; password: string;
}

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl:    './login.scss',
})
export class LoginComponent implements OnInit {
  private auth   = inject(AuthService);
  private router = inject(Router);

  tab      = signal<TabMode>('manager');
  username = signal('');
  password = signal('');
  error    = signal('');
  loading  = signal(false);
  showPass = signal(false);

  quickManagers: QuickUser[] = [
    { id: 'mgr-lac2',   name: 'Manager Lac 2',  role: 'Manager · FR LAC2',          initials: 'MG', color: '#6C5CE7', login: 'managerlac2',   password: 'admin123' },
    { id: 'mgr-menzah', name: 'Manager Menzah', role: 'Manager · Habib Bourguiba',  initials: 'MM', color: '#00B894', login: 'managermenzah', password: 'admin123' },
    { id: 'mgr-sfax',   name: 'Manager Sfax',   role: 'Manager · Sfax I',           initials: 'MS', color: '#2D9CDB', login: 'managersfax',   password: 'admin123' },
  ];

  quickVendeurs: QuickUser[] = [
    { id: 'adv-zi', name: 'Zouiten Insaf',    role: 'Forfaits & Services',    initials: 'ZI', color: '#6C5CE7', login: 'zouiTeninsaf',    password: 'zi1234' },
    { id: 'adv-mh', name: 'Mansour Hela',     role: 'Postpaye & Terminaux',   initials: 'MH', color: '#00B894', login: 'mansourhela',     password: 'mh1234' },
    { id: 'adv-bm', name: 'Ben Ammar Meriam', role: 'Smartphones & Data',     initials: 'BM', color: '#F9A825', login: 'benammarmeriam',  password: 'bm1234' },
    { id: 'adv-mk', name: 'Mansour Khouloud', role: 'Recharge & Accessoires', initials: 'MK', color: '#2D9CDB', login: 'mansourkhouloud', password: 'mk1234' },
  ];

  currentQuickUsers = computed(() =>
    this.tab() === 'manager' ? this.quickManagers : this.quickVendeurs
  );

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(this.auth.isManager() ? ['/dashboard'] : ['/conseiller']);
    }
  }

  setTab(t: TabMode) {
    this.tab.set(t);
    this.username.set('');
    this.password.set('');
    this.error.set('');
  }

  async quickLogin(user: QuickUser) {
    this.username.set(user.login);
    this.password.set(user.password);
    await this.submit();
  }

  updateUsername(e: Event) {
    this.username.set((e.target as HTMLInputElement).value);
    this.error.set('');
  }

  updatePassword(e: Event) {
    this.password.set((e.target as HTMLInputElement).value);
    this.error.set('');
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.submit();
  }

  async submit() {
    if (this.loading()) return;
    const u = this.username().trim();
    const p = this.password().trim();
    if (!u || !p) { this.error.set('Veuillez remplir tous les champs.'); return; }

    this.loading.set(true);
    this.error.set('');

    const result = await this.auth.login(u, p);
    if (!result.success) {
      this.error.set(result.error ?? 'Erreur de connexion.');
    }
    this.loading.set(false);
  }
}