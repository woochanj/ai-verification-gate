import type { TestInfo } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://127.0.0.1:8091';

// 판정 근거: 기준을 판정할 때 실제로 본 값을 남긴다. 리포터가 verdicts.json에 그대로 싣는다.
export const evidence = (info: TestInfo, data: unknown) =>
  info.attach('evidence', { body: JSON.stringify(data), contentType: 'application/json' });

// 화면 가격 "$14.15" -> 14.15
export const money = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
