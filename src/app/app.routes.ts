import { Routes } from '@angular/router';
import { RealtimePageComponent } from './features/admin/realtime-page';

export const routes: Routes = [
  { path: 'admin/realtime', component: RealtimePageComponent },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard')
        .then(m => m.Dashboard),
    data: { prerender: false }
  },
  {
    path: 'inventory',
    loadComponent: () =>
      import('./features/inventory/inventory')
        .then(m => m.InventoryComponent)
  },
  {
    path: 'conseiller',
    loadComponent: () =>
      import('./features/conseiller/conseiller')
        .then(m => m.ConseillerComponent)
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/chat/chat')
        .then(m => m.ChatComponent)
  },
  {
    path: 'monitoring',
    loadComponent: () =>
      import('./features/monitoring/monitoring')
        .then(m => m.Monitoring)
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];