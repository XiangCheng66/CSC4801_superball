import { expect, test } from '@playwright/test';

// Depends on seed_demo: employer1 owns "[DEMO-A2] Backend Developer" with
// candidate1 (Interviewing, 100) and candidate3 (Interviewing, 0).
test('employer reviews ranked applicants and changes a status', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('用户名', { exact: true }).fill('employer1');
  await page.getByLabel('密码', { exact: true }).fill('LocalDemo!2026');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你好，Demo Employer 1' })).toBeVisible();

  // Make the case repeatable: a previous run may have left candidate3 accepted.
  const jobs = (await (await page.request.get('/api/employer/jobs/')).json()).data;
  const job = jobs.find((row) => row.title.includes('Backend Developer'));
  const csrf = (await (await page.request.get('/api/auth/csrf/')).json()).data.csrfToken;
  const applicants = (await (await page.request.get(`/api/employer/jobs/${job.id}/applicants/`)).json()).data;
  const target = applicants.find((row) => row.display_name === 'Demo Candidate 3');
  await page.request.patch(`/api/employer/applications/${target.id}/status/`, {
    data: { status: 'Interviewing' },
    headers: { 'X-CSRFToken': csrf },
  });

  const jobRow = page.locator('li').filter({ hasText: '[DEMO-A2] Backend Developer' });
  await jobRow.getByRole('button', { name: '申请人', exact: true }).click();

  const panel = jobRow.getByRole('list', { name: '[DEMO-A2] Backend Developer 的申请人' });
  await expect(panel.getByRole('listitem')).toHaveCount(2);

  const rows = panel.getByRole('listitem');
  await expect(rows.first()).toContainText('Demo Candidate 1');
  await expect(rows.first()).toContainText('匹配分 100');
  await expect(rows.nth(1)).toContainText('Demo Candidate 3');
  await expect(rows.nth(1)).toContainText('匹配分 0');

  await page.screenshot({ path: 'test-results/employer-applicants.png', fullPage: true });

  const status = page.getByLabel('Demo Candidate 3 的申请状态');
  await expect(status).toHaveValue('Interviewing');
  await status.selectOption('Accepted');
  await expect(page.getByText('已将「Demo Candidate 3」设为已录用。')).toBeVisible();
  await expect(status).toHaveValue('Accepted');

  await page.reload();
  await expect(page.getByRole('heading', { name: '你好，Demo Employer 1' })).toBeVisible();
  await page.locator('li').filter({ hasText: '[DEMO-A2] Backend Developer' })
    .getByRole('button', { name: '申请人', exact: true }).click();
  await expect(page.getByLabel('Demo Candidate 3 的申请状态')).toHaveValue('Accepted');
  // Restore the seeded status for the separate booking contention test.
  const restored = await page.request.patch(`/api/employer/applications/${target.id}/status/`, {
    data: { status: target.status }, headers: { 'X-CSRFToken': csrf },
  });
  expect(restored.status()).toBe(200);
});
