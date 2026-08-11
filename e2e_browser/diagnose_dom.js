/** 调试：antd v6 Modal DOM 结构 */
const { chromium } = require('playwright');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const doc = (await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.10调试DOM单' }),
  })).data;
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' }); await sleep(600);
  await p.fill('input[placeholder="请输入用户名"]', 'admin'); await p.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await p.click('button:has-text("登 录")'); await sleep(1800);
  await p.goto('http://localhost:8081/staff/documents/' + doc.id, { waitUntil: 'networkidle' }); await sleep(2500);
  const l = p.locator('a:has-text("v11.10调试DOM单")').first(); if (await l.count() > 0) { await l.click(); await sleep(2500); }
  const t = p.locator('nav button:has-text("采购报价")'); if (await t.count() > 0) { await t.first().click(); await sleep(1500); }
  const rows = p.locator('.ds-table-shell .ant-table-tbody tr'); const r0 = rows.nth(0); const pc = () => r0.locator('td').nth(2);
  await pc().click(); await sleep(400); await pc().locator('input').first().fill('调试DOM' + (Date.now() % 100000)); await sleep(200);
  await pc().locator('input').first().press('Tab'); await sleep(1000);
  await pc().locator('.anticon-down').first().click(); await sleep(1000);
  const co = p.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
  if (await co.count() > 0) { await co.click(); }
  await sleep(1800);
  const html = await p.evaluate(() => {
    const ws = Array.from(document.querySelectorAll('.ant-modal-wrap'));
    return ws.map((w) => w.outerHTML.slice(0, 1000));
  });
  console.log('Modal wraps 数量:', html.length);
  console.log(JSON.stringify(html).slice(0, 2500));
  await b.close();
})();
