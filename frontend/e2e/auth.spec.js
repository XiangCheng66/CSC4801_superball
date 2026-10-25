import { expect, test } from '@playwright/test';

test('PostgreSQL demo account logs in, persists across reload, checks role and logs out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.screenshot({ path: 'test-results/auth-desktop.png', fullPage: true });
  await page.getByLabel('用户名', { exact: true }).fill('candidate1');
  await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你好，Demo Candidate 1' })).toBeVisible();
  await expect(page.getByText('candidate1@example.test', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '你好，Demo Candidate 1' })).toBeVisible();
  await page.getByRole('button', { name: '检查身份权限' }).click();
  await expect(page.getByRole('status')).toHaveText('当前身份权限检查通过。');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  const me = await page.request.get('/api/auth/me/');
  expect(me.status()).toBe(401);
});

test('mobile login remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/auth-mobile.png', fullPage: true });
});

test('registration persists an employer and rejects a duplicate username', async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('显示名称', { exact: true }).fill('Browser Demo Employer');
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('身份', { exact: true }).selectOption('Employer');
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('heading', { name: '你好，Browser Demo Employer' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${username}@example.test`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}_other@example.test`);
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('alert')).toContainText('already registered');
});
