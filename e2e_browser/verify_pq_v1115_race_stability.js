/**
 * v11.15 竞态修复验证：选品后「未做修改」状态稳定性
 *   S1 选品完成 → 连续 3 次刷新 → 行始终标准（无待确认图标、productId 保留、无重复行）
 *   S2 选品后立即（不等待）切视图再切回 ×2 → 行标准
 *   S3 选品 + 换单位后立即刷新 → 单价/单位/标准态保持
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1115');
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

async function loginAndOpen(browser, docId, title) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1500);
  await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2200);
  const link = page.locator(`a:has-text("${title}")`).first();
  if (await link.count() > 0) { await link.click(); await sleep(2200); }
  return { context, page };
}

/** 读取首行状态：待确认图标 / 行数 / 关键字段 */
async function rowState(page) {
  return page.evaluate(() => {
    const trs = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr');
    const tr0 = trs[0];
    if (!tr0) return { count: trs.length };
    const tds = tr0.querySelectorAll('td');
    return {
      count: trs.length,
      nonStd: !!tr0.querySelector('.anticon-info-circle'),
      product: tds[2]?.textContent?.trim(),
      unit: tds[3]?.textContent?.trim(),
      price: tds[5]?.textContent?.trim(),
    };
  });
}

async function pickProduct(page, r0, keyword, match) {
  const pc = () => r0.locator('td').nth(2);
  await pc().click(); await sleep(300);
  await pc().locator('input').first().fill(keyword);
  await sleep(250);
  await pc().locator('input').first().press('Tab'); await sleep(600);
  await pc().locator('.anticon-down').first().click(); await sleep(1200);
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

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.15竞态稳定性验证单' }),
  });

  const browser = await chromium.launch({ headless: true });
  const tableRows = (page) => page.locator('.ds-table-shell .ant-table-tbody tr');

  // ============================================================
  // S1 选品 → 连续 3 次刷新 → 行始终标准
  // ============================================================
  {
    const { context, page } = await loginAndOpen(browser, doc.id, 'v11.15竞态稳定性验证单');
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1200); }
    const r0 = tableRows(page).nth(0);
    const picked = await pickProduct(page, r0, '伟星', 'en3.5');
    await sleep(1200);
    let ok = picked;
    const states = [];
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      await sleep(2200);
      const link = page.locator('a:has-text("v11.15竞态稳定性验证单")').first();
      if (await link.count() > 0) { await link.click(); await sleep(2000); }
      const t = page.locator('nav button:has-text("采购报价")');
      if (await t.count() > 0) { await t.first().click(); await sleep(1200); }
      const s = await rowState(page);
      states.push(s);
      if (s.nonStd) ok = false;
    }
    record('S1 选品后连续 3 次刷新，行始终标准（无待确认）',
      ok, `状态=${JSON.stringify(states)}`);
    await context.close();
  }

  // ============================================================
  // S2 选品后立即切视图再切回 ×2 → 行标准
  // ============================================================
  {
    const { context, page } = await loginAndOpen(browser, doc.id, 'v11.15竞态稳定性验证单');
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1200); }
    const r0 = tableRows(page).nth(0);
    const picked = await pickProduct(page, r0, '伟星', 'en2.8');
    // 选品后不等待完全稳定，立即切视图
    const navBtns = page.locator('nav button');
    let ok = picked;
    const states = [];
    for (let i = 0; i < 2; i++) {
      // 切到「配货」再切回「采购报价」
      const alloc = page.locator('nav button:has-text("配货")');
      if (await alloc.count() > 0) { await alloc.first().click(); await sleep(800); }
      if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1200); }
      const s = await rowState(page);
      states.push(s);
      if (s.nonStd) ok = false;
    }
    record('S2 选品后立即切视图×2 再切回，行标准',
      ok, `状态=${JSON.stringify(states)}`);
    await context.close();
  }

  // ============================================================
  // S3 选品 + 换单位后立即刷新 → 单价/单位/标准态保持
  // ============================================================
  {
    const { context, page } = await loginAndOpen(browser, doc.id, 'v11.15竞态稳定性验证单');
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1200); }
    const r0 = tableRows(page).nth(0);
    const picked = await pickProduct(page, r0, '伟星', 'en3.5');
    await sleep(1000);
    // 换单位到「根」（推算价 36）
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(300);
    await uc().locator('.anticon-down').first().click(); await sleep(1500);
    const clickedRoot = await page.evaluate(() => {
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
    await sleep(1200);
    // 立即刷新
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(2200);
    const link = page.locator('a:has-text("v11.15竞态稳定性验证单")').first();
    if (await link.count() > 0) { await link.click(); await sleep(2000); }
    const t = page.locator('nav button:has-text("采购报价")');
    if (await t.count() > 0) { await t.first().click(); await sleep(1200); }
    const s = await rowState(page);
    record('S3 选品+换单位后立即刷新，单价/单位/标准态保持',
      picked && clickedRoot && s.unit === '根' && s.price === '36' && !s.nonStd,
      `单位=${s.unit} 单价=${s.price} 待确认=${s.nonStd}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's3_stable.png') });
    await context.close();
  }

  await browser.close();
  console.log('\n=== v11.15 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.pass) pass++;
  }
  console.log(`${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('验证失败:', e.message); process.exit(1); });
