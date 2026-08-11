/** 完整诊断：文本态 vs 编辑态，表格所有列宽 + 表格总宽 + 行高（8080） */
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
async function snapshotTable(page, label) {
  const s = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
    const table = document.querySelector('.ds-table-shell .ant-table');
    const body = document.querySelector('.ds-table-shell .ant-table-tbody');
    const firstRow = body ? body.querySelector('tr') : null;
    const tds = firstRow ? Array.from(firstRow.querySelectorAll('td')).map((td) => {
      const r = td.getBoundingClientRect();
      const cs = getComputedStyle(td);
      return { w: Math.round(r.width), title: (td.innerText || '').slice(0, 10) };
    }) : [];
    return {
      ths: ths.map((th) => { const r = th.getBoundingClientRect(); return Math.round(r.width); }),
      tableW: table ? Math.round(table.getBoundingClientRect().width) : null,
      bodyW: body ? Math.round(body.getBoundingClientRect().width) : null,
      rowH: firstRow ? Math.round(firstRow.getBoundingClientRect().height) : null,
      tds,
    };
  });
  console.log(`[${label}]`, JSON.stringify(s));
  return s;
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, { width: 1440, height: 900 });
  await openPurchaseQuote(page);
  await snapshotTable(page, '文本态');

  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);
  await prodCell.click();
  await sleep(700);
  await snapshotTable(page, '自由编辑态');

  const arrow = prodCell.locator('.anticon-down').first();
  if (await arrow.count() > 0) await arrow.click();
  await sleep(800);
  await snapshotTable(page, '激活态(点箭头)');

  await browser.close();
})();
