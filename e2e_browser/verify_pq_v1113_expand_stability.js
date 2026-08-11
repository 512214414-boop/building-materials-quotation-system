/**
 * v11.13 验证：单元格展开箭头稳定性 + 单位面板显示全部单位
 *   V1 产品列展开面板后，箭头按钮保留在原位置且变「收起」（UpOutlined），点击收起面板关闭恢复展开箭头
 *   V2 标准行（en4.2，20 个单位）单位列展开 → 显示全部单位（含米/捆/根），非仅当前单位
 *   V3 非标行已有单位值（如「个」）展开 → 显示全部常见单位（不被初始关键词过滤）
 *   V4 单位列展开后箭头变「收起」，点击收起面板关闭
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1113');
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

/** 读取某列的箭头状态（是否存在 up/down） */
async function arrowState(page, colIdx) {
  return page.evaluate((ci) => {
    const tr0 = document.querySelector('.ds-table-shell .ant-table-tbody tr');
    if (!tr0) return null;
    const td = tr0.querySelectorAll('td')[ci];
    if (!td) return null;
    return {
      down: !!td.querySelector('.anticon-down'),
      up: !!td.querySelector('.anticon-up'),
      text: td.textContent.trim().slice(0, 20),
    };
  }, colIdx);
}

/** dump 单位面板按钮文本 */
async function unitPanelButtons(page) {
  return page.evaluate(() => {
    const panels = document.querySelectorAll('.float-panel');
    const out = [];
    for (const el of panels) {
      const btns = Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
      if (btns.length > 1 || (btns.length === 1 && !btns[0].includes('新增'))) out.push(btns);
    }
    return out;
  });
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ title: 'v11.13展开稳定性验证单' }),
  });

  const browser = await chromium.launch({ headless: true });
  const tableRows = (page) => page.locator('.ds-table-shell .ant-table-tbody tr');

  // ============================================================
  // V1 产品列：展开面板后箭头保留（变收起）+ 点击收起恢复
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id, 'v11.13展开稳定性验证单');
    const r0 = tableRows(page).nth(0);
    const pc = () => r0.locator('td').nth(2);
    // 展开产品面板
    await pc().click(); await sleep(400);
    await pc().locator('.anticon-down').first().click(); await sleep(1500);
    const s1 = await arrowState(page, 2);
    const panelOpen = await page.evaluate(() => !!document.querySelector('.product-picker-main-float-panel'));
    // 点击收起按钮
    if (s1 && s1.up) {
      await pc().locator('.anticon-up').first().click(); await sleep(1200);
    }
    const s2 = await arrowState(page, 2);
    const panelClosed = await page.evaluate(() => !document.querySelector('.product-picker-main-float-panel'));
    record('V1 产品列展开后箭头保留变收起、点击收起面板关闭',
      s1?.up === true && panelOpen && s2?.down === true && panelClosed,
      `展开后 up=${s1?.up} down=${s1?.down} 面板开=${panelOpen}；收起后 down=${s2?.down} 面板关=${panelClosed}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v1_prod_arrow.png') });
    await context.close();
  }

  // ============================================================
  // V2 标准行（en4.2 多单位）单位列展开 → 显示全部单位
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id, 'v11.13展开稳定性验证单');
    const r0 = tableRows(page).nth(0);
    const picked = await pickProduct(page, r0, '伟星', 'en4.2');
    await sleep(1800);
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1500);
    const btns = await unitPanelButtons(page);
    const names = (btns[0] || []).join('|');
    const hasAll = ['米', '捆', '根'].every((u) => names.includes(u));
    const count = (btns[0] || []).length;
    record('V2 标准行单位面板显示全部单位（米/捆/根等）', picked && hasAll && count >= 10,
      `单位数=${count} 含米捆根=${hasAll}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v2_std_all_units.png') });
    await context.close();
  }

  // ============================================================
  // V3 非标行已有值（个）展开 → 显示全部常见单位（独立单据，避免受 V2 标准行影响）
  // ============================================================
  {
    const doc2 = await apiJson('/api/staff/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ title: 'v11.13非标单位验证单' }),
    });
    const { context, page } = await openPqPage(browser, doc2.id, 'v11.13非标单位验证单');
    const r0 = tableRows(page).nth(0);
    // 空行直接输单位「个」（非标，unitId=null）
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('input').first().fill('个');
    await sleep(200);
    await uc().locator('input').first().press('Tab'); await sleep(1500);
    // 再展开单位下拉（value=「个」）
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1500);
    const btns = await unitPanelButtons(page);
    const names = (btns[0] || []).join('|');
    const COMMON_SET = ['米','厘米','毫米','平方米','立方米','升','个','件','箱','包','卷','捆','张','套','台','公斤','千克','克','吨','支','根','条','块','片','副','对','双','次'];
    const missing = COMMON_SET.filter((u) => !names.includes(u));
    const count = (btns[0] || []).length;
    record('V3 非标行已有值展开显示全部常见单位（不被初始关键词过滤）',
      count >= 28 && missing.length === 0, `常见单位数=${count} 缺失=${missing.join(',') || '无'}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'v3_common_all.png') });
    await context.close();
  }

  // ============================================================
  // V4 单位列展开后箭头变「收起」，点击收起关闭
  // ============================================================
  {
    const { context, page } = await openPqPage(browser, doc.id, 'v11.13展开稳定性验证单');
    const r0 = tableRows(page).nth(0);
    const uc = () => r0.locator('td').nth(3);
    await uc().click(); await sleep(400);
    await uc().locator('.anticon-down').first().click(); await sleep(1500);
    const s1 = await arrowState(page, 3);
    const panelOpen = await page.evaluate(() => {
      // FloatPanel portal 到 body，需在 document 层级查找
      const panels = Array.from(document.querySelectorAll('.float-panel'));
      return panels.some((el) => Array.from(el.querySelectorAll('button')).some((b) => b.textContent.trim()));
    });
    if (s1 && s1.up) {
      await uc().locator('.anticon-up').first().click(); await sleep(1200);
    }
    const s2 = await arrowState(page, 3);
    record('V4 单位列展开后箭头变收起、点击收起关闭', s1?.up === true && panelOpen && s2?.down === true,
      `展开后 up=${s1?.up} 面板=${panelOpen}；收起后 down=${s2?.down}`);
    await context.close();
  }

  await browser.close();
  console.log('\n=== v11.13 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.pass) pass++;
  }
  console.log(`${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('验证失败:', e.message); process.exit(1); });
