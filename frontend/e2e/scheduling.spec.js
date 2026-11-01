import { expect, test } from '@playwright/test';
import { beijingInput, formatTime } from '../src/pages/scheduling/time.js';

// Verify that the page's explicit Beijing time does not depend on browser locale.
test.use({ timezoneId: 'America/Los_Angeles' });

async function login(page, username) {
  await page.goto('/');
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '面试时段', exact: true })).toBeVisible();
}

test('employer creates, reloads and deletes a persisted half-hour slot', async ({ page }) => {
  await login(page, 'employer1');
  await page.getByLabel('所属岗位').selectOption({ label: '[Local demo] Interview availability' });
  const start = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  start.setUTCSeconds(0, 0);
  await page.getByLabel('开始时间（北京时间）').fill(beijingInput(start));
  const created = page.waitForResponse((response) => response.url().endsWith('/api/slots/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建时段', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { data: slot } = await response.json();
  expect(new Date(slot.start_at).getTime()).toBe(start.getTime());
  expect(new Date(slot.end_at) - new Date(slot.start_at)).toBe(30 * 60_000);
  await page.reload();
  const row = page.getByRole('listitem').filter({ has: page.getByText(formatTime(slot.start_at), { exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('可预约', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/scheduling-desktop.png', fullPage: true });
  await row.getByRole('button', { name: /删除时段/ }).click();
  await row.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('时段已删除。', { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/slots/${slot.id}/`)).status()).toBe(404);
});

test('mobile management is usable and employers cannot read each other’s slots', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'employer1');
  await expect(page.getByLabel('所属岗位')).toBeVisible();
  await expect(page.getByRole('list', { name: '我的面试时段' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/scheduling-mobile.png', fullPage: true });
  const { data: slots } = await (await page.request.get('/api/slots/')).json();
  expect(slots.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await login(page, 'employer2');
  await expect(page.getByText(/你还没有岗位/)).toBeVisible();
  expect((await (await page.request.get('/api/slots/')).json()).data).toEqual([]);
  expect((await page.request.get(`/api/slots/${slots[0].id}/`)).status()).toBe(403);
});
