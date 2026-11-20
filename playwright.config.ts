import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  retries: 0, // 재시도로 실패를 숨기지 않는다. 흔들리는 테스트는 판정 근거에 그대로 남긴다.
  reporter: [['list'], ['./scripts/verdict-reporter.mjs']],
  use: {
    // 기본 대상은 Docker로 띄운 Toolshop(npm run toolshop:up). 공개 사이트는 BASE_URL·API_URL로 지정한다.
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:4200',
    testIdAttribute: 'data-test',
    screenshot: 'only-on-failure',
    video: 'on', // 화면이 없는 CI에서도 실행 장면을 판정 근거로 남긴다
  },
});
