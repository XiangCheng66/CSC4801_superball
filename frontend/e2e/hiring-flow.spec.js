import { expect, test } from '@playwright/test';
import { beijingInput } from '../src/pages/scheduling/time.js';

async function register(page, role, name, stamp) {
  const username = `e2e_release_${role.toLowerCase()}_${stamp}`;
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('显示名称', { exact: true }).fill(name);
  await page.getByLabel('邮箱', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('密码', { exact: true }).fill('BrowserDemo!2026');
  await page.getByLabel('身份', { exact: true }).selectOption(role);
  await page.getByRole('button', { name: '创建账号并登录' }).click();
  await expect(page.getByRole('heading', { name: `你好，${name}` })).toBeVisible();
}

test('fresh applicants reach an interview through the combined A, B and C workflows', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const title = `Hiring Flow ${stamp}`;
  const candidateName = 'Release Candidate';
  const privateResume = 'Private resume for this candidate only';
  await register(page, 'Employer', 'Release Employer', stamp);
  await page.getByLabel('公司名称').fill('Release Company');
  await page.getByLabel('公司简介').fill('Verified hiring workflow');
  await page.getByRole('button', { name: '保存公司资料' }).click();
  await expect(page.getByText('公司资料已保存。')).toBeVisible();
  await page.getByLabel('岗位标题', { exact: true }).fill(title);
  await page.getByLabel('岗位描述', { exact: true }).fill('Build reliable services.');
  await page.getByLabel('技能要求（逗号分隔，可留空）').fill('Python, SQL');
  const jobCreated = page.waitForResponse((r) => r.url().endsWith('/api/employer/jobs/') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '发布岗位' }).click();
  const jobResponse = await jobCreated;
  expect(jobResponse.status()).toBe(201);
  const { data: job } = await jobResponse.json();
  await expect(page.getByLabel('所属岗位').getByRole('option', { name: title })).toHaveCount(1);
  await page.getByLabel('所属岗位').selectOption(String(job.id));
  const start = new Date(Date.now() + 2 * 24 * 60 * 60_000);
  start.setUTCSeconds(0, 0);
  await page.getByLabel('开始时间（北京时间）').fill(beijingInput(start));
  const slotCreated = page.waitForResponse((r) => r.url().endsWith('/api/slots/') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '创建时段' }).click();
  expect((await slotCreated).status()).toBe(201);

  const candidateContext = await browser.newContext({ baseURL: new URL(page.url()).origin, timezoneId: 'America/Los_Angeles' });
  try {
    const candidate = await candidateContext.newPage();
    await register(candidate, 'Candidate', candidateName, stamp);
    await candidate.getByLabel('技术技能').fill('Python, SQL');
    await candidate.getByRole('button', { name: '保存资料' }).click();
    await expect(candidate.getByText('资料已保存。')).toBeVisible();
    await candidate.getByLabel('文字简历').fill(privateResume);
    await candidate.getByRole('button', { name: '保存简历' }).click();
    await expect(candidate.getByText('简历已保存，仅你本人可以访问。')).toBeVisible();
    await candidate.getByRole('button', { name: '岗位推荐', exact: true }).click();
    const card = candidate.getByRole('article').filter({ has: candidate.getByRole('heading', { name: title, exact: true }) });
    await expect(card.getByLabel('匹配分 100 分')).toBeVisible();
    await card.getByRole('button', { name: '投递岗位' }).click();
    await expect(card.getByText('Pending · 待处理')).toBeVisible();

    const jobRow = page.locator('.employer-workspace li').filter({ has: page.getByText(title, { exact: true }) });
    await jobRow.getByRole('button', { name: '申请人', exact: true }).click();
    const state = page.getByLabel(`${candidateName} 的申请状态`);
    await expect(state).toHaveValue('Pending');
    const applicants = await page.request.get(`/api/employer/jobs/${job.id}/applicants/`);
    expect(applicants.status()).toBe(200);
    expect(await applicants.text()).not.toContain(privateResume);
    const markInterviewing = page.waitForResponse((r) => r.url().endsWith('/status/') && r.request().method() === 'PATCH');
    await state.selectOption('Interviewing');
    expect((await markInterviewing).status()).toBe(200);

    await candidate.getByRole('button', { name: '我的申请', exact: true }).click();
    await expect(card.getByText('Interviewing · 面试中')).toBeVisible();
    await candidate.getByRole('button', { name: '面试预约', exact: true }).click();
    const booked = candidate.waitForResponse((r) => r.url().endsWith('/api/bookings/') && r.request().method() === 'POST');
    await candidate.getByRole('button', { name: /^预约 / }).click();
    const bookingResponse = await booked;
    expect(bookingResponse.status()).toBe(201);
    const { data: booking } = await bookingResponse.json();
    await expect(candidate.getByRole('list', { name: '预约记录' })).toContainText(`预约 #${booking.id}`);

    await page.reload();
    await expect(page.getByRole('list', { name: '预约记录' })).toContainText(`预约 #${booking.id}`);
    await jobRow.getByRole('button', { name: '申请人', exact: true }).click();
    await expect(jobRow.getByText(/^面试：/)).toBeVisible();
    const reject = page.waitForResponse((r) => r.url().endsWith('/status/') && r.request().method() === 'PATCH');
    await state.selectOption('Rejected');
    expect((await reject).status()).toBe(200);
    await candidate.getByRole('button', { name: '我的申请', exact: true }).click();
    await expect(card.getByText('Rejected · 已拒绝')).toBeVisible();
    await expect(card.getByText(`预约编号 #${booking.id} · 时段 #${booking.slot_id}`)).toBeVisible();
    await expect(card.getByText('北京时间（UTC+8）')).toBeVisible();
    await candidate.setViewportSize({ width: 390, height: 844 });
    expect(await candidate.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await candidate.screenshot({ path: 'test-results/hiring-flow-mobile.png', fullPage: true });
  } finally { await candidateContext.close(); }
});
