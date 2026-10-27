import { expect, test } from '@playwright/test';

async function register(page) {
  const username = `e2e_candidate_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('显示名称', { exact: true }).fill('Browser Candidate');
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('heading', { name: '你好，Browser Candidate' })).toBeVisible();
  await expect(page.getByLabel('技术技能')).toBeVisible();
  return (await (await page.request.get('/api/auth/me/')).json()).data;
}

async function put(context, path, data) {
  const csrf = await (await context.get('/api/auth/csrf/')).json();
  return context.put(path, { data, headers: { 'X-CSRFToken': csrf.data.csrfToken } });
}

test('candidate saves and reloads private raw text; direct cross-user access is forbidden', async ({ page, request }) => {
  const owner = await register(page);
  const raw = '  <script>alert(1)</script>\n中文经历与项目  ';
  await page.getByLabel('显示名称', { exact: true }).fill('Updated Browser Candidate');
  await page.getByLabel('技术技能').fill(' Python，SQL\npython');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你好，Updated Browser Candidate' })).toBeVisible();
  await page.getByLabel('文字简历').fill(raw);
  await page.getByRole('button', { name: '保存简历', exact: true }).click();
  await expect(page.getByText('简历已保存，仅你本人可以访问。')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('技术技能')).toHaveValue('python, sql');
  await expect(page.getByLabel('文字简历')).toHaveValue(raw);
  await page.getByText('纯文本预览').click();
  expect(await page.locator('.resume-preview pre').textContent()).toBe(raw);
  expect(await page.locator('.resume-preview script').count()).toBe(0);
  const profile = await (await page.request.get('/api/candidate/profile/')).json();
  expect(profile.data.resume_text).toBeUndefined();

  const username = `e2e_other_${Date.now()}`;
  const csrf = await (await request.get('/api/auth/csrf/')).json();
  const created = await request.post('/api/auth/register/', { headers: { 'X-CSRFToken': csrf.data.csrfToken }, data: { username, email: `${username}@example.test`, password: 'BrowserDemo!2026', role: 'Candidate' } });
  expect(created.status()).toBe(201);
  const other = (await created.json()).data;
  expect((await request.get(`/api/candidate/resumes/${owner.id}/`)).status()).toBe(403);
  expect((await put(request, `/api/candidate/resumes/${owner.id}/`, { resume_text: 'intrusion' })).status()).toBe(403);
  expect((await page.request.get(`/api/candidate/resumes/${other.id}/`)).status()).toBe(403);
  expect((await (await page.request.get('/api/candidate/resume/')).json()).data.resume_text).toBe(raw);
  await page.screenshot({ path: 'test-results/candidate-profile-desktop.png', fullPage: true });
});

test('recommendations use newly saved skills, retain zero-score jobs and fit a mobile screen', async ({ page }) => {
  await register(page);
  await page.getByLabel('技术技能').fill('Python');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByText('资料已保存。')).toBeVisible();
  await page.getByRole('button', { name: '岗位推荐', exact: true }).click();
  const backend = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '[DEMO-A2] Backend Developer', exact: true }) });
  const open = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '[DEMO-A2] Generalist', exact: true }) });
  await expect(backend.getByLabel('匹配分 50 分')).toBeVisible();
  await expect(open.getByLabel('匹配分 100 分')).toBeVisible();
  await backend.getByText('查看岗位描述').click();
  await expect(backend.getByText('Build reliable services with Python and SQL.')).toBeVisible();
  await page.getByRole('button', { name: '个人资料', exact: true }).click();
  await page.getByLabel('技术技能').fill('Rust');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByText('资料已保存。')).toBeVisible();
  await page.getByRole('button', { name: '岗位推荐', exact: true }).click();
  await expect(backend.getByLabel('匹配分 0 分')).toBeVisible();
  await page.getByRole('button', { name: '个人资料', exact: true }).click();
  await page.getByLabel('技术技能').fill('Python, SQL');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByText('资料已保存。')).toBeVisible();
  await page.getByRole('button', { name: '岗位推荐', exact: true }).click();
  await expect(backend.getByLabel('匹配分 100 分')).toBeVisible();
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText('[DEMO-A2] Backend Developer');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/candidate-jobs-mobile.png', fullPage: true });
});
