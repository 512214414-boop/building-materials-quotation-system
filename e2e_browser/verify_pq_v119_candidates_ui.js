/**
 * v11.9 浏览器验证：用户口语输入 → 快速建档保存 → 相似档案候选出现 → 复用
 *   Q1 采购报价输入「ppr伟星绿色25给水管」→ 新建弹窗 → 保存 → 候选区出现
 *       且含目标档案「ppr DN25给水管 伟星绿 en2.8」
 *   Q2 点「复用」→ 行绑定目标档案（productId/specId 匹配）
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v119');
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
  console.log('=== v11.9 浏览器候选复用验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.9候选复用验证单' }),
  });
  const docId = doc.id;

  // 目标档案
  const search = await apiJson(`/api/staff/products/search?keyword=${encodeURIComponent('ppr DN25 伟星绿')}&size=20`, { headers: authHeaders }).catch(() => null);
  const target = (search?.list ?? []).find((r) =>
    r.type === 'sku' && (r.productName || '').includes('DN25') && (r.brandName || '').includes('伟星'));
  if (!target) { console.error('未找到目标档案'); process.exit(1); }
  console.log(`目标档案: ${target.productName} | ${target.specModel} | ${target.brandName} (specBrandId=${target.specBrandId ?? target.id})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const prodCell = (row) => row.locator('td').nth(2);

  try {
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(800);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
    await sleep(3000);
    const docRowLink = page.locator('a:has-text("v11.9候选复用验证单")').first();
    if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(3000); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // Q1 口语输入 → 新建弹窗 → 保存 → 候选出现
    // ============================================================
    console.log('\n--- Q1 口语输入触发候选 ---');
    const row0 = tableRows().nth(0);
    const spoken = 'ppr伟星绿色25给水管';
    await prodCell(row0).click();
    await sleep(500);
    await prodCell(row0).locator('input').first().fill(spoken);
    await sleep(300);
    await prodCell(row0).locator('input').first().press('Tab');
    await sleep(1200);
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    if (await createOpt.count() > 0) { await createOpt.click(); await sleep(1200); }
    const saveBtn = page.locator('.ant-modal-footer button').last();
    if (await saveBtn.count() > 0) { await saveBtn.click(); await sleep(1200); }
    const confirmSave = page.locator('.ant-modal-confirm button:has-text("确认保存")').first();
    if (await confirmSave.count() > 0) { await confirmSave.click(); }
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q1_candidates.png') });
    const candTexts = (await page.locator('.ant-modal:has-text("检测到相似档案")').allTextContents().catch(() => [])) || [];
    const hasCandidateZone = candTexts.length > 0;
    const candZoneText = candTexts.join(' | ').replace(/\s+/g, ' ');
    const hasTarget = candZoneText.includes('ppr DN25给水管') && candZoneText.includes('伟星绿');
    record('Q1 候选区出现（口语输入命中）', hasCandidateZone,
      `候选区=${hasCandidateZone}`);
    record('Q1 候选含目标档案', hasTarget,
      candZoneText.slice(0, 180));

    // ============================================================
    // Q2 点「复用」→ 行绑定目标档案
    // ============================================================
    console.log('\n--- Q2 复用候选 → 行绑定 ---');
    const reuseBtn = page.locator('.ant-modal button:has-text("复 用"), .ant-modal button:has-text("复用")').first();
    if (await reuseBtn.count() > 0) { await reuseBtn.click(); }
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q2_reused.png') });
    let lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const l0 = lines[0] || null;
    record('Q2 行绑定目标档案', !!l0 && !!l0.productId && !!l0.specId && l0.isStandardized === true,
      `ref="${(l0?.productRef || '').slice(0, 50)}" pid=${l0?.productId} spec=${l0?.specId} std=${l0?.isStandardized}`);
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
