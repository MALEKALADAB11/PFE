import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'inventory',  renderMode: RenderMode.Client },
  { path: 'chat',       renderMode: RenderMode.Client },
  { path: 'monitoring', renderMode: RenderMode.Client },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];