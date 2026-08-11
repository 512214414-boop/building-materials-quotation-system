/**
 * v11.14 验证：换单位插入对应价格 + 单位面板换算链
 *   V1 标准行单位面板显示换算链（en3.5 选「根」→ 「1 根 = 3 米」）
 *   V2 换单位插入对应价格（选「根」→ 单价 36 推算色 #E8A33D）
 *   V3 resolve API：specId+brandId → specBrandId（spec7+brand1759 → 15）
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1114');
require('fs').mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API_BASE}${pathname}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${pathname} 失败`);
  return data.data;
}

async function openPqPage(browser, docId, title) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const docRowLink = page.locator(`a:has-text("${title}")`).first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }
  return { context, page };
}

/** 产品列选品（标准行） */
async function pickProduct(page, r0, keyword, match) {
  const pc = () => r0.locator('td').nth(2);
  await pc().click(); await sleep(400);
  await pc().locator('input').first().fill(keyword);
  await sleep(300);
  await pc().locator('input').first().press('Tab'); await sleep(800);
  await pc().locator('.anticon-down').first().click(); await sleep(1500);
  return page.evaluate((m) => {
    const panel = document.querySelector('.product-picker-main-float-panel');
    if (!panel) return false;
    const rowsEl = panel.querySelectorAll('[role="button"]');
    for (const el of rowsEl) {
      if ((el.textContent || '').includes(m)) {
        const grid = el.closest('[style*="grid-template-columns"]');
        if (grid) grid.children[0].click(); else el.click();
        return true;
      }
    }
    return false;
  }, match);
}

/** dump 单位面板（UnitPicker）按钮文本 + 单价 */
async function unitPanelState(page) {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.float-panel'));
    // 找到包含「基准」或单位按钮的面板
    let buttons = [];
    for (const el of panels) {
      const btns = Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
      if (btns.some((t) => t.includes('基准') || t.includes('='))) { buttons = btns; break; }
    }
    const tr0 = document.querySelector('.ds-table-shell .ant-table-tbody tr');
    const tds = tr0 ? tr0.querySelectorAll('td') : [];
    const priceSpan = tds[5]?.querySelector('span');
    return {
      buttons,
      price: tds[5]?.textContent?.trim(),
      priceColor: priceSpan ? getComputedStyle(priceSpan).color : null,
      unit: tds[3]?.textContent?.trim(),
    };
  });
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.14单位换价换算验证单' }),
  });

  // V3 resolve API
  {
    const r = await apiJson('/api/staff/products/spec-brands/resolve?specId=7&brandId=1759', {
      headers: { Authorization: 'Bearer ' + token },
    });
    record('V3 resolve API（spec7+brand1759 → specBrandId 15）', r.specBrandId === '15', `specBrandId=${r.specBrandId}`);
  }

  const browser = await chromium.launch({ headless: true });
  const tableRows = (page) => page.locator('.ds-table-shell .ant-table-tbody tr');

  // ============================================================
  // V1 标准行单位面板显示换算链 + V2 换单位插入对应价格
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id, 'v11.14单位换价换算验证单');
    const r0 = tableRows(page).nth(0);
    const picked = await pickProduct(page, r0, '伟星', 'en3.5');
    await sleep(1800);
    // 选品后单价 = 12（米，sale 普通色）
    const before = await unitPanelState(page);
    // 展开单位列
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1800);
    const s1 = await unitPanelState(page);
    const btns = s1.buttons.join('|');
    const hasChain = btns.includes('1 根 = 3 米');
    const hasBase = btns.includes('基准');
    record('V1 标准行单位面板显示换算链（1 根 = 3 米）', picked && hasChain && hasBase,
      `按钮=${btns.slice(0, 80)}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v1_conversion_chain.png') });

    // 点击「根」→ 换单位插入推算价 36（推算色）
    const clicked = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('.float-panel'));
      for (const el of panels) {
        const btns = Array.from(el.querySelectorAll('button'));
        for (const b of btns) {
          const t = b.textContent.trim();
          if (t.startsWith('根')) { b.click(); return true; }
        }
      }
      return false;
    });
    await sleep(1800);
    const after = await unitPanelState(page);
    const isDerived = after.priceColor === 'rgb(232, 163, 61)'; // #E8A33D
    record('V2 换单位插入对应价格（根 → 推算价 36 推算色）',
      clicked && after.price === '36' && isDerived && after.unit === '根',
      `单价=${after.price} 色=${after.priceColor} 单位=${after.unit}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_unit_price_inserted.png') });
    await context.close();
  }

  await browser.close();
  console.log('\n=== v11.14 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.pass) pass++;
  }
  console.log(`${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('验证失败:', e.message); process.exit(1); });
