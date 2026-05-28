// E2E: Responsive Layout
// Verifies the most important public surfaces do not create horizontal overflow.

import { test, expect } from '@playwright/test';

async function expectNoHorizontalScroll(page, tolerance = 1) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + tolerance);
}

test.describe('Login page responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();
  });

  test('no hay scroll horizontal', async ({ page }) => {
    await expectNoHorizontalScroll(page);
  });

  test('form es visible y centrado', async ({ page }) => {
    const form = page.locator('form');
    const box = await form.boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  test('inputs tienen tamano minimo para touch', async ({ page }) => {
    const inputs = page.locator('input[type="email"], input[type="password"]');
    const count = await inputs.count();

    expect(count).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < count; i++) {
      const box = await inputs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });
});

test.describe('Public reservation page responsive', () => {
  test('loads without horizontal scroll', async ({ page }) => {
    await page.goto('/reservar/test-branch');
    await expect(page.locator('body')).toContainText(/reservar|restaurante|reserva/i);
    await expectNoHorizontalScroll(page);
  });
});
