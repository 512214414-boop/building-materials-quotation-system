/**
 * 采购报价输入稳定性真实测试 v3（正确列索引）
 * 监控：输入后静置期间是否持续刷新（API 请求 + FloatPanel 重挂载 + React 渲染）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const API_BASE = 'http://localhost:3000';
const FE = 'http://localhost:8081';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const SHOT = path.join(__dirname, 'screenshots', 'stab3');
if (fs.existsSync(SHOT)) fs.rmSync(SHOT, { recursive: true });
fs.mkdirSync(SHOT, { recursive: true });
async function apiJson(p, o = {}) {
  const r = await fetch(API_BASE + p, o);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`${p} -> ${j.message}`);
  return j.data;
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const auth = { Authorization: 'Bearer ' + token };
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();

  const errors = [];
  const maxDepth = [];
  let apiHits = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (/Maximum update depth|exceeded|re-render|infinite/i.test(t)) maxDepth.push(t);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/staff/')) apiHits.push({ t: Date.now(), url: u.replace(/\?.*$/, '') });
  });

  await page.goto(`${FE}/staff/login`, { waitUntil: 'networkidle' }); await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")'); await sleep(1800);

  const docs = await apiJson('/api/staff/documents?pageSize=20', { headers: auth });
  const list = docs.list || docs || [];
  const docId = Array.isArray(list) && list.length ? list[0].id : null;
  await page.goto(`${FE}/staff/workbench/${docId}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const pqTab = page.locator('nav button:has-text("采购报价"), [role="tab"]:has-text("采购报价")').first();
  if (await pqTab.count() > 0) { await pqTab.click(); await sleep(2500); }
  await page.waitForSelector('.ds-table-shell .ant-table-tbody tr', { timeout: 10000 }).catch(() => {});

  // 找有"34"的行（产品名）
  const rowCount = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  let targetRow = page.locator('.ds-table-shell .ant-table-tbody tr').nth(0);
  for (let i = 0; i < rowCount; i++) {
    const v = await page.locator('.ds-table-shell .ant-table-tbody tr').nth(i).locator('td').nth(2).locator('input').first().inputValue().catch(() => '');
    if (v && v.trim()) { targetRow = page.locator('.ds-table-shell .ant-table-tbody tr').nth(i); log(`目标行${i} 产品="${v}"`); break; }
  }

  // ============ 测试1：产品列输入后稳定性 ============
  log('\n===== 测试1: 产品列输入后稳定性（5秒监控）=====');
  const prodInput = targetRow.locator('td').nth(2).locator('input').first();
  await prodInput.click();
  await sleep(300);
  // 清空再输入
  await prodInput.fill('');
  await sleep(200);

  const t0 = Date.now();
  const api0 = apiHits.length;
  await page.keyboard.type('测试组合', { delay: 80 });
  await sleep(800); // 等 debounce 250ms + 搜索

  log(`  输入完成. API总数=${apiHits.length - api0}`);
  await page.screenshot({ path: path.join(SHOT, 't1_panel.png') });

  // 静置 5 秒，每秒采样 API 增量
  log('  静置 5 秒采样:');
  let prevApi = apiHits.length;
  let stable = true;
  for (let s = 1; s <= 5; s++) {
    await sleep(1000);
    const cur = apiHits.length;
    const delta = cur - prevApi;
    log(`    第${s}秒: API增量=${delta}`);
    if (delta > 3) stable = false;
    prevApi = cur;
  }
  log(`  判定: ${stable ? '✓ 输入后稳定' : '❌ 输入后持续刷新'}`);

  // 检查面板是否还在
  const fpCount = await page.locator('.float-panel, .product-picker-main-float-panel').count();
  log(`  FloatPanel 当前数量: ${fpCount}`);

  await page.mouse.click(5, 5); await sleep(500);

  // ============ 测试2：单位列下拉面板稳定性 ============
  log('\n===== 测试2: 单位列下拉面板稳定性 =====');
  const unitCell = targetRow.locator('td').nth(3);
  const unitInput = unitCell.locator('input').first();
  await unitInput.click();
  await sleep(300);
  // 点下拉箭头（最后一个 ctrl）
  const downBtn = unitCell.locator('.ds-input-dropdown-ctrl').last();
  if (await downBtn.count() > 0) {
    await downBtn.click();
    await sleep(1200);
    log('  已展开单位面板');
    await page.screenshot({ path: path.join(SHOT, 't2_unit.png') });

    const api1 = apiHits.length;
    let prevA = api1;
    let uStable = true;
    for (let s = 1; s <= 5; s++) {
      await sleep(1000);
      const cur = apiHits.length;
      const delta = cur - prevA;
      log(`    第${s}秒: API增量=${delta}`);
      if (delta > 3) uStable = false;
      prevA = cur;
    }
    log(`  判定: ${uStable ? '✓ 单位面板稳定' : '❌ 单位面板持续刷新'}`);

    // 在单位面板里输入
    log('  --- 单位列输入"箱" ---');
    await unitInput.click();
    await sleep(200);
    const api2 = apiHits.length;
    await page.keyboard.type('箱', { delay: 60 });
    await sleep(800);
    log(`  输入后 API增量=${apiHits.length - api2}`);
    await page.screenshot({ path: path.join(SHOT, 't2_unit_input.png') });
    let prevA2 = apiHits.length;
    for (let s = 1; s <= 3; s++) {
      await sleep(1000);
      log(`    静置${s}秒: API增量=${apiHits.length - prevA2}`);
      prevA2 = apiHits.length;
    }
  }
  await page.mouse.click(5, 5); await sleep(500);

  // ============ 测试3：单价列下拉面板稳定性 ============
  log('\n===== 测试3: 单价列下拉面板稳定性 =====');
  const priceCell = targetRow.locator('td').nth(5);
  const priceInput = priceCell.locator('input').first();
  await priceInput.click();
  await sleep(300);
  const pDownBtn = priceCell.locator('.ds-input-dropdown-ctrl').last();
  if (await pDownBtn.count() > 0) {
    await pDownBtn.click();
    await sleep(1200);
    log('  已展开单价面板');
    await page.screenshot({ path: path.join(SHOT, 't3_price.png') });
    const api1 = apiHits.length;
    let prevA = api1;
    let pStable = true;
    for (let s = 1; s <= 5; s++) {
      await sleep(1000);
      const cur = apiHits.length;
      const delta = cur - prevA;
      log(`    第${s}秒: API增量=${delta}`);
      if (delta > 3) pStable = false;
      prevA = cur;
    }
    log(`  判定: ${pStable ? '✓ 单价面板稳定' : '❌ 单价面板持续刷新'}`);
  }
  await page.mouse.click(5, 5); await sleep(500);

  // ============ 汇总 ============
  log('\n===== 汇总 =====');
  log(`console.error: ${errors.length}`);
  errors.slice(0, 6).forEach((e) => log('  -', e.slice(0, 180)));
  log(`React 最大更新深度告警: ${maxDepth.length}`);
  maxDepth.slice(0, 4).forEach((e) => log('  -', e.slice(0, 180)));

  const urlCount = {};
  apiHits.forEach((h) => { urlCount[h.url] = (urlCount[h.url] || 0) + 1; });
  log('\nAPI 请求热点:');
  Object.entries(urlCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => log(`  ${v}x ${k}`));

  await browser.close();
  const loop = maxDepth.length > 0;
  log('\n最终:', loop ? '❌ 存在无限循环' : '✓ 无无限循环告警');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
