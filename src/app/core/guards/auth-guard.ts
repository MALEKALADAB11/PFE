import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';


// ── Guard global : utilisateur connecté ───────────────────────────────────────
export const authGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  // Vérifier les permissions de la route
  const path = '/' + (route.routeConfig?.path ?? '');
  if (!auth.canAccess(path)) {
    // Vendeur essaie d'accéder à une page manager → rediriger
    router.navigate(['/conseiller']);
    return false;
  }

  return true;
};

// ── Guard manager uniquement ──────────────────────────────────────────────────
export const managerGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  if (!auth.isManager()) {
    router.navigate(['/conseiller']);
    return false;
  }

  return true;
};

// ── Guard login : rediriger si déjà connecté ──────────────────────────────────
export const loginGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    if (auth.isManager()) {
      router.navigate(['/dashboard']);
    } else {
      router.navigate(['/conseiller']);
    }
    return false;
  }

  return true;
};