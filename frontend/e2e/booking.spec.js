import { expect, test } from '@playwright/test';

// Run against an isolated database freshly populated by seed_demo.
test('candidate books, stale competitor sees conflict, employer sees booking, mobile is usable', async ({ browser }) => {
  const first = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  const second = await browser.newContext();
  const employer = await browser.newContext();
  const base = process.env.APP_URL || 'http://127.0.0.1:5173';
  async function login(context, username) {
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel('用户名', { exact: true }).fill(username);
    await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
    await page.getByRole('button', { name: '登录账号', exact: true }).click();
    await expect(page.getByRole('heading', { name: /你好/ })).toBeVisible();
    return page;
  }
  try {
    const a = await login(first, 'candidate1');
    const b = await login(second, 'candidate3');
    for (const page of [a, b]) {
      await page.getByRole('button', { name: '面试预约', exact: true }).click();
      await expect(page.getByRole('button', { name: /^预约 / }).first()).toBeVisible();
    }
    const [slot] = (await (await a.request.get(`${base}/api/booking-applications/`)).json()).data;
    const slots = (await (await a.request.get(`${base}/api/booking-applications/${slot.id}/slots/`)).json()).data;
    const response = a.waitForResponse((r) => r.url().endsWith('/api/bookings/') && r.request().method() === 'POST');
    await a.getByRole('button', { name: /^预约 / }).first().click();
    const created = await response;
    expect(created.status()).toBe(201);
    const booking = (await created.json()).data;
    expect(booking.slot_id).toBe(slots[0].id);
    await expect(a.getByRole('list', { name: '预约记录' })).toContainText('Backend Developer');
    await b.getByRole('button', { name: /^预约 / }).first().click();
    await expect(b.getByRole('alert')).toContainText('这个时段已被预约');
    expect((await b.request.get(`${base}/api/bookings/${booking.id}/`)).status()).toBe(403);
    await a.reload();
    await a.getByRole('button', { name: '面试预约', exact: true }).click();
    await expect(a.getByRole('list', { name: '预约记录' })).toContainText(`预约 #${booking.id}`);
    await a.screenshot({ path: 'test-results/booking-candidate-desktop.png', fullPage: true });
    await a.setViewportSize({ width: 390, height: 844 });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.screenshot({ path: 'test-results/booking-candidate-mobile.png', fullPage: true });
    const e = await login(employer, 'employer1');
    await expect(e.getByRole('list', { name: '预约记录' })).toContainText(`预约 #${booking.id}`);
    await e.getByRole('list', { name: '预约记录' }).screenshot({ path: 'test-results/booking-employer.png' });
  } finally {
    await first.close();
    await second.close();
    await employer.close();
  }
});
