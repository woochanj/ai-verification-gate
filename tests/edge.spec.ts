import { test, expect, type APIRequestContext } from '@playwright/test';
import { API, evidence } from './helpers';

// 예외·경계·권한 기준. 로그인·장바구니·삭제 요청은 Docker로 띄운 Toolshop에만 보낸다.
const CUSTOMER = { email: 'customer@practicesoftwaretesting.com', password: 'welcome01' };
const CUSTOMER2 = { email: 'customer2@practicesoftwaretesting.com', password: 'welcome01' };

const json = async (r: Awaited<ReturnType<APIRequestContext['get']>>) => (r.ok() ? r.json() : null);
const login = (request: APIRequestContext, u: { email: string; password: string }) =>
  request.post(`${API}/users/login`, { data: u });

test('[C-EDGE-01] 상세 화면 수량은 1 아래로 내려가지 않는다', async ({ page, request }, info) => {
  const p = (await json(await request.get(`${API}/products`))).data.find((x: any) => x.in_stock);
  await page.goto(`/product/${p.id}`);
  const qty = page.getByTestId('quantity');
  await page.getByTestId('increase-quantity').click();
  await page.getByTestId('increase-quantity').click();
  const up = await qty.inputValue();
  for (let i = 0; i < 4; i++) await page.getByTestId('decrease-quantity').click();
  const down = await qty.inputValue();
  await evidence(info, { product: p.name, afterPlus2: up, afterMinus4: down });
  expect([up, down]).toEqual(['3', '1']);
});

test('[C-EDGE-02] 검색 결과가 없으면 결과 없음을 알린다', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('search-query').fill('zzzzqq');
  await page.getByTestId('search-submit').click();
  const message = page.getByTestId('no-results');
  await message.waitFor({ timeout: 10_000 }).catch(() => {});
  const cards = await page.getByTestId('product-name').count();
  const text = (await message.count()) ? (await message.innerText()).trim() : null;
  await evidence(info, { query: 'zzzzqq', cards, message: text });
  expect({ cards, text }).toEqual({ cards: 0, text: 'There are no products found.' });
});

test('[C-EDGE-03] 가격 범위 필터는 범위 안의 상품만 돌려준다', async ({ request }, info) => {
  const first = await json(await request.get(`${API}/products?between=price,10,20`));
  const prices: number[] = [];
  for (let page = 1; page <= (first?.last_page ?? 0); page++) {
    const body = await json(await request.get(`${API}/products?between=price,10,20&page=${page}`));
    prices.push(...body.data.map((p: any) => p.price));
  }
  const outside = prices.filter(v => v < 10 || v > 20);
  await evidence(info, { total: first?.total, checked: prices.length, min: Math.min(...prices), max: Math.max(...prices), outside });
  expect(prices.length).toBeGreaterThan(0);
  expect(outside).toEqual([]);
});

test('[C-EDGE-04] 마지막 페이지의 상품 수가 전체 수와 맞다', async ({ request }, info) => {
  const first = await json(await request.get(`${API}/products`));
  const last = await json(await request.get(`${API}/products?page=${first.last_page}`));
  const expected = first.total - first.per_page * (first.last_page - 1);
  await evidence(info, { total: first.total, perPage: first.per_page, lastPage: first.last_page, expected, actual: last.data.length });
  expect(last.data.length).toBe(expected);
});

test('[C-EDGE-05] 장바구니에 수량 0·음수를 담을 수 없다', async ({ request }, info) => {
  const p = (await json(await request.get(`${API}/products`))).data.find((x: any) => x.in_stock);
  const cart = await (await request.post(`${API}/carts`)).json();
  const add = (quantity: number) => request.post(`${API}/carts/${cart.id}`, { data: { product_id: p.id, quantity } });
  const zero = (await add(0)).status();
  const negative = (await add(-1)).status();
  await evidence(info, { product: p.name, status: { quantity0: zero, quantityMinus1: negative } });
  expect({ zero: zero >= 400 && zero < 500, negative: negative >= 400 && negative < 500 }).toEqual({ zero: true, negative: true });
});

test('[C-EDGE-06] 로그인 양식은 잘못된 형식을 막는다', async ({ page }, info) => {
  await page.goto('/auth/login');
  await page.getByTestId('email').fill('abc');
  await page.getByTestId('password').fill('x');
  await page.getByTestId('login-submit').click();
  const errors = {
    email: (await page.getByTestId('email-error').innerText().catch(() => '')).trim(),
    password: (await page.getByTestId('password-error').innerText().catch(() => '')).trim(),
  };
  await evidence(info, { input: { email: 'abc', password: 'x' }, errors, url: page.url() });
  expect(errors.email).toContain('Email format is invalid');
  expect(errors.password).toContain('Password length is invalid');
  expect(page.url()).toContain('/auth/login');
});

test('[C-EDGE-07] 비밀번호를 한 번 틀려도 계정이 잠기지 않는다', async ({ request }, info) => {
  const wrong = await login(request, { email: CUSTOMER2.email, password: 'wrong-password' });
  const right = await login(request, CUSTOMER2);
  const token = (await json(right))?.access_token;
  await evidence(info, { wrongStatus: wrong.status(), rightStatus: right.status(), gotToken: !!token });
  expect(wrong.status()).toBe(401);
  expect(!!token).toBe(true);
});

test('[C-EDGE-08] 문의 양식은 필수값이 비면 보내지 않는다', async ({ page }, info) => {
  await page.goto('/contact');
  await page.getByTestId('contact-submit').click();
  const fields = ['first-name', 'last-name', 'email', 'subject', 'message'];
  const errors: Record<string, string> = {};
  for (const f of fields) errors[f] = (await page.getByTestId(`${f}-error`).innerText({ timeout: 2_000 }).catch(() => '')).trim();
  const thanks = await page.getByText(/Thanks for your message/i).count();
  await evidence(info, { errors, thanksShown: thanks > 0 });
  expect(fields.filter(f => !errors[f])).toEqual([]);
  expect(thanks).toBe(0);
});

test('[C-SEC-01] 고객은 자기 송장만 조회한다', async ({ request }, info) => {
  const token = (await json(await login(request, CUSTOMER)))?.access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const me = await json(await request.get(`${API}/users/me`, { headers }));
  const list = await json(await request.get(`${API}/invoices`, { headers }));
  const owners = [...new Set((list?.data ?? list ?? []).map((i: any) => i.user_id))];
  await evidence(info, { me: me?.id, invoices: (list?.data ?? list ?? []).length, owners });
  expect(owners.filter(o => o !== me?.id)).toEqual([]);
});

test('[C-SEC-02] 로그인하지 않으면 상품을 삭제할 수 없다', async ({ request }, info) => {
  const p = (await json(await request.get(`${API}/products?page=2`))).data[0];
  const del = await request.delete(`${API}/products/${p.id}`);
  const after = await request.get(`${API}/products/${p.id}`);
  await evidence(info, { product: p.name, deleteStatus: del.status(), getAfterDelete: after.status() });
  expect([401, 403]).toContain(del.status());
  expect(after.status()).toBe(200);
});
