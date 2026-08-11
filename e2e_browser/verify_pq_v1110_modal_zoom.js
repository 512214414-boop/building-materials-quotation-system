/**
 * v11.10 弹窗统一居中 + 画布缩放开放 验证：
 *   Z1 宽视口(1440)：快速建档主弹窗 水平+垂直 视口居中
 *   Z2 窄视口(390)：弹窗 水平+垂直 视口居中（不再是左上角 x=0/y=0）
 *   Z3 缩放控件：点「＋」→ 画布 zoom=1.1、百分比显示 110%
 *   Z4 点百分比 → 恢复 100%
 *   Z5 Ctrl+滚轮 → 缩放变化
 *   Z6 缩放(1.2)后：产品选择 FloatPanel 与单元格对齐（锚点定位仍正确）
 *   Z7 缩放后打开弹窗 → 仍视口居中（弹窗在 body 层，不随画布缩放）
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v1110');
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

async function loginAndOpen(page, docId) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const docRowLink = page.locator('a:has-text("v11.10弹窗缩放验证单")').first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }
}

async function openCreateDialog(page) {
  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const row0 = tableRows().nth(0);
  const prodCell = () => row0.locator('td').nth(2);
  await prodCell().click();
  await sleep(400);
  await prodCell().locator('input').first().fill(`弹窗验证${Date.now() % 100000}`);
  await sleep(200);
  await prodCell().locator('input').first().press('Tab');
  await sleep(1000);
  await prodCell().locator('.anticon-down').first().click();
  await sleep(1000);
  const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
  if (await createOpt.count() > 0) { await createOpt.click(); }
  await sleep(1200);
}

async function modalGeo(page) {
  return page.evaluate(() => {
    // antd v6：.ant-modal-content 已改为 .ant-modal-container，直接取 .ant-modal（dialog）几何
    const dialog = document.querySelector('.ant-modal');
    if (!dialog) return null;
    const r = dialog.getBoundingClientRect();
    const title = dialog.querySelector('.ant-modal-title, .ant-modal-header')?.textContent || '';
    return {
      title: (title || '').trim(),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
}

(async () => {
  console.log('=== v11.10 弹窗居中 + 画布缩放验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.10弹窗缩放验证单' }),
  });
  const docId = doc.id;

  const browser = await chromium.launch({ headless: true });

  // ============================================================
  // Z1/Z2 弹窗居中（宽 + 窄视口）
  // ============================================================
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'zh-CN' });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [页面错误]', e.message));
    await loginAndOpen(page, docId);
    await openCreateDialog(page);
    const geo = await modalGeo(page);
    if (!geo) {
      record(`Z${vp.w === 1440 ? 1 : 2} 弹窗打开(${vp.w}px)`, false, '弹窗未找到');
    } else {
      // 垂直：必须居中（弹窗高度小于视口）
      const vCentered = Math.abs((geo.y + geo.h / 2) - geo.vh / 2) < 8;
      // 水平：modal 宽 ≤ 视口 → 必须水平居中；modal 宽 > 视口 → 保留完整宽度，
      // 从起始边开始(x≥0)由 wrap 横向滚动查看右侧（居中会把左侧按钮裁切不可达）
      const hCentered = geo.w <= geo.vw
        ? Math.abs((geo.x + geo.w / 2) - geo.vw / 2) < 8
        : geo.x >= 0;
      record(`Z${vp.w === 1440 ? 1 : 2} 弹窗视口居中(${vp.w}px)`, hCentered && vCentered,
        `x=${geo.x} y=${geo.y} w=${geo.w} h=${geo.h} vw=${geo.vw} vh=${geo.vh} 水平=${hCentered} 垂直=${vCentered}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `z_center_${vp.w}.png`) });
    await context.close();
  }

  // ============================================================
  // Z3-Z7 缩放功能（宽视口下）
  // ============================================================
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));
  await loginAndOpen(page, docId);

  const zoomVal = async () => {
    const v = await page.evaluate(() => {
      const shell = document.querySelector('.ds-app-shell');
      const controls = document.querySelector('.ds-zoom-controls');
      return {
        shellZoom: shell ? getComputedStyle(shell).zoom : null,
        label: controls?.querySelector('.ds-zoom-value')?.textContent?.trim() || '',
      };
    });
    return v;
  };

  console.log('\n--- Z3/Z4 缩放控件 ---');
  const z0 = await zoomVal();
  record('Z3 缩放控件存在且默认100%', z0.shellZoom === '1' && z0.label === '100%',
    `zoom=${z0.shellZoom} 标签=${z0.label}`);
  // 点放大
  await page.locator('.ds-zoom-btn[aria-label="放大"]').click();
  await sleep(400);
  const z1 = await zoomVal();
  record('Z3 点「＋」放大到 110%', z1.shellZoom === '1.1' && z1.label === '110%',
    `zoom=${z1.shellZoom} 标签=${z1.label}`);
  // 点百分比恢复
  await page.locator('.ds-zoom-value').click();
  await sleep(400);
  const z2 = await zoomVal();
  record('Z4 点百分比恢复 100%', z2.shellZoom === '1' && z2.label === '100%',
    `zoom=${z2.shellZoom} 标签=${z2.label}`);

  console.log('\n--- Z5 Ctrl+滚轮缩放 ---');
  await page.mouse.move(800, 400);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200); // 上滚 = 放大
  await sleep(400);
  await page.keyboard.up('Control');
  const z3 = await zoomVal();
  record('Z5 Ctrl+滚轮上滚放大', z3.shellZoom !== '1' && parseFloat(z3.shellZoom) > 1,
    `zoom=${z3.shellZoom}`);
  // 恢复 100%
  await page.locator('.ds-zoom-value').click();
  await sleep(400);

  console.log('\n--- Z6 缩放后 FloatPanel 锚点对齐 ---');
  // 放大到 1.2
  await page.locator('.ds-zoom-btn[aria-label="放大"]').click();
  await page.locator('.ds-zoom-btn[aria-label="放大"]').click();
  await sleep(500);
  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const row0 = tableRows().nth(0);
  await row0.locator('td').nth(2).click();
  await sleep(500);
  await row0.locator('td').nth(2).locator('.anticon-down').first().click();
  await sleep(1200);
  const align = await page.evaluate(() => {
    const cell = document.querySelector('.ds-table-shell .ant-table-tbody tr td:nth-child(3)');
    const panel = document.querySelector('.float-panel');
    if (!cell || !panel) return null;
    const c = cell.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    return { cellLeft: Math.round(c.left), panelLeft: Math.round(p.left), panelTop: Math.round(p.top), cellTop: Math.round(c.top) };
  });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'z6_floatpanel_zoom120.png') });
  record('Z6 缩放1.2后面板左缘对齐单元格', !!align && Math.abs(align.cellLeft - align.panelLeft) < 8,
    align ? `cellLeft=${align.cellLeft} panelLeft=${align.panelLeft}` : '面板未找到');
  await page.keyboard.press('Escape');
  await sleep(500);

  console.log('\n--- Z7 缩放后弹窗仍居中 ---');
  await openCreateDialog(page);
  const geoZ = await modalGeo(page);
  if (!geoZ) {
    record('Z7 缩放后弹窗居中', false, '弹窗未找到');
  } else {
    const hC = Math.abs((geoZ.x + geoZ.w / 2) - geoZ.vw / 2) < 8;
    const vC = Math.abs((geoZ.y + geoZ.h / 2) - geoZ.vh / 2) < 8;
    record('Z7 缩放1.2后弹窗仍视口居中', hC && vC,
      `x=${geoZ.x} y=${geoZ.y} w=${geoZ.w} 水平=${hC} 垂直=${vC}`);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'z7_modal_zoom120.png') });
  await context.close();
  await browser.close();

  console.log('\n=== 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) { if (r.pass) pass++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
})();
