import { expect, test } from '@playwright/test';

async function register(page, suffix) {
  const username = `e2e_a3_${suffix}_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('显示名称', { exact: true }).fill('Day 3 Candidate');
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('heading', { name: '你好，Day 3 Candidate' })).toBeVisible();
}

async function csrf(request) {
  return { 'X-CSRFToken': (await (await request.get('/api/auth/csrf/')).json()).data.csrfToken };
}

test('candidate applies from real recommendations and sees the persisted Pending application on desktop and phone', async ({ page, request }) => {
  expect((await request.post('/api/auth/login/', { headers: await csrf(request), data: { username: 'employer1', password: 'LocalDemo!2026' } })).status()).toBe(200);
  const title = `<script>alert(1)</script> A3 ${Date.now()}`;
  const created = await request.post('/api/employer/jobs/', {
    headers: await csrf(request), data: { title, description: '<script>alert(1)</script>', required_skills: ['Python'] },
  });
  expect(created.status()).toBe(201);
  const job = (await created.json()).data;
  await register(page, 'ui');
  await page.getByRole('button', { name: '岗位推荐', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await card.getByRole('button', { name: '投递岗位', exact: true }).click();
  await expect(card.getByText('Pending · 待处理')).toBeVisible();
  await expect(card.getByRole('button', { name: '投递岗位', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '我的申请', exact: true }).click();
  await expect(card.getByText('Pending · 待处理')).toBeVisible();
  await expect(card.getByText('尚无面试预约。')).toBeVisible();
  await card.getByText('查看岗位描述').click();
  expect(await card.locator('.job-description').textContent()).toBe('<script>alert(1)</script>');
  expect(await card.locator('script').count()).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: '我的申请', exact: true }).click();
  await expect(card.getByText('Pending · 待处理')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/candidate-applications-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(card.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/candidate-applications-mobile.png', fullPage: true });
  expect((await request.delete(`/api/employer/jobs/${job.id}/`, { headers: await csrf(request) })).status()).toBe(409);
});

test('parallel duplicate submissions create one application and direct foreign IDs remain forbidden', async ({ page, browser }) => {
  await register(page, 'race');
  const jobs = (await (await page.request.get('/api/candidate/recommendations/')).json()).data;
  const job = jobs.find((row) => row.title === '[DEMO-A2] Generalist');
  const headers = await csrf(page.request);
  const responses = await Promise.all([1, 2].map(() => page.request.post('/api/applications/', { headers, data: { job_id: job.id } })));
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  const rows = (await (await page.request.get('/api/applications/')).json()).data;
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('Pending');
  expect((await page.request.patch(`/api/applications/${rows[0].id}/`, { headers, data: { status: 'Accepted' } })).status()).toBe(405);
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    await register(other, 'other');
    expect((await other.request.get(`/api/applications/${rows[0].id}/`)).status()).toBe(403);
    expect((await other.request.patch(`/api/applications/${rows[0].id}/`, { headers: await csrf(other.request), data: { status: 'Accepted' } })).status()).toBe(403);
    await other.getByRole('button', { name: '我的申请', exact: true }).click();
    await expect(other.getByText('你还没有投递岗位。')).toBeVisible();
  } finally { await otherContext.close(); }
  await page.reload();
  await page.getByRole('button', { name: '岗位推荐', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: job.title, exact: true }) });
  await expect(card.getByText('Pending · 待处理')).toBeVisible();
  await expect(card.getByRole('button', { name: '投递岗位', exact: true })).toHaveCount(0);
});
