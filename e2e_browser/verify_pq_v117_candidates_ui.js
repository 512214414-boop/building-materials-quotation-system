/**
 * v11.7 相似档案匹配度候选 浏览器验证：
 *   Q1 手输近似名（规格值近似档案）→ 新建 → 弹窗 → 保存 → 缺省值确认 → 出现候选区
 *   Q2 候选包含已有档案 + 匹配度 ≥ 60%
 *   Q3 点「复用」→ 行直接关联该档案（productId = 档案 id，未新建）
 *   Q4 再次近似输入 → 候选出现 → 点「仍要新建」→ 强制新建（productId ≠ 档案 id）
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v117');
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
  if (data.code !== 0) throw new Error(`${pathname} 失败: ${JSON.stringify(data)}`);
  return data.data;
}

async function run() {
  console.log('=== v11.7 相似档案匹配度候选 验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.7相似档案候选验证单' }),
  });
  const docId = doc.id;
  console.log(`单据 ${doc.documentNo} (ID: ${docId})`);
  try {
    const oldList = await apiJson('/api/staff/documents?page=1&pageSize=100', { headers: authHeaders });
    for (const old of oldList.list || []) {
      if ((old.title || '').includes('v11.7相似档案候选验证单') && String(old.id) !== String(docId)) {
        await fetch(`${API_BASE}/api/staff/documents/${old.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: 'voided' }),
        }).catch(() => {});
      }
    }
  } catch { /* 忽略 */ }

  const suf = Date.now() % 100000;
  const ARCHIVE_NAME = `伟星PPR热水管${suf}`;        // 档案：名 + 规格 DN25
  const SIMILAR_INPUT = `${ARCHIVE_NAME}25`;          // 近似输入：名含25 + 规格空

  // 准备档案 A（forceNew 隔离候选）
  const a = await apiJson('/api/staff/products/quick-create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ productName: ARCHIVE_NAME, specModel: 'DN25', unitName: '件', brandName: '普通品牌', forceNew: true }),
  });
  const archive = a.result;
  console.log(`档案A: ${ARCHIVE_NAME} + DN25 → specBrandId=${archive.specBrand.id}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const lastRow = () => tableRows().last();

  try {
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(800);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
    await sleep(3000);
    const link = page.locator('a:has-text("v11.7相似档案候选验证单")').first();
    if (await link.count() > 0) { await link.click(); await sleep(3000); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // Q1/Q2 近似名 → 候选区出现
    // ============================================================
    console.log('\n--- Q1/Q2 近似输入 → 候选区 ---');
    await lastRow().locator('td').nth(2).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill(SIMILAR_INPUT);
    await sleep(300);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    const row0 = tableRows().nth(0);
    await row0.locator('td').nth(2).locator('.anticon-down').first().click();
    await sleep(1500);
    const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    await createOpt.click();
    await sleep(1200);
    // 弹窗保存（antd 双汉字按钮插空格，footer 末位为保存）
    await page.locator('.ant-modal-footer button').last().click();
    await sleep(1200);
    // 缺省值二次确认 → 确认保存
    const confirmBtn = page.locator('.ant-modal-confirm button:has-text("确认保存")');
    if (await confirmBtn.count() > 0) { await confirmBtn.first().click(); await sleep(2500); }
    // 候选区出现
    const candText = await page.locator('.ant-modal').textContent().catch(() => '');
    const hasCand = (candText || '').includes('检测到相似档案');
    // antd 双汉字按钮插空格（「复用」渲染为「复 用」）→ 正则匹配
    const candBtns = page.locator('.ant-modal button', { hasText: /复\s*用/ });
    const candCount = await candBtns.count();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q1_candidates.png') });
    record('Q1 候选区出现', hasCand, `候选行数=${candCount}`);
    record('Q2 候选含档案A', candCount >= 1 && (candText || '').includes(ARCHIVE_NAME),
      `含「${ARCHIVE_NAME}」=${(candText || '').includes(ARCHIVE_NAME)}`);

    // ============================================================
    // Q3 点「复用」→ 行关联档案
    // ============================================================
    console.log('\n--- Q3 复用候选 → 行关联档案 ---');
    if (candCount >= 1) {
      await candBtns.first().click();
      await sleep(2500);
      const lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      const l = lines.find((x) => (x.productRef || '').includes(ARCHIVE_NAME));
      const bound = !!l && String(l.productId) === String(archive.product.id)
        && Number(l.specId) === Number(archive.spec.id)
        && String(l.brandId) === String(archive.brand.id);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q3_reused.png') });
      record('Q3 复用后行关联档案', bound,
        l ? `productId=${l.productId} specId=${l.specId} ref="${(l.productRef || '').slice(0, 30)}"` : '未找到行');
    } else {
      record('Q3 复用后行关联档案', false, '无候选可点');
    }

    // ============================================================
    // Q4 「仍要新建」→ forceNew 新建
    // ============================================================
    console.log('\n--- Q4 仍要新建 → forceNew ---');
    await lastRow().locator('td').nth(2).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill(SIMILAR_INPUT);
    await sleep(300);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    const row1 = tableRows().nth(1);
    await row1.locator('td').nth(2).locator('.anticon-down').first().click();
    await sleep(1500);
    const createOpt2 = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    await createOpt2.click();
    await sleep(1200);
    await page.locator('.ant-modal-footer button').last().click();
    await sleep(1200);
    const confirmBtn2 = page.locator('.ant-modal-confirm button:has-text("确认保存")');
    if (await confirmBtn2.count() > 0) { await confirmBtn2.first().click(); await sleep(2500); }
    const forceBtn = page.locator('.ant-modal-footer button:has-text("仍要新建")');
    const forceCount = await forceBtn.count();
    if (forceCount > 0) {
      await forceBtn.first().click();
      await sleep(3000);
      const lines2 = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      const l2 = lines2.filter((x) => (x.productRef || '').includes(SIMILAR_INPUT) && !!x.productId);
      const forceNew = l2.length > 0 && String(l2[0].productId) !== String(archive.product.id);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q4_force_new.png') });
      record('Q4 仍要新建 → 强制建档', forceNew,
        l2.length > 0 ? `productId=${l2[0].productId}（≠档案 ${archive.product.id}）` : '未找到新行');
    } else {
      record('Q4 仍要新建 → 强制建档', false, '未出现「仍要新建」按钮');
    }
    await page.keyboard.press('Escape');
  } catch (e) {
    console.error('脚本异常:', e.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n=== 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) { if (r.pass) pass++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
}

run();
