/**
 * v11.12 验证：单价来源着色（防止把进价/推算价当真实售价）
 *   W1 点击「售价未录」候选行（进价兜底）→ 单价=进价且红色（status-discount-default #cf1322）
 *   W2 点击「有真实售价」候选行 → 单价=售价且普通色（text-default）
 *   W3 手输单价 → 来源清除 → 普通色
 *   W4 展开单位面板选推算价单位（derived）→ 单价=推算价且推算色（placeholder-accent #E8A33D）
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1112');
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

async function openPqPage(browser, docId) {
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
  const docRowLink = page.locator('a:has-text("v11.12单价来源验证单")').first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }
  return { context, page };
}

/** 打开产品匹配面板并点击包含某关键词的候选行 */
async function pickRow(page, row0, keyword, rowMatch) {
  const pc = () => row0.locator('td').nth(2);
  await pc().click(); await sleep(400);
  await pc().locator('input').first().fill(keyword);
  await sleep(200);
  await pc().locator('input').first().press('Tab'); await sleep(800);
  await pc().locator('.anticon-down').first().click(); await sleep(1200);
  return page.evaluate((match) => {
    const panel = document.querySelector('.product-picker-main-float-panel');
    if (!panel) return false;
    const rowsEl = panel.querySelectorAll('[role="button"]');
    for (const el of rowsEl) {
      if ((el.textContent || '').includes(match)) {
        const grid = el.closest('[style*="grid-template-columns"]');
        if (grid) grid.children[0].click(); else el.click();
        return true;
      }
    }
    return false;
  }, rowMatch);
}

/** 读取首行单价单元格的颜色与文本 */
async function priceCell(page) {
  return page.evaluate(() => {
    const tr0 = document.querySelector('.ds-table-shell .ant-table-tbody tr');
    if (!tr0) return null;
    const tds = tr0.querySelectorAll('td');
    const cell = tds[5]; // 单价列
    if (!cell) return null;
    const span = cell.querySelector('span');
    return { text: cell.textContent.trim(), color: span ? getComputedStyle(span).color : getComputedStyle(cell).color };
  });
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.12单价来源验证单' }),
  });

  const browser = await chromium.launch({ headless: true });
  const tableRows = (page) => page.locator('.ds-table-shell .ant-table-tbody tr');

  // W1 进价兜底 → 红色
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    const ok = await pickRow(page, r0, '伟星', 'en2.8');
    await sleep(1500);
    const pc = await priceCell(page);
    const isRed = pc && pc.color === 'rgb(207, 19, 34)'; // #cf1322
    record('W1 进价兜底单价红色', ok && pc?.text === '14.19' && isRed,
      `text=${pc?.text} color=${pc?.color} ${ok ? '' : '(未选中行)'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'w1_purchase_red.png') });
    await context.close();
  }

  // W2 真实售价 → 普通色
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    const ok = await pickRow(page, r0, '伟星', 'en3.5');
    await sleep(1500);
    const pc = await priceCell(page);
    const isNormal = pc && pc.color !== 'rgb(207, 19, 34)' && pc.color !== 'rgb(232, 163, 61)';
    record('W2 真实售价单价普通色', ok && pc?.text === '12' && isNormal,
      `text=${pc?.text} color=${pc?.color}`);
    await context.close();
  }

  // W3 手输单价 → 清除来源 → 普通色
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    await pickRow(page, r0, '伟星', 'en2.8');
    await sleep(1500);
    // 手输单价
    const pc = () => r0.locator('td').nth(5);
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('20');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(1200);
    const after = await priceCell(page);
    const isNormal = after && after.color !== 'rgb(207, 19, 34)' && after.color !== 'rgb(232, 163, 61)';
    record('W3 手输单价恢复普通色', after?.text === '20' && isNormal,
      `text=${after?.text} color=${after?.color}`);
    await context.close();
  }

  // W4 推算价单位 → 推算色
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    // 选 en3.5（真实售价 12），再展开单位面板选「根」（derivedSalePrice=36，推算价）
    const pc = () => r0.locator('td').nth(2);
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('伟星');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(800);
    await pc().locator('.anticon-down').first().click(); await sleep(1200);
    const picked = await page.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      const rowsEl = panel.querySelectorAll('[role="button"]');
      for (const el of rowsEl) {
        if ((el.textContent || '').includes('en3.5')) {
          const grid = el.closest('[style*="grid-template-columns"]');
          if (grid) grid.children[0].click(); else el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);
    // 重新打开主面板（选品后面板已关闭），点 en3.5 行的单位按钮展开单位面板
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('伟星');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(800);
    await pc().locator('.anticon-down').first().click(); await sleep(1500);
    const unitPanelOpened = await page.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      if (!panel) return false;
      const rowsEl = panel.querySelectorAll('[role="button"]');
      for (const el of rowsEl) {
        if ((el.textContent || '').includes('en3.5')) {
          const grid = el.closest('[style*="grid-template-columns"]');
          const btns = grid ? grid.querySelectorAll('button') : [];
          if (btns[0]) { btns[0].click(); return true; } // 单位列下拉按钮
        }
      }
      return false;
    });
    await sleep(1500);
    // 在单位面板里点「根」行的插入按钮（从 title="插入此单位" 反查所在行，行文本含「根」）
    const insertRoot = await page.evaluate(() => {
      const insBtns = Array.from(document.querySelectorAll('button[title="插入此单位"]'));
      for (const b of insBtns) {
        const row = b.closest('[style*="grid-template-columns"]');
        if (row && (row.textContent || '').includes('根')) { b.click(); return true; }
      }
      return false;
    });
    await sleep(1500);
    const after = await priceCell(page);
    const isDerived = after && after.color === 'rgb(232, 163, 61)'; // #E8A33D
    record('W4 推算价单价推算色', picked && unitPanelOpened && insertRoot && after?.text === '36' && isDerived,
      `text=${after?.text} color=${after?.color} picked=${picked} unitPanel=${unitPanelOpened} insert=${insertRoot}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'w4_derived.png') });
    await context.close();
  }

  await browser.close();
  console.log('\n=== v11.12 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.pass) pass++;
  }
  console.log(`${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
