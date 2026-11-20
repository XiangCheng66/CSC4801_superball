import { defineConfig } from '@playwright/test';

const baseURL = process.env.APP_URL || 'http://127.0.0.1:5173';
const languageTest = '**/language.spec.js';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'language', testMatch: languageTest },
    {
      name: 'workflows-zh',
      testIgnore: languageTest,
      use: {
        storageState: {
          cookies: [],
          origins: [{
            origin: new URL(baseURL).origin,
            localStorage: [{ name: 'superball.language', value: 'zh' }],
          }],
        },
      },
    },
  ],
});
