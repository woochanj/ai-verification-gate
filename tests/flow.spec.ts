import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { API, evidence, money, pickByStock } from './helpers';

// 로그인·주문은 Docker로 띄운 Toolshop(npm run toolshop:up)에서만 한다. 공개 사이트에는 주문을 만들지 않는다.
// 계정은 Toolshop 공식 저장소의 테스트용 시드 계정이다.
const USER = process.env.TOOLSHOP_USER ?? 'customer@practicesoftwaretesting.com';
const PASSWORD = process.env.TOOLSHOP_PASSWORD ?? 'welcome01';
const LANGS = ['de', 'el', 'en', 'es', 'fr', 'nl', 'tr'];
test.describe.configure({ timeout: 180_000 }); // 주문 전체 흐름, 7개 언어 반복이라 기본 30초로는 부족하다

const products = async (request: APIRequestContext) => (await (await request.get(`${API}/products`)).json()).data;

async function addToCart(page: Page, id: string, qty: number) {
  await page.goto(`/product/${id}`);
  for (let i = 1; i < qty; i++) await page.getByTestId('increase-quantity').click();
  await expect(page.getByTestId('quantity')).toHaveValue(String(qty));
  const badge = page.getByTestId('cart-quantity'); // 장바구니가 비어 있으면 배지가 없다
  const before = (await badge.count()) ? Number(await badge.innerText()) : 0;
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-quantity')).toHaveText(String(before + qty));
}

const cartRows = (page: Page) => page.locator('tbody tr').evaluateAll(trs => trs.map(tr => ({
  name: tr.querySelector('[data-test="product-title"]')!.textContent!.trim(),
  qty: Number((tr.querySelector('[data-test="product-quantity"]') as HTMLInputElement).value),
  unit: tr.querySelector('[data-test="product-price"]')!.textContent!,
  line: tr.querySelector('[data-test="line-price"]')!.textContent!,
})));

test('[C-FLOW-01] 로그인 고객의 주문 금액이 장바구니와 송장에서 같다', async ({ page, request }, info) => {
  const catalog = await products(request);
  pickByStock(catalog, true); // in_stock 필드 확인
  const [a, b] = catalog.filter((p: any) => p.in_stock);
  await page.goto('/auth/login');
  await page.getByTestId('email').fill(USER);
  await page.getByTestId('password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/account/);

  await addToCart(page, a.id, 2);
  await addToCart(page, b.id, 1);
  await page.getByTestId('nav-cart').click();
  await expect(page.getByTestId('cart-total')).toBeVisible();
  const cart = (await cartRows(page)).map(r => ({ ...r, unit: money(r.unit), line: money(r.line) }));
  const cartTotal = money(await page.getByTestId('cart-total').innerText());
  const sum = Math.round(cart.reduce((s, r) => s + r.unit * r.qty, 0) * 100) / 100;

  await page.getByTestId('proceed-1').click();
  await page.getByTestId('proceed-2').click();
  await page.getByTestId('country').selectOption({ index: 1 });
  await page.getByTestId('postal_code').fill('1010');
  await page.getByTestId('house_number').fill('1');
  await page.getByTestId('state').fill('Vienna');
  await page.getByTestId('proceed-3').click();
  await page.getByTestId('payment-method').selectOption('cash-on-delivery');
  await page.getByTestId('finish').click(); // 결제 확인
  await expect(page.getByText('Payment was successful')).toBeVisible();
  // 결제 확인 직후에는 확정 버튼이 바로 반응하지 않을 때가 있어, 송장 번호가 보일 때까지 누른다(최대 30초).
  const done = page.getByText(/invoice number is INV-\d+/);
  await expect(async () => {
    await page.getByTestId('finish').click();
    await expect(done).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  const invoiceNo = (await done.innerText()).match(/INV-\d+/)![0];

  const token = (await (await request.post(`${API}/users/login`, { data: { email: USER, password: PASSWORD } })).json()).access_token;
  const list = await (await request.get(`${API}/invoices`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const inv = (list.data ?? list).find((i: any) => i.invoice_number === invoiceNo);
  const invLines = (inv?.invoicelines ?? []).map((l: any) => ({ name: l.product?.name, qty: l.quantity, unit: l.unit_price }));

  await evidence(info, { invoiceNo, cart, cartTotal, sum, invoiceTotal: inv?.total, invLines });
  expect([cartTotal, sum, inv?.total]).toEqual([sum, sum, sum]);
  expect(invLines.map((l: any) => [l.name, l.qty, l.unit]).sort())
    .toEqual(cart.map(r => [r.name, r.qty, r.unit]).sort());
});

test('[C-I18N-01] 언어를 바꿔도 장바구니 금액과 수량이 같다', async ({ browser, request }, info) => {
  const p = pickByStock((await products(request)), true);
  const seen: Record<string, unknown> = {};
  for (const lang of LANGS) {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/');
    await page.getByTestId('language-select').click();
    await page.getByTestId(`lang-${lang}`).click();
    const shown = (await page.getByTestId('language-select').innerText()).trim().toLowerCase();
    await addToCart(page, p.id, 1);
    const badge = (await page.getByTestId('cart-quantity').innerText()).trim();
    await page.getByTestId('nav-cart').click();
    const line = money(await page.getByTestId('line-price').first().innerText());
    const total = money(await page.getByTestId('cart-total').innerText());
    seen[lang] = { shown, badge, line, total };
    await page.context().close();
  }
  await evidence(info, { product: p.name, byLanguage: seen });
  const en = seen.en as any;
  for (const lang of LANGS) {
    const s = seen[lang] as any;
    expect({ lang, shown: s.shown, badge: s.badge, line: s.line, total: s.total })
      .toEqual({ lang, shown: lang, badge: en.badge, line: en.line, total: en.total });
  }
});

test('[C-I18N-02] 언어를 바꿔도 품절 상품은 담을 수 없다', async ({ browser, request }, info) => {
  const p = pickByStock((await products(request)), false);
  test.skip(!p, '첫 페이지에 품절 상품이 없어 판정할 대상이 없다');
  const seen: Record<string, unknown> = {};
  for (const lang of LANGS) {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/');
    await page.getByTestId('language-select').click();
    await page.getByTestId(`lang-${lang}`).click();
    await page.goto(`/product/${p.id}`);
    const label = page.getByTestId('out-of-stock');
    await expect(label).toBeVisible();
    seen[lang] = { label: (await label.innerText()).trim(), buttonDisabled: await page.getByTestId('add-to-cart').isDisabled() };
    await page.context().close();
  }
  await evidence(info, { product: p.name, byLanguage: seen });
  for (const lang of LANGS) expect({ lang, disabled: (seen[lang] as any).buttonDisabled }).toEqual({ lang, disabled: true });
});
