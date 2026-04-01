import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () =>
      import('./features/dashboard/dashboard')
        .then(m => m.DashboardComponent) },
  { path: 'conseiller', loadComponent: () =>
      import('./features/conseiller/conseiller')
        .then(m => m.ConseillerComponent) },
  { path: 'inventory', loadComponent: () =>
      import('./features/inventory/inventory')
        .then(m => m.Inventory) },
  { path: 'monitoring', loadComponent: () =>
      import('./features/monitoring/monitoring')
        .then(m => m.Monitoring) },
  { path: 'chat',loadComponent: () =>
      import('./features/chat/chat')
        .then(m => m.ChatComponent) },
  { path: '**', redirectTo: 'dashboard' }
];