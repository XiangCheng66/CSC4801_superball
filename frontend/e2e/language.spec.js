import { expect, test } from '@playwright/test';

test('language toggle switches the whole page and survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await expect(page.getByText('CSC4801 · 招聘与求职')).toBeVisible();
  await page.screenshot({ path: 'test-results/lang-zh.png', fullPage: true });

  await page.getByRole('button', { name: '切换到英文' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('CSC4801 · Recruiting & Matching')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/lang-en.png', fullPage: true });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
});

test('employer workspace renders in English with product names untouched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '切换到英文' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('employer1');
  await page.getByLabel('Password', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Hello, Demo Employer 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Company and postings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save company' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // Seeded company and job titles are data, not interface copy.
  await expect(page.getByLabel('Company name')).toHaveValue('Superball Labs');
  await expect(page.getByText('[DEMO-A2] Backend Developer').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/lang-en-employer.png', fullPage: true });
});
