import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './layout/navbar/navbar';
import { SidebarComponent } from './layout/sidebar/sidebar';
import { WebSocketService } from './core/services/websocket.service';
import { LayoutService } from './core/services/layout.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SidebarComponent, CommonModule],
  template: `
    @if (!isLoginPage()) {
      <div class="app-shell">
        <app-sidebar />
        <!-- Mobile overlay -->
        @if (layout.mobileSidebarOpen()) {
          <div class="app-mobile-overlay" (click)="layout.closeMobileSidebar()"></div>
        }
        <div class="app-center">
          <app-navbar />
          <main class="app-main">
            <router-outlet />
          </main>
        </div>
      </div>
    } @else {
      <router-outlet />
    }
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: #EEF2F7;
    }
    .app-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }
    .app-main {
      flex: 1;
      overflow-y: auto;
      background: #EEF2F7;
    }
    .app-mobile-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 290;
      animation: overlay-in 0.2s ease;
    }
    @keyframes overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `]
})
export class AppComponent {
  private router = inject(Router);
  public  ws     = inject(WebSocketService);
  public  layout = inject(LayoutService);

  isLoginPage(): boolean {
    return this.router.url.startsWith('/login');
  }
}

export { AppComponent as App };
