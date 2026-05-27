// E2E: Login Flow & Navigation
// These tests verify real public/auth UX without requiring live Supabase credentials.

import { test, expect } from '@playwright/test';

async function expectProtectedRouteBlocked(page, route) {
  await page.goto(route);

  await expect.poll(async () => {
    const url = page.url();
    const passwordInputs = await page.locator('input[type="password"]').count();
    const loginButtons = await page.locator('button[type="submit"], button:has-text("Ingresar"), button:has-text("Iniciar")').count();

    return url.includes('/login') || url.includes('/auth') || (passwordInputs > 0 && loginButtons > 0);
  }, {
    message: `${route} debe bloquear usuarios sin sesion`,
    timeout: 5000,
  }).toBeTruthy();
}

test.describe('Login form validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('muestra la pagina de login con campos requeridos', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('boton de login esta presente', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"], button:has-text("Ingresar"), button:has-text("Iniciar")');
    await expect(submitBtn.first()).toBeVisible();
  });

  test('campos de email y password aceptan input', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('password123');

    await expect(emailInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('password123');
  });

  test('no hay elementos cortados fuera del viewport', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('marca o formulario principal esta visible', async ({ page }) => {
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('body')).toContainText(/mimen|ingresar|iniciar/i);
  });
});

test.describe('Login accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();
  });

  test('inputs tienen labels o placeholders', async ({ page }) => {
    const inputs = page.locator('input');
    const count = await inputs.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const placeholder = await input.getAttribute('placeholder');
      const ariaLabel = await input.getAttribute('aria-label');
      const id = await input.getAttribute('id');
      const labelCount = id ? await page.locator(`label[for="${id}"]`).count() : 0;

      expect(Boolean(placeholder || ariaLabel || labelCount > 0)).toBeTruthy();
    }
  });

  test('touch targets son suficientemente grandes', async ({ page }) => {
    const buttons = page.locator('button');
    const count = await buttons.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box && box.height > 0) {
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    }
  });
});

test.describe('Navigation guards', () => {
  test('redirige o bloquea dashboard si no hay sesion', async ({ page }) => {
    await expectProtectedRouteBlocked(page, '/dashboard');
  });

  test('redirige o bloquea rutas protegidas si no hay sesion', async ({ page }) => {
    for (const route of ['/caja', '/salon', '/stock', '/reservas']) {
      await expectProtectedRouteBlocked(page, route);
    }
  });
});
