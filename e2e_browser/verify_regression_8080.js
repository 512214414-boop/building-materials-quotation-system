/**
 * v11.18 综合回归（生产版 8080）：
 *  1. 产品列：编辑态 input 撑满 + 输入关键词面板候选 + 点候选行选品回填
 *  2. 单位列：编辑态 input 撑满 + 箭头展开面板稳定
 *  3. 数量列：number 编辑态 input 可用
 */
const { chromium } = require('playwright');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
async function login(browser, viewport) {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const page = await browser.newPage({ viewport });
  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  return { page, token };
}
async function openPurchaseQuote(page) {
  await page.locator('button:has-text("订单协同工作台")').first().click();
  await sleep(2000);
  const docLink = page.locator('a').filter({ hasText: '生产冒烟验证' }).first();
  if (await docLink.count() > 0) await docLink.click();
  await sleep(2000);
  const tabs = page.locator('nav button, [role="tab"], .ds-viewtab button');
  for (let i = 0; i < await tabs.count(); i++) {
    const t = ((await tabs.nth(i).innerText()) || '').trim();
    if (t.includes('采购报价')) { await tabs.nth(i).click(); break; }
  }
  await sleep(1800);
}
async function cellInputW(page, tdIdx) {
  return page.evaluate((idx) => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[idx];
    const input = td ? td.querySelector('input') : null;
    const tdR = td ? td.getBoundingClientRect() : null;
    const iR = input ? input.getBoundingClientRect() : null;
    return { tdW: tdR ? Math.round(tdR.width) : null, inputW: iR ? Math.round(iR.width) : null, hasInput: !!input };
  }, tdIdx);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, { width: 1440, height: 900 });
  await openPurchaseQuote(page);
  const rows = page.locator('.ds-table-shell .ant-table-tbody tr');
  const r0 = rows.first();

  // ── 1. 产品列：自由编辑态撑满 + 输入候选 ──
  const prodCell = r0.locator('td').nth(2);
  await prodCell.click();
  await sleep(500);
  console.log('[产品列自由编辑态]', JSON.stringify(await cellInputW(page, 2)));
  // 输入关键词 → 面板候选
  await page.keyboard.type('伟星');
  await sleep(900);
  const candCount = await page.locator('.float-panel .product-picker-main-float-panel, .float-panel').count();
  console.log('[产品列输入关键词] float-panel 数量:', candCount);
  const candText = await page.evaluate(() => {
    const p = document.querySelector('.float-panel');
    return p ? (p.innerText || '').slice(0, 60) : '';
  });
  console.log('[面板内容]', JSON.stringify(candText));
  // 点击候选行选品
  const pickRow = page.locator('.float-panel [role="button"]').first();
  if (await pickRow.count() > 0) {
    await pickRow.click();
    await sleep(800);
    const val = await prodCell.innerText().catch(() => '');
    console.log('[选品后产品列值]', JSON.stringify(val.slice(0, 30)));
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.click('body', { position: { x: 800, y: 500 } }).catch(() => {});
  await sleep(400);

  // ── 2. 单位列：编辑态撑满 + 箭头展开 ──
  const unitCell = r0.locator('td').nth(3);
  await unitCell.click();
  await sleep(500);
  console.log('[单位列编辑态]', JSON.stringify(await cellInputW(page, 3)));
  const uArrow = unitCell.locator('.anticon-down').first();
  if (await uArrow.count() > 0) {
    await uArrow.click();
    await sleep(700);
    const uOpen = await page.evaluate(() => (document.querySelector('.float-panel') ? 'open' : 'closed'));
    console.log('[单位列箭头展开]', uOpen);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.click('body', { position: { x: 800, y: 500 } }).catch(() => {});
  await sleep(400);

  // ── 3. 数量列：number 编辑态 ──
  const qtyCell = r0.locator('td').nth(4);
  await qtyCell.click();
  await sleep(500);
  console.log('[数量列编辑态]', JSON.stringify(await cellInputW(page, 4)));
  await page.keyboard.press('Escape').catch(() => {});

  await browser.close();
})();
