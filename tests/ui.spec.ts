import { test, expect, type APIRequestContext } from '@playwright/test';
import { API, evidence, money, pickByStock } from './helpers';

const products = async (request: APIRequestContext, path = '/products') =>
  (await (await request.get(`${API}${path}`)).json()).data;

test('[C-UI-01] 화면 검색 결과가 검색 API 결과와 같다', async ({ page, request }, info) => {
  const apiNames = (await products(request, '/products/search?q=pliers')).map((p: any) => p.name).sort();
  await page.goto('/');
  await page.getByTestId('search-query').fill('pliers');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('search-caption')).toContainText('pliers');
  await expect(page.getByTestId('product-name')).toHaveCount(apiNames.length);
  const uiNames = (await page.getByTestId('product-name').allInnerTexts()).map(s => s.trim()).sort();
  await evidence(info, { uiNames, apiNames });
  expect(uiNames).toEqual(apiNames);
});

test('[C-UI-02] 목록 화면 가격이 API 가격과 같다', async ({ page, request }, info) => {
  const api = new Map((await products(request)).map((p: any) => [String(p.id), p.price])); // 화면 링크의 id는 문자열
  await page.goto('/');
  await expect(page.getByTestId('product-name').first()).toBeVisible();
  const cards = await page.locator('a.card').evaluateAll(as => as.map(a => ({
    id: a.getAttribute('href')!.split('/').pop()!,
    price: a.querySelector('[data-test="product-price"]')!.textContent!,
  })));
  const diff = cards.map(c => ({ id: c.id, ui: money(c.price), api: api.get(c.id) })).filter(c => c.ui !== c.api);
  await evidence(info, { checked: cards.length, diff });
  expect(cards.length).toBeGreaterThan(0);
  expect(diff).toEqual([]);
});

test('[C-UI-03] 상세 화면 가격이 API 가격과 같다', async ({ page, request }, info) => {
  const p = pickByStock((await products(request)), true);
  await page.goto(`/product/${p.id}`);
  const ui = money(await page.getByTestId('unit-price').innerText());
  await evidence(info, { id: p.id, name: p.name, ui, api: p.price });
  expect(ui).toBe(p.price);
});

test('[C-UI-04] 장바구니에 담은 수량과 금액이 맞다', async ({ page, request }, info) => {
  const p = pickByStock((await products(request)), true);
  await page.goto(`/product/${p.id}`);
  const unit = money(await page.getByTestId('unit-price').innerText());
  await page.getByTestId('add-to-cart').click();
  const badgeEl = page.getByTestId('cart-quantity');
  await expect(badgeEl).toBeVisible();
  const badge = (await badgeEl.innerText()).trim();
  await page.getByTestId('nav-cart').click();
  const line = money(await page.getByTestId('line-price').first().innerText());
  const total = money(await page.getByTestId('cart-total').innerText());
  await evidence(info, { product: p.name, unit, badge, line, total });
  expect([badge, line, total]).toEqual(['1', unit, unit]);
});

test('[C-UI-05] 품절 상품은 장바구니에 담을 수 없다', async ({ page, request }, info) => {
  const p = pickByStock((await products(request)), false);
  test.skip(!p, '첫 페이지에 품절 상품이 없어 판정할 대상이 없다');
  await page.goto(`/product/${p.id}`);
  const label = page.getByTestId('out-of-stock');
  const button = page.getByTestId('add-to-cart');
  await expect(label).toBeVisible();
  await evidence(info, { product: p.name, label: await label.innerText(), buttonDisabled: await button.isDisabled() });
  await expect(button).toBeDisabled();
});

test('[C-UI-06] 가격 낮은 순 정렬이 맞다', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByTestId('product-name').first()).toBeVisible();
  const before = await page.getByTestId('product-price').allInnerTexts();
  await page.getByTestId('sort').selectOption('price,asc');
  await expect.poll(() => page.getByTestId('product-price').allInnerTexts()).not.toEqual(before);
  const prices = (await page.getByTestId('product-price').allInnerTexts()).map(money);
  const breaks = prices.flatMap((v, i) => (i && v < prices[i - 1] ? [{ at: i, prev: prices[i - 1], v }] : []));
  await evidence(info, { prices, breaks });
  expect(breaks).toEqual([]);
});
