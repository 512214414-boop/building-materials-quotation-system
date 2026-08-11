/** 测试：画布 CSS zoom 缩放后，点击输入产品列宽是否恒定（8080） */
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
async function snapCols(page, label) {
  const s = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
    const cols = ths.map((th) => Math.round(th.getBoundingClientRect().width));
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    return {
      cols,
      tdW: td ? Math.round(td.getBoundingClientRect().width) : null,
      zoom: document.querySelector('.ds-app-shell') ? getComputedStyle(document.querySelector('.ds-app-shell')).zoom : null,
    };
  });
  console.log(`[${label}]`, JSON.stringify(s));
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, { width: 390, height: 844 });
  await openPurchaseQuote(page);
  await snapCols(page, '初始(zoom=1)');

  // 设置画布 CSS zoom 0.5（模拟手机缩放查看）
  await page.evaluate(() => {
    const shell = document.querySelector('.ds-app-shell');
    if (shell) shell.style.zoom = '0.5';
  });
  await sleep(800);
  await snapCols(page, 'zoom=0.5 后');
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);
  await prodCell.click();
  await sleep(700);
  await snapCols(page, 'zoom=0.5 点击编辑态');

  // zoom=1.5
  await page.evaluate(() => {
    const shell = document.querySelector('.ds-app-shell');
    if (shell) shell.style.zoom = '1.5';
  });
  await sleep(800);
  await snapCols(page, 'zoom=1.5 点击编辑态');
  await browser.close();
})();
