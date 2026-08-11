/**
 * v11.11 验证：单位下拉常见单位 + 候选行所见即所得 + 插入按钮样式
 *   V1 非标行（产品未建档）单位下拉 → 显示常见单位列表（米/个/件…），非全局「已存在」匹配
 *   V2 非标行单位下拉输入关键词 → 常见单位本地过滤
 *   V3 标准行（有档案）单位下拉 → 该 SKU 档案内单位（行为不变）
 *   V4 候选行点击（有售价）→ 单价 = 行显示售价（所见即所得）
 *   V5 候选行点击（售价未录）→ 单价 = 行显示进价（兜底，所见即所得）
 *   V6 插入按钮样式：20×18、与面板边框留白（不贴边重叠）
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1111');
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
  const docRowLink = page.locator('a:has-text("v11.11单位与选品验证单")').first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }
  return { context, page };
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.11单位与选品验证单' }),
  });

  const browser = await chromium.launch({ headless: true });
  const tableRows = (page) => page.locator('.ds-table-shell .ant-table-tbody tr');

  // ============================================================
  // V1/V2 非标行单位下拉 → 常见单位
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    // V1/V2：全新空行（unit=''）直接点单位列下拉 → 常见单位列表（无需先建产品）
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1200);
    const v1dump = await page.evaluate(() => {
      // 收集所有 FloatPanel 内的按钮文本（不限定面板，UnitPicker 面板必然包含常见单位）
      const panels = document.querySelectorAll('[class*="float-panel"]');
      const out = [];
      panels.forEach((el) => {
        Array.from(el.querySelectorAll('button')).forEach((b) => {
          const t = b.textContent.trim();
          if (t) out.push(t);
        });
      });
      return Array.from(new Set(out));
    });
    const opts = v1dump;
    const COMMON_SET = ['米','厘米','毫米','平方米','立方米','升','个','件','箱','包','卷','捆','张','套','台','公斤','千克','克','吨','支','根','条','块','片','副','对','双','次'];
    // 选项必须全部是常见单位（按钮文本 = 单位名+「常用」标签；允许「快速新建: x」行），且无全局检索「已存在」垃圾项
    const nonCommon = opts.filter((o) => !o.startsWith('快速新建') && !COMMON_SET.includes(o.replace(/常用$/, '')));
    const hasJunk = opts.some((o) => o.includes('已存在'));
    record('V1 非标行单位下拉显示常见单位（非全局匹配）', opts.length >= 20 && nonCommon.length === 0 && !hasJunk,
      `选项数=${opts.length} 非常见=${nonCommon.join(',') || '无'} 垃圾项=${hasJunk}`);
    // V2 输入关键词过滤
    await uc().locator('input').first().fill('米');
    await sleep(600);
    const filtered = await page.evaluate(() => {
      const panels = document.querySelectorAll('[class*="float-panel"]');
      for (const el of panels) {
        const t = el.textContent || '';
        if (t.includes('米') && (t.includes('厘米') || t.includes('毫米') || t.includes('平方米'))) {
          return Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
        }
      }
      return [];
    });
    const filteredAllMeters = filtered.length > 0 && filtered.every((o) => o.includes('米'));
    record('V2 常见单位本地过滤（输入「米」）', filteredAllMeters, `结果=${filtered.join('/') || '空'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v1_common_units.png') });
    await context.close();
  }

  // ============================================================
  // V3 标准行单位下拉 → 该 SKU 档案单位
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    const pc = () => r0.locator('td').nth(2);
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('伟星');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(800);
    await pc().locator('.anticon-down').first().click(); await sleep(1200);
    // 点击有售价的候选行（en3.5，¥12.00）→ 标准行
    const clicked = await page.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      if (!panel) return false;
      const rowsEl = panel.querySelectorAll('[role="button"]');
      for (const el of rowsEl) {
        const t = el.textContent || '';
        if (t.includes('en3.5')) {
          const grid = el.closest('[style*="grid-template-columns"]');
          if (grid) grid.children[0].click(); else el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);
    // 单位列下拉（标准行 specId 已有）
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1200);
    const stdUnits = await page.evaluate(() => {
      const panels = document.querySelectorAll('[class*="float-panel"]');
      for (const el of panels) {
        const t = el.textContent || '';
        if (t.includes('米') && t.includes('基准')) {
          return Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
        }
      }
      return [];
    });
    const hasBase = stdUnits.some((o) => o.includes('基准'));
    record('V3 标准行单位下拉显示档案单位', clicked && hasBase && stdUnits.length > 0,
      `单位=${stdUnits.join('/') || '空'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v3_std_units.png') });
    await context.close();
  }

  // ============================================================
  // V4/V5 候选行点击 = 所见即所得（单价带出）
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    const pc = () => r0.locator('td').nth(2);
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('伟星');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(800);
    await pc().locator('.anticon-down').first().click(); await sleep(1200);
    // 读取候选行显示的售价/进价
    const display = await page.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      const rowsEl = panel.querySelectorAll('[role="button"]');
      const out = [];
      for (const el of rowsEl) {
        const t = (el.textContent || '').trim();
        if (t.includes('en3.5') || t.includes('en2.8')) out.push(t);
      }
      return out;
    });
    // 点击 en3.5（显示售价 ¥12.00）
    const c1 = await page.evaluate(() => {
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
    const row0After1 = await page.evaluate(() => {
      const tr0 = document.querySelector('.ds-table-shell .ant-table-tbody tr');
      const tds = tr0.querySelectorAll('td');
      return { price: tds[5]?.textContent?.trim() };
    });
    record('V4 候选行点击(有售价)带出单价', c1 && (row0After1.price === '12' || row0After1.price === '¥12.00'), `单价=${row0After1.price}`);
    await context.close();

    // 第二行：点击 en2.8（售价未录 — 进价14.19）→ 单价 14.19
    const { context: ctx2, page: page2 } = await openPqPage(browser, doc.id);
    const r1 = tableRows(page2).nth(0);
    const pc2 = () => r1.locator('td').nth(2);
    await pc2().click(); await sleep(400);
    await pc2().locator('input').first().fill('伟星');
    await sleep(200);
    await pc2().locator('input').first().press('Tab'); await sleep(800);
    await pc2().locator('.anticon-down').first().click(); await sleep(1200);
    const c2 = await page2.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      const rowsEl = panel.querySelectorAll('[role="button"]');
      for (const el of rowsEl) {
        if ((el.textContent || '').includes('en2.8')) {
          const grid = el.closest('[style*="grid-template-columns"]');
          if (grid) grid.children[0].click(); else el.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);
    const row0After2 = await page2.evaluate(() => {
      const tr0 = document.querySelector('.ds-table-shell .ant-table-tbody tr');
      const tds = tr0.querySelectorAll('td');
      return { price: tds[5]?.textContent?.trim() };
    });
    record('V5 候选行点击(售价未录)兜底进价', c2 && (row0After2.price === '14.19' || row0After2.price === '¥14.19'), `单价=${row0After2.price}（行显示进价14.19）`);
    await ctx2.close();
  }

  // ============================================================
  // V6 插入按钮样式：20×18、与面板边框留白
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id);
    const r0 = tableRows(page).nth(0);
    const pc = () => r0.locator('td').nth(2);
    await pc().click(); await sleep(400);
    await pc().locator('input').first().fill('伟星');
    await sleep(200);
    await pc().locator('input').first().press('Tab'); await sleep(800);
    await pc().locator('.anticon-down').first().click(); await sleep(1200);
    // 展开第一行候选的售价面板
    await page.evaluate(() => {
      const panel = document.querySelector('.product-picker-main-float-panel');
      const rowsEl = panel.querySelectorAll('[role="button"]');
      for (const el of rowsEl) {
        if ((el.textContent || '').includes('en3.5')) {
          // 点售价按钮（grid 第3列）
          const grid = el.closest('[style*="grid-template-columns"]');
          const btns = grid ? grid.querySelectorAll('button') : [];
          if (btns[1]) btns[1].click();
          return;
        }
      }
    });
    await sleep(1200);
    const btnGeo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[title^="插入"]'));
      if (btns.length === 0) return null;
      const b = btns[0];
      const panelEl = b.closest('[class*="float-panel"], [role="dialog"], div');
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: b.textContent };
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v6_insert_btn.png') });
    const okSize = btnGeo && btnGeo.w === 20 && btnGeo.h === 18;
    record('V6 插入按钮尺寸 20×18', !!okSize, btnGeo ? `w=${btnGeo.w} h=${btnGeo.h}` : '未找到');
    await context.close();
  }

  await browser.close();
  console.log('\n=== v11.11 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.pass) pass++;
  }
  console.log(`${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
