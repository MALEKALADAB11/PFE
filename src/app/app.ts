import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './layout/navbar/navbar';
import { SidebarComponent } from './layout/sidebar/sidebar';
import { WebSocketService } from './core/services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SidebarComponent, CommonModule],
  template: `
    @if (!isLoginPage()) {
      <div class="app-shell">
        <app-sidebar />
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

  `]
})
export class AppComponent {
  private router = inject(Router);
  public  ws     = inject(WebSocketService);

  isLoginPage(): boolean {
    return this.router.url.startsWith('/login');
  }
}

export { AppComponent as App };
