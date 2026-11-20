import { test, expect } from '@playwright/test';
import { API, evidence } from './helpers';

test('[C-API-01] 상품 목록 API가 가격이 있는 상품을 돌려준다', async ({ request }, info) => {
  const res = await request.get(`${API}/products`);
  const body = res.ok() ? await res.json() : null;
  const bad = (body?.data ?? []).filter((p: any) => !p.id || !p.name || !(p.price > 0));
  await evidence(info, { status: res.status(), count: body?.data?.length, bad });
  expect(res.status()).toBe(200);
  expect(bad).toEqual([]);
});

test('[C-API-02] 검색 API는 검색어가 이름에 들어간 상품만 돌려준다', async ({ request }, info) => {
  const body = await (await request.get(`${API}/products/search?q=pliers`)).json();
  const names: string[] = body.data.map((p: any) => p.name);
  const off = names.filter(n => !n.toLowerCase().includes('pliers'));
  await evidence(info, { names, off });
  expect(names.length).toBeGreaterThan(0);
  expect(off).toEqual([]);
});

test('[C-API-03] 없는 상품 조회는 404를 돌려준다', async ({ request }, info) => {
  const res = await request.get(`${API}/products/00000000000000000000000000`);
  await evidence(info, { status: res.status() });
  expect(res.status()).toBe(404);
});

test('[C-API-04] 상품 API는 재고 여부만 알리고 재고 수량은 드러내지 않는다', async ({ request }, info) => {
  const data = (await (await request.get(`${API}/products`)).json()).data;
  const noInStock = data.filter((p: any) => typeof p.in_stock !== 'boolean').map((p: any) => p.name);
  const stockExposed = data.filter((p: any) => 'stock' in p).map((p: any) => p.name);
  await evidence(info, { checked: data.length, noInStock, stockExposed });
  expect({ noInStock, stockExposed }).toEqual({ noInStock: [], stockExposed: [] });
});
