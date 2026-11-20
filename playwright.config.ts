import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  retries: 0, // 재시도로 실패를 숨기지 않는다. 흔들리는 테스트는 판정 근거에 그대로 남긴다.
  reporter: [['list'], ['./scripts/verdict-reporter.mjs']],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://practicesoftwaretesting.com',
    testIdAttribute: 'data-test',
    screenshot: 'only-on-failure',
  },
});
