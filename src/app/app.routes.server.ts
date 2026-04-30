import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'dashboard',
    renderMode: RenderMode.Client
  },
  {
    path: 'conseiller',
    renderMode: RenderMode.Client
  },
  {
    path: 'inventory',
    renderMode: RenderMode.Client
  },
  {
    path: 'chat',
    renderMode: RenderMode.Client
  },
  {
    path: 'monitoring',
    renderMode: RenderMode.Client
  },
  {
    path: 'admin/realtime',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];