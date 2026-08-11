/** 调试 v11.11：非标行单位下拉面板实际渲染内容 */
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
    body: JSON.stringify({ title: 'v11.11调试单位面板' }),
  })).data;
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' }); await sleep(600);
  await p.fill('input[placeholder="请输入用户名"]', 'admin'); await p.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await p.click('button:has-text("登 录")'); await sleep(1800);
  await p.goto('http://localhost:8081/staff/documents/' + doc.id, { waitUntil: 'networkidle' }); await sleep(2500);
  const l = p.locator('a:has-text("v11.11调试单位面板")').first(); if (await l.count() > 0) { await l.click(); await sleep(2500); }
  const t = p.locator('nav button:has-text("采购报价")'); if (await t.count() > 0) { await t.first().click(); await sleep(1500); }
  const r0 = p.locator('.ds-table-shell .ant-table-tbody tr').nth(0);
  // 全新空行（不输入产品名）→ 单位列下拉（unit='' → 显示全部常见单位）
  const uc = () => r0.locator('td').nth(3);
  await uc().click(); await sleep(500);
  const hasInput = await uc().locator('input').count();
  console.log('单位列 input 数:', hasInput);
  if (hasInput > 0) {
    const v = await uc().locator('input').first().inputValue();
    console.log('单位列 input value:', JSON.stringify(v));
  }
  await uc().locator('.anticon-down').first().click(); await sleep(1500);
  await p.screenshot({ path: 'e2e_browser/screenshots/pq_v1111/unit_panel_raw.png' });
  const dump = await p.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('[class*="float-panel"]'));
    return panels.map((el) => ({
      cls: el.className,
      top: Math.round(el.getBoundingClientRect().top),
      left: Math.round(el.getBoundingClientRect().left),
      buttons: Array.from(el.querySelectorAll('button')).map((bt) => ({ text: bt.textContent.trim().slice(0, 40), html: bt.outerHTML.slice(0, 200) })),
      allText: (el.textContent || '').slice(0, 400),
    }));
  });
  console.log(JSON.stringify(dump, null, 1).slice(0, 2500));
  await b.close();
})();
