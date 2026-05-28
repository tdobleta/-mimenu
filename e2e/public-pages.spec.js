// E2E: Public Pages
// Public routes must render without authentication, fatal errors, or horizontal overflow.

import { test, expect } from '@playwright/test';

test.describe('Terminos de Servicio', () => {
  test('carga la pagina de terminos', async ({ page }) => {
    await page.goto('/terminos');
    await expect(page.locator('body')).toContainText(/servicio|t.rminos|terminos/i);
  });

  test('no hay scroll horizontal en terminos', async ({ page }) => {
    await page.goto('/terminos');
    await expect(page.locator('body')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

test.describe('Politica de Privacidad', () => {
  test('carga la pagina de privacidad', async ({ page }) => {
    await page.goto('/privacidad');
    await expect(page.locator('body')).toContainText(/privacidad|datos/i);
  });

  test('no hay scroll horizontal en privacidad', async ({ page }) => {
    await page.goto('/privacidad');
    await expect(page.locator('body')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

test.describe('Public Cocina Display', () => {
  test('cocina display carga sin error fatal', async ({ page }) => {
    await page.goto('/monitor-cocina?branch=test-branch-id');
    await expect(page.locator('body')).toContainText(/token|dispositivo|cocina|monitor/i);
  });
});

test.describe('Public Reservas', () => {
  test('reservas page carga sin error fatal', async ({ page }) => {
    await page.goto('/reservar/test-branch-id');
    await expect(page.locator('body')).toContainText(/reservar|restaurante|reserva/i);
  });

  test('responsive layout sin overflow', async ({ page }) => {
    await page.goto('/reservar/test-branch-id');
    await expect(page.locator('body')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

test.describe('404 / Unknown routes', () => {
  test('ruta desconocida no crashea la app', async ({ page }) => {
    await page.goto('/ruta-que-no-existe-12345');
    await expect(page.locator('body')).toContainText(/mimen|ingresar|login|cargando|no encontrado/i);
  });
});
