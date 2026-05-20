import { Routes } from '@angular/router';
import { authGuard, loginGuard, managerGuard } from './core/guards/auth-guard';


export const routes: Routes = [

  // ── Login (public) ──────────────────────────────────────
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./features/auth/login/login')
        .then(m => m.LoginComponent),
  },

  // ── Redirect racine ─────────────────────────────────────
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },

  // ── Manager uniquement ──────────────────────────────────
  {
    path: 'dashboard',
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard')
        .then(m => m.Dashboard),
    data: { prerender: false },
  },
  {
    path: 'inventory',
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/inventory/inventory')
        .then(m => m.InventoryComponent),
  },
  {
    path: 'monitoring',
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/monitoring/monitoring')
        .then(m => m.MonitoringComponent),
  },

  // ── Manager + Vendeur ───────────────────────────────────
  {
    path: 'conseiller',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/conseiller/conseiller')
        .then(m => m.ConseillerComponent),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat/chat')
        .then(m => m.ChatComponent),
  },

  // ── Admin (interne) ────────────────────────────────────
  {
    path: 'admin/realtime',
    canActivate: [managerGuard],
    loadComponent: () =>
      import('./features/admin/realtime-page')
        .then(m => m.RealtimePageComponent),
  },

  // ── Fallback ────────────────────────────────────────────
  {
    path: '**',
    redirectTo: 'login',
  },
];