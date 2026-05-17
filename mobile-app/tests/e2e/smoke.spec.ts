/**
 * E2E smoke test — vérifie que le shell boot et affiche l'app.
 */
import { test, expect } from '@playwright/test';

test('app boots and displays scaffolding header', async ({ page }) => {
  await page.goto('/');

  // Header présent
  await expect(page.locator('.header h1')).toContainText('HYDRA');

  // Pas d'erreur console
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.waitForTimeout(500);
  expect(errors).toHaveLength(0);
});

test('bottom nav has 5 items', async ({ page }) => {
  await page.goto('/');
  const navItems = page.locator('.nav-item');
  await expect(navItems).toHaveCount(5);
});

test('manifest is served', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toContain('Hydra');
});
