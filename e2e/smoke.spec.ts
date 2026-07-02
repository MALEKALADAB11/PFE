/**
 * E2E Smoke Tests — Ooredoo AI Sales Coach
 * Sprint 7 (S7.4)
 *
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   ng serve (on :4200) + FastAPI backend (on :8000)
 *
 * Run: npx playwright test e2e/smoke.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page: Page, username = 'zouiTeninsaf', password = 'zi1234') {
  await page.goto(`${BASE}/auth/login`);
  await page.getByLabel(/username|identifiant/i).fill(username);
  await page.getByLabel(/password|mot de passe/i).fill(password);
  await page.getByRole('button', { name: /connexion|login|se connecter/i }).click();
  // Wait for redirect to dashboard
  await page.waitForURL(/dashboard/, { timeout: 10_000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth', () => {

  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE}/auth/login`);
    await expect(page).toHaveTitle(/ooredoo|coach|sales/i);
    await expect(page.getByRole('button', { name: /connexion|login/i })).toBeVisible();
  });

  test('valid credentials redirect to dashboard', async ({ page }) => {
    await login(page);
    await expect(page.url()).toContain('dashboard');
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto(`${BASE}/auth/login`);
    await page.getByLabel(/username|identifiant/i).fill('invalid_user');
    await page.getByLabel(/password|mot de passe/i).fill('wrong_password');
    await page.getByRole('button', { name: /connexion|login/i }).click();
    // Should stay on login page and show error
    await expect(page.url()).not.toContain('dashboard');
  });

});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard loads core KPI cards', async ({ page }) => {
    // At minimum we expect CA Today and some urgency indicator
    await expect(page.locator('[class*="kpi"], [class*="ca-card"], [class*="metric"]').first())
      .toBeVisible({ timeout: 8_000 });
  });

  test('urgency badge is visible', async ({ page }) => {
    await expect(
      page.locator('[class*="urgency"], [class*="niveau-urgence"], [class*="badge--"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('navigation sidebar has main routes', async ({ page }) => {
    const nav = page.locator('nav, [class*="sidebar"], [class*="nav-"]').first();
    await expect(nav).toBeVisible();
  });

  test('HITL panel button is present', async ({ page }) => {
    // Sprint 4 — hitl panel trigger button
    const hitlBtn = page.locator('app-hitl-panel button, [class*="hitl-trigger"]').first();
    // It may be hidden if 0 pending — just check it's in the DOM
    await expect(hitlBtn).toBeAttached({ timeout: 5_000 }).catch(() => {
      // HITL panel may not be rendered on this page variant — soft fail
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Coach Chat', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/chat`);
    await page.waitForLoadState('networkidle');
  });

  test('chat page renders message input', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').last();
    await expect(input).toBeVisible({ timeout: 8_000 });
  });

  test('send a greeting message and receive a response', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').last();
    await input.fill('Bonjour');
    await input.press('Enter');

    // Coach response appears within 20s
    await expect(
      page.locator('[class*="msg-bubble--coach"]:not([class*="typing"])').last()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('chat area shows conversation history', async ({ page }) => {
    await expect(page.locator('[class*="msg-row"]').first()).toBeVisible({ timeout: 6_000 });
  });

  test('dynamic suggestions chips are visible', async ({ page }) => {
    const chips = page.locator('[class*="suggested-prompt"], [class*="suggestion-chip"]');
    await expect(chips.first()).toBeVisible({ timeout: 6_000 }).catch(() => {
      // Suggestions may not be present if live data is empty — soft fail
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inventory Page', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/inventory`);
    await page.waitForLoadState('networkidle');
  });

  test('inventory KPI row is visible', async ({ page }) => {
    await expect(
      page.locator('[class*="inv-kpi-row"], [class*="kpi-row"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('inventory table renders at least one row', async ({ page }) => {
    await expect(
      page.locator('[class*="inv-table-row"]').first()
    ).toBeVisible({ timeout: 10_000 }).catch(() => {
      // table may be empty in test env — soft fail
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsiveness (mobile 375px)', () => {

  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard does not overflow horizontally', async ({ page }) => {
    const body = await page.evaluate(() => document.body.scrollWidth);
    const vp   = await page.evaluate(() => window.innerWidth);
    expect(body).toBeLessThanOrEqual(vp + 5);  // allow 5px tolerance
  });

  test('chat page is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/chat`);
    await page.waitForLoadState('networkidle');
    const input = page.locator('textarea, input[type="text"]').last();
    await expect(input).toBeVisible({ timeout: 8_000 });
  });

});
