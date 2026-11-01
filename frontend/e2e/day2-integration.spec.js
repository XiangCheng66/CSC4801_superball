import { expect, test } from '@playwright/test';
import { beijingInput } from '../src/pages/scheduling/time.js';

async function register(page, suffix, role, displayName) {
  const username = `e2e_abc_${suffix}_${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('显示名称', { exact: true }).fill(displayName);
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('身份', { exact: true }).selectOption(role);
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('heading', { name: `你好，${displayName}` })).toBeVisible();
}

test('employer jobs feed candidate recommendations and real slots protect deletion across A/B/C', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await register(page, 'employer', 'Employer', 'Integrated Employer');
  await page.getByLabel('公司名称').fill('Integrated Company');
  await page.getByLabel('公司简介').fill('A B C working together.');
  await page.getByRole('button', { name: '保存公司资料' }).click();
  await expect(page.getByText('公司资料已保存。')).toBeVisible();
  const title = `E2E Integrated Role ${Date.now()}`;
  await page.getByLabel('岗位标题', { exact: true }).fill(title);
  await page.getByLabel('岗位描述', { exact: true }).fill('A real role shared by all three modules.');
  await page.getByLabel('技能要求（逗号分隔，可留空）').fill('Python, SQL');
  const createdJob = page.waitForResponse((response) => response.url().endsWith('/api/employer/jobs/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '发布岗位', exact: true }).click();
  const { data: job } = await (await createdJob).json();
  await expect(page.getByLabel('所属岗位').getByRole('option', { name: title, exact: true })).toHaveCount(1);
  await page.getByLabel('所属岗位').selectOption(String(job.id));
  const start = new Date(Date.now() + 3 * 24 * 60 * 60_000);
  start.setUTCSeconds(0, 0);
  await page.getByLabel('开始时间（北京时间）').fill(beijingInput(start));
  const createdSlot = page.waitForResponse((response) => response.url().endsWith('/api/slots/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '创建时段', exact: true }).click();
  expect((await createdSlot).status()).toBe(201);
  const jobRow = page.locator('.employer-workspace li').filter({ has: page.getByText(title, { exact: true }) });
  await jobRow.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByText('该岗位仍有申请或面试时段，无法删除。')).toBeVisible();
  await expect(jobRow).toHaveCount(1);

  const candidateContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const candidate = await candidateContext.newPage();
    await register(candidate, 'candidate', 'Candidate', 'Integrated Candidate');
    await candidate.getByLabel('技术技能').fill('Python');
    await candidate.getByRole('button', { name: '保存资料', exact: true }).click();
    await expect(candidate.getByText('资料已保存。')).toBeVisible();
    await candidate.getByRole('button', { name: '岗位推荐', exact: true }).click();
    const recommendation = candidate.getByRole('article').filter({ has: candidate.getByRole('heading', { name: title, exact: true }) });
    await expect(recommendation.getByLabel('匹配分 50 分')).toBeVisible();
    await expect(recommendation.getByText('Integrated Company')).toBeVisible();
    await jobRow.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByLabel('编辑技能要求').fill('Rust');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText(`已更新「${title}」。`)).toBeVisible();
    await candidate.getByRole('button', { name: '个人资料', exact: true }).click();
    await candidate.getByRole('button', { name: '岗位推荐', exact: true }).click();
    await expect(recommendation.getByLabel('匹配分 0 分')).toBeVisible();
    const slotRow = page.getByRole('list', { name: '我的面试时段' }).getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });
    await slotRow.getByRole('button', { name: /删除时段/ }).click();
    await slotRow.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(slotRow).toHaveCount(0);
    await jobRow.getByRole('button', { name: '删除', exact: true }).click();
    await expect(jobRow).toHaveCount(0);
    await candidate.getByRole('button', { name: '个人资料', exact: true }).click();
    await candidate.getByRole('button', { name: '岗位推荐', exact: true }).click();
    await expect(recommendation).toHaveCount(0);
    expect((await page.request.get(`/api/employer/jobs/${job.id}/`)).status()).toBe(404);
  } finally { await candidateContext.close(); }
});
