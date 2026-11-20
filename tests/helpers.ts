import type { TestInfo } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://127.0.0.1:8091';

// 판정 근거: 기준을 판정할 때 실제로 본 값을 남긴다. 리포터가 verdicts.json에 그대로 싣는다.
export const evidence = (info: TestInfo, data: unknown) =>
  info.attach('evidence', { body: JSON.stringify(data), contentType: 'application/json' });

// 재고 조건으로 상품을 고른다. API가 in_stock을 주지 않으면 TypeError 대신 계약 위반임을 밝히고 멈춘다.
export function pickByStock<T extends Record<string, any>>(products: T[], inStock: boolean): T | undefined {
  if (products.length && !('in_stock' in products[0]))
    throw new Error(`API 계약 위반: 상품 응답에 in_stock 필드가 없다(받은 필드: ${Object.keys(products[0]).join(', ')})`);
  return products.find(p => p.in_stock === inStock);
}

// 화면 가격 "$14.15" -> 14.15
export const money = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
