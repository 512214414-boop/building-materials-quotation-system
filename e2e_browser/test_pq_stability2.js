/**
 * 采购报价输入稳定性真实测试 v2
 * 复现用户："输入以后那个下拉弹窗打开，它一直页面在刷新刷新刷新"
 *
 * 改进：
 *  - 用 page.keyboard.type 真实键盘输入（触发 React onChange）
 *  - 先 click 输入框聚焦，再点下拉箭头激活 picker
 *  - 监控 /api/staff/products/search 请求频率
 *  - 监控 FloatPanel DOM 反复挂载/卸载
 *  - 监控 React "Maximum update depth" 告警
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const API_BASE = 'http://localhost:3000';
const FE = 'http://localhost:8081';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const SHOT = path.join(__dirname, 'screenshots', 'pq_stability2');
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
  let apiHits = []; // {t, url}
  let panelEvents = []; // FloatPanel mount/unmount

  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (/Maximum update depth|exceeded|re-render|infinite/i.test(t)) maxDepth.push(t);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/staff/')) apiHits.push({ t: Date.now(), url: u.replace(/\?.*$/, ''), full: u });
  });

  // 注入 FloatPanel 监听（在页面加载后注入）
  async function injectPanelWatcher() {
    await page.evaluate(() => {
      window.__PANEL_EVENTS__ = [];
      window.__PANEL_COUNT__ = 0;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) {
              const isPanel = n.classList?.contains('float-panel') ||
                n.classList?.contains('product-picker-main-float-panel') ||
                n.querySelector?.('[class*="float-panel"]') ||
                n.querySelector?.('.product-picker-main-float-panel');
              if (isPanel) {
                window.__PANEL_COUNT__++;
                window.__PANEL_EVENTS__.push({ type: 'mount', t: Date.now() });
              }
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      window.__PANEL_MO__ = mo;
    });
  }

  // 登录
  await page.goto(`${FE}/staff/login`, { waitUntil: 'networkidle' }); await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")'); await sleep(1800);

  const docs = await apiJson('/api/staff/documents?pageSize=20', { headers: auth });
  const list = docs.list || docs || [];
  const docId = Array.isArray(list) && list.length ? list[0].id : null;
  log('单据 ID:', docId);

  await page.goto(`${FE}/staff/workbench/${docId}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const pqTab = page.locator('nav button:has-text("采购报价"), [role="tab"]:has-text("采购报价")').first();
  if (await pqTab.count() > 0) { await pqTab.click(); await sleep(2500); }
  await page.waitForSelector('.ds-table-shell .ant-table-tbody tr', { timeout: 10000 }).catch(() => {});
  await injectPanelWatcher();
  log('采购报价已打开，监听已注入');

  const rowCount = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  log('表格行数:', rowCount);

  // 找第一行数据行（跳过空行）
  let targetRow = null;
  for (let i = 0; i < Math.min(rowCount, 5); i++) {
    const r = page.locator('.ds-table-shell .ant-table-tbody tr').nth(i);
    const txt = await r.locator('td').first().textContent().catch(() => '');
    if (txt && txt.trim()) { targetRow = r; log('目标行', i, ':', txt.trim().slice(0, 30)); break; }
  }
  if (!targetRow) { targetRow = page.locator('.ds-table-shell .ant-table-tbody tr').nth(0); log('用第一行'); }

  // ============ 测试1：产品列输入 ============
  log('\n===== 测试1: 产品列输入稳定性 =====');
  const prodCell = targetRow.locator('td').nth(0);
  const prodInput = prodCell.locator('input').first();
  log('产品列 input 数量:', await prodInput.count());

  if (await prodInput.count() > 0) {
    await prodInput.click();
    await sleep(300);
    await prodInput.focus();
    await sleep(200);

    const apiBefore = apiHits.length;
    const t0 = Date.now();

    // 真实键盘逐字输入
    await page.keyboard.type('测', { delay: 50 });
    await sleep(350);
    await page.keyboard.type('试', { delay: 50 });
    await sleep(600); // 等 debounce 250ms + 搜索

    const t1 = Date.now();
    const apiSearchHits = apiHits.filter((h) => h.url.includes('/products/search')).length;
    const panelCount1 = await page.evaluate(() => window.__PANEL_COUNT__);

    log(`  输入"测试" 后:`);
    log(`    products/search 请求: ${apiSearchHits - (apiBefore ? 0 : 0)}`);
    log(`    FloatPanel 累计挂载: ${panelCount1}`);
    await page.screenshot({ path: path.join(SHOT, 'T1_after_input.png') });

    // 静置 3 秒看是否仍在刷新
    const pc1 = await page.evaluate(() => window.__PANEL_COUNT__);
    const api1 = apiHits.length;
    await sleep(3000);
    const pc2 = await page.evaluate(() => window.__PANEL_COUNT__);
    const api2 = apiHits.length;
    log(`    静置 3s: FloatPanel 挂载增量=${pc2 - pc1} API增量=${api2 - api1}`);
    if (pc2 - pc1 > 2) log('    ❌ 面板仍在反复挂载');
    else if (api2 - api1 > 5) log('    ❌ API 仍在频繁请求');
    else log('    ✓ 静置稳定');

    // 再输入一个字看是否触发新一轮
    const api3 = apiHits.length;
    await page.keyboard.type('组', { delay: 50 });
    await sleep(600);
    const api4 = apiHits.length;
    log(`    再输入"组": API增量=${api4 - api3} ${api4 - api3 > 0 ? '(搜索触发)' : '(未触发)'}`);

    await page.mouse.click(5, 5); await sleep(500);
  }

  // ============ 测试2：单位列下拉面板 ============
  log('\n===== 测试2: 单位列下拉面板稳定性 =====');
  // 重新注入监听（清空计数）
  await page.evaluate(() => { window.__PANEL_COUNT__ = 0; window.__PANEL_EVENTS__ = []; });
  const unitCell = targetRow.locator('td').nth(1);
  const unitInput = unitCell.locator('input').first();
  log('单位列 input 数量:', await unitInput.count());

  if (await unitInput.count() > 0) {
    await unitInput.click();
    await sleep(300);
    // 点下拉箭头展开
    const downBtn = unitCell.locator('.ds-input-dropdown-ctrl').last();
    if (await downBtn.count() > 0) {
      await downBtn.click();
      await sleep(1000);
      log('  已点下拉箭头展开单位面板');
      await page.screenshot({ path: path.join(SHOT, 'T2_unit_panel.png') });

      const pc1 = await page.evaluate(() => window.__PANEL_COUNT__);
      const api1 = apiHits.length;
      await sleep(3000);
      const pc2 = await page.evaluate(() => window.__PANEL_COUNT__);
      const api2 = apiHits.length;
      log(`  单位面板静置 3s: 挂载增量=${pc2 - pc1} API增量=${api2 - api1}`);
      if (pc2 - pc1 > 2) log('    ❌ 单位面板反复刷新');
      else log('    ✓ 单位面板稳定');

      // 在面板里输入
      await unitInput.click();
      await sleep(200);
      const api3 = apiHits.length;
      await page.keyboard.type('箱', { delay: 50 });
      await sleep(600);
      const api4 = apiHits.length;
      log(`  单位输入"箱": API增量=${api4 - api3}`);
      await page.screenshot({ path: path.join(SHOT, 'T2_unit_input.png') });
    }
    await page.mouse.click(5, 5); await sleep(500);
  }

  // ============ 测试3：单价列下拉面板 ============
  log('\n===== 测试3: 单价列下拉面板稳定性 =====');
  await page.evaluate(() => { window.__PANEL_COUNT__ = 0; });
  const priceCell = targetRow.locator('td').nth(3);
  const priceInput = priceCell.locator('input').first();
  log('单价列 input 数量:', await priceInput.count());
  if (await priceInput.count() > 0) {
    await priceInput.click();
    await sleep(300);
    const downBtn = priceCell.locator('.ds-input-dropdown-ctrl').last();
    if (await downBtn.count() > 0) {
      await downBtn.click();
      await sleep(1200);
      log('  已展开单价面板');
      await page.screenshot({ path: path.join(SHOT, 'T3_price_panel.png') });
      const pc1 = await page.evaluate(() => window.__PANEL_COUNT__);
      const api1 = apiHits.length;
      await sleep(3000);
      const pc2 = await page.evaluate(() => window.__PANEL_COUNT__);
      const api2 = apiHits.length;
      log(`  单价面板静置 3s: 挂载增量=${pc2 - pc1} API增量=${api2 - api1}`);
      if (pc2 - pc1 > 2) log('    ❌ 单价面板反复刷新');
      else log('    ✓ 单价面板稳定');
    }
    await page.mouse.click(5, 5); await sleep(500);
  }

  // ============ 汇总 ============
  log('\n===== 汇总 =====');
  log(`console.error: ${errors.length}`);
  errors.slice(0, 8).forEach((e) => log('  -', e.slice(0, 200)));
  log(`React 最大更新深度告警: ${maxDepth.length}`);
  maxDepth.slice(0, 5).forEach((e) => log('  -', e.slice(0, 200)));

  const urlCount = {};
  apiHits.forEach((h) => { urlCount[h.url] = (urlCount[h.url] || 0) + 1; });
  log('\nAPI 请求热点:');
  Object.entries(urlCount).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => log(`  ${v}x ${k}`));

  await browser.close();
  const loop = maxDepth.length > 0;
  log('\n最终判定:', loop ? '❌ 存在无限循环' : '需结合上面数据判断');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
