import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './layout/navbar/navbar';
import { SidebarComponent } from './layout/sidebar/sidebar';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SidebarComponent],
  template: `
    <app-navbar />
    <div class="app-body">
      <app-sidebar />
      <main class="app-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-body {
      display: flex;
      height: calc(100vh - 56px);
      overflow: hidden;
    }
    .app-main {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      background: var(--color-bg);
    }
  `]
})
export class AppComponent {}

export { AppComponent as App };