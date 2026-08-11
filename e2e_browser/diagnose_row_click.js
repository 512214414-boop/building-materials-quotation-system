/** 调试 v11.11：产品实时匹配列表「点击行」插入行为（是否带出单位/售价/进价） */
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
    body: JSON.stringify({ title: 'v11.11调试行点击' }),
  })).data;
  // 查一个带价格的 SKU 关键词
  const kw = '伟星';
  const s = (await apiJson(`/api/staff/products/search?keyword=${encodeURIComponent(kw)}&size=5`, {
    headers: { Authorization: 'Bearer ' + token },
  }));
  console.log('SEARCH', JSON.stringify(s.data?.list?.slice(0, 2).map((x) => ({
    id: x.id, productName: x.productName, brandName: x.brandName, specModel: x.specModel,
    defaultUnitName: x.defaultUnitName, defaultUnitId: x.defaultUnitId,
    retailPrice: x.retailPrice, purchasePriceDefault: x.purchasePriceDefault,
  })), null, 1));
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' }); await sleep(600);
  await p.fill('input[placeholder="请输入用户名"]', 'admin'); await p.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await p.click('button:has-text("登 录")'); await sleep(1800);
  await p.goto('http://localhost:8081/staff/documents/' + doc.id, { waitUntil: 'networkidle' }); await sleep(2500);
  const l = p.locator('a:has-text("v11.11调试行点击")').first(); if (await l.count() > 0) { await l.click(); await sleep(2500); }
  const t = p.locator('nav button:has-text("采购报价")'); if (await t.count() > 0) { await t.first().click(); await sleep(1500); }
  const rows = p.locator('.ds-table-shell .ant-table-tbody tr'); const r0 = rows.nth(0);
  const pc = () => r0.locator('td').nth(2);
  await pc().click(); await sleep(400);
  await pc().locator('input').first().fill(kw); await sleep(200);
  await pc().locator('input').first().press('Tab'); await sleep(800);
  await pc().locator('.anticon-down').first().click(); await sleep(1200);
  // dump 面板结构与行文本
  const rowInfo = await p.evaluate(() => {
    const panel = document.querySelector('.product-picker-main-float-panel');
    if (!panel) return { found: false };
    const rowsEl = panel.querySelectorAll('[role="button"]');
    const texts = [];
    rowsEl.forEach((el) => texts.push(el.textContent.slice(0, 120)));
    const gridRows = panel.querySelectorAll('[style*="grid-template-columns"]');
    return { found: true, buttons: texts, gridCount: gridRows.length };
  });
  console.log('ROW0', JSON.stringify(rowInfo, null, 1));
  // 点击第一行候选（找到含产品名的 role=button 行）
  const clicked = await p.evaluate(() => {
    const panel = document.querySelector('.product-picker-main-float-panel');
    if (!panel) return false;
    const rowsEl = panel.querySelectorAll('[role="button"]');
    // 找包含 "ppr" 或产品名的那一行
    for (const el of rowsEl) {
      const t = el.textContent;
      if (t && t.includes('ppr') && !t.includes('新建')) {
        // 点击该行的产品全名区域（第一个 grid 子元素）
        const grid = el.closest('[style*="grid-template-columns"]');
        if (grid) { grid.children[0].click(); } else { el.click(); }
        return { clicked: true, text: t.slice(0, 100) };
      }
    }
    return false;
  });
  console.log('CLICKED', JSON.stringify(clicked, null, 1));
  await sleep(1500);
  // 读取插入后行数据
  const after = await p.evaluate(() => {
    const tbody = document.querySelector('.ds-table-shell .ant-table-tbody');
    const tr0 = tbody.querySelector('tr');
    if (!tr0) return null;
    const tds = tr0.querySelectorAll('td');
    return {
      ref: tds[2]?.textContent?.trim(),
      unit: tds[3]?.textContent?.trim(),
      qty: tds[4]?.textContent?.trim(),
      price: tds[5]?.textContent?.trim(),
      amount: tds[6]?.textContent?.trim(),
    };
  });
  console.log('AFTER', JSON.stringify(after, null, 1));
  await b.close();
})();
