import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_VERIFY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export type UserRole = 'manager' | 'vendeur';

export interface StoreUser {
  id:         string;
  username:   string;
  name:       string;
  role:       UserRole;
  storeId:    string;
  storeName:  string;
  initials:   string;
  color:      string;
  advisorId?: string;
}

const API = `${environment.apiUrl}/api/auth`;
const TOKEN_KEY = 'ooredoo_token';
const USER_KEY  = 'ooredoo_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  private _user       = signal<StoreUser | null>(null);
  private _token      = signal<string | null>(null);
  private _loading    = signal(false);
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  currentUser  = computed(() => this._user());
  isLoggedIn   = computed(() => !!this._user());
  isManager    = computed(() => this._user()?.role === 'manager');
  isVendeur    = computed(() => this._user()?.role === 'vendeur');
  currentStore = computed(() => this._user()?.storeId ?? 'store-lac2');
  token        = computed(() => this._token());
  loading      = computed(() => this._loading());

  constructor() {
    this._restoreSession();
  }

  // ── Restaurer session depuis sessionStorage ────────────────────────────────
  private _restoreSession() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const user  = sessionStorage.getItem(USER_KEY);
      if (token && user) {
        this._token.set(token);
        this._user.set(JSON.parse(user));
        this._verifyToken(token);
        this._startTokenRefresh();
      }
    } catch { /* ignore */ }
  }

  private async _verifyToken(token: string) {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ user: StoreUser }>(`${API}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      if (resp?.user) {
        this._user.set(resp.user);
        sessionStorage.setItem(USER_KEY, JSON.stringify(resp.user));
      }
    } catch {
      this._clearSession();
      await this.router.navigate(['/login']);
    }
  }

  private _startTokenRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(async () => {
      const token = this._token();
      if (token) {
        await this._verifyToken(token);
      } else {
        this._stopTokenRefresh();
      }
    }, TOKEN_VERIFY_INTERVAL_MS);
  }

  private _stopTokenRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ── Login via backend PostgreSQL ──────────────────────────────────────────
  async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    this._loading.set(true);
    try {
      const resp = await firstValueFrom(
        this.http.post<{ token: string; user: StoreUser; expires: number }>(
          `${API}/login`,
          { username: username.trim(), password: password.trim() }
        )
      );

      if (!resp?.token) {
        return { success: false, error: 'Réponse invalide du serveur.' };
      }

      // Sauvegarder token + user
      this._token.set(resp.token);
      this._user.set(resp.user);
      sessionStorage.setItem(TOKEN_KEY, resp.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(resp.user));

      // Démarrer le refresh périodique du token
      this._startTokenRefresh();

      // Rediriger selon le rôle
      if (resp.user.role === 'manager') {
        await this.router.navigate(['/dashboard']);
      } else {
        await this.router.navigate(['/conseiller']);
      }

      return { success: true };

    } catch (err: any) {
      const msg = err?.error?.detail
              ?? err?.message
              ?? 'Identifiant ou mot de passe incorrect.';
      return { success: false, error: msg };
    } finally {
      this._loading.set(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout() {
    this._stopTokenRefresh();
    const token = this._token();
    if (token) {
      try {
        await firstValueFrom(
          this.http.post(`${API}/logout`, {}, {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
      } catch { /* ignore — session locale supprimée de toute façon */ }
    }
    this._clearSession();
    await this.router.navigate(['/login']);
  }

  private _clearSession() {
    this._user.set(null);
    this._token.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  // ── Headers authentifiés ──────────────────────────────────────────────────
  getAuthHeaders(): HttpHeaders {
    const token = this._token();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  // ── Permissions ───────────────────────────────────────────────────────────
  canAccess(path: string): boolean {
    const user = this._user();
    if (!user) return false;
    if (user.role === 'manager') return true;
    // Vendeur : seulement conseiller et chat
    return ['/conseiller', '/chat'].some(r => path.startsWith(r));
  }

  // ── Liste utilisateurs (manager) ─────────────────────────────────────────
  async getUsers(): Promise<any[]> {
    const token = this._token();
    if (!token) return [];
    try {
      const resp = await firstValueFrom(
        this.http.get<{ users: any[] }>(`${API}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return resp?.users ?? [];
    } catch { return []; }
  }
}