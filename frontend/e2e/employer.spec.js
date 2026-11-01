import { expect, test } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);
const title = `E2E Engineer ${stamp}`;
const renamed = `E2E Senior Engineer ${stamp}`;

test('employer maintains the company profile and job postings', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('用户名', { exact: true }).fill('employer1');
  await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();

  await expect(page.getByRole('heading', { name: '你好，Demo Employer 1' })).toBeVisible();

  await page.getByLabel('公司名称').fill('Superball Labs');
  await page.getByLabel('公司简介').fill('We build matching tools.');
  await page.getByRole('button', { name: '保存公司资料' }).click();
  await expect(page.getByText('公司资料已保存。')).toBeVisible();

  await page.getByLabel('岗位标题').fill(title);
  await page.getByLabel('岗位描述').fill('Own the matching pipeline end to end.');
  await page.getByLabel('技能要求（逗号分隔，可留空）').fill('Python, SQL, python');
  await page.getByRole('button', { name: '发布岗位' }).click();
  await expect(page.getByText(`已发布「${title}」。`)).toBeVisible();
  await expect(page.getByText('技能：Python、SQL')).toBeVisible();

  const row = page.locator('li', { hasText: title });
  await row.getByRole('button', { name: '编辑' }).click();
  await page.getByLabel('编辑岗位标题').fill(renamed);
  await page.getByLabel('编辑技能要求').fill('Go');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText(`已更新「${renamed}」。`)).toBeVisible();

  await page.screenshot({ path: 'test-results/employer-workspace.png', fullPage: true });

  const updated = page.locator('li', { hasText: renamed });
  await updated.getByRole('button', { name: '删除' }).click();
  await expect(page.getByText(`已删除「${renamed}」。`)).toBeVisible();
  await expect(page.locator('li', { hasText: renamed })).toHaveCount(0);
});

test('employer workspace stays usable on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('用户名', { exact: true }).fill('employer1');
  await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你好，Demo Employer 1' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/employer-mobile.png', fullPage: true });
});
