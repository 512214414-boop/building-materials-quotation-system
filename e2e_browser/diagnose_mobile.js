/** 调试：移动端弹窗 wrap/dialog 几何与样式 */
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
    body: JSON.stringify({ title: 'v11.10调试移动单' }),
  })).data;
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' }); await sleep(600);
  await p.fill('input[placeholder="请输入用户名"]', 'admin'); await p.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await p.click('button:has-text("登 录")'); await sleep(1800);
  await p.goto('http://localhost:8081/staff/documents/' + doc.id, { waitUntil: 'networkidle' }); await sleep(2500);
  const l = p.locator('a:has-text("v11.10调试移动单")').first(); if (await l.count() > 0) { await l.click(); await sleep(2500); }
  const t = p.locator('nav button:has-text("采购报价")'); if (await t.count() > 0) { await t.first().click(); await sleep(1500); }
  const rows = p.locator('.ds-table-shell .ant-table-tbody tr'); const r0 = rows.nth(0); const pc = () => r0.locator('td').nth(2);
  await pc().click(); await sleep(400); await pc().locator('input').first().fill('调试移动' + (Date.now() % 100000)); await sleep(200);
  await pc().locator('input').first().press('Tab'); await sleep(1000);
  await pc().locator('.anticon-down').first().click(); await sleep(1000);
  const co = p.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
  if (await co.count() > 0) { await co.click(); }
  await sleep(1800);
  const info = await p.evaluate(() => {
    const wrap = document.querySelector('.ant-modal-wrap');
    const dialog = document.querySelector('.ant-modal');
    const container = document.querySelector('.ant-modal-container');
    const gs = (el, extra) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        className: el.className, display: s.display, position: s.position, top: s.top, left: s.left,
        margin: s.margin, textAlign: s.textAlign, verticalAlign: s.verticalAlign,
        alignItems: s.alignItems, justifyContent: s.justifyContent,
        flexDirection: s.flexDirection, inset: s.inset, height: s.height, overflow: s.overflow,
        ...extra,
      };
    };
    const wrapBefore = wrap ? getComputedStyle(wrap, '::before') : null;
    return {
      wrap: gs(wrap, { before: wrapBefore ? { display: wrapBefore.display, width: wrapBefore.width, height: wrapBefore.height, verticalAlign: wrapBefore.verticalAlign, content: wrapBefore.content } : null }),
      dialog: gs(dialog), container: gs(container),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
