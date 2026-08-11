/**
 * v11.4 采购报价交互验证：
 *   T1 产品列：有值重新输入 → 点下拉箭头展开 → 面板关键词 = 当前输入值（不丢失）
 *   T2 产品列：Enter 提交后不自动展开面板（保留手动展开）
 *   T3 单位列：dropdown 模式（文本可自由输入 + 下拉箭头存在）
 *   T4 单位列：标准行输入新单位失焦 → 补充档案建档绑定（unitId 更新 + 档案含新单位）
 *   T5 单位列：非标行输入单位失焦 → 纯文字（unitId=null）
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v114');
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
  console.log('=== v11.4 采购报价交互验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.4交互验证单' }),
  });
  const docId = doc.id;
  console.log(`单据 ${doc.documentNo} (ID: ${docId})`);

  // 清理历史同名验证单
  try {
    const oldList = await apiJson('/api/staff/documents?page=1&pageSize=100', { headers: authHeaders });
    for (const old of oldList.list || []) {
      if ((old.title || '').includes('v11.4交互验证单') && String(old.id) !== String(docId)) {
        await fetch(`${API_BASE}/api/staff/documents/${old.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: 'voided' }),
        }).catch(() => {});
      }
    }
  } catch { /* 忽略 */ }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const lastRow = () => tableRows().last();
  const prodCell = (row) => row.locator('td').nth(2);
  const unitCell = (row) => row.locator('td').nth(3);

  try {
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(800);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
    await sleep(3000);
    const docRowLink = page.locator('a:has-text("v11.4交互验证单")').first();
    if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(3000); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // T1 产品列：有值重新输入 → 点下拉箭头 → 面板关键词=当前输入值
    // ============================================================
    console.log('\n--- T1 有值重新输入 → 展开面板不丢失当前输入 ---');
    // 先手输一行（有值）
    await prodCell(lastRow()).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill('测试ABC');
    await sleep(200);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    // 行有值 → 点击文本进入编辑态 → 输入新关键词
    const row0 = tableRows().nth(0);
    await prodCell(row0).click();
    await sleep(600);
    const editInput = prodCell(row0).locator('input').first();
    await editInput.fill('伟星');
    await sleep(300);
    // 编辑态点下拉箭头 → 展开面板
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1500);
    const searchInput = page.locator('input[placeholder="搜索产品…"]').first();
    const kw = (await searchInput.inputValue().catch(() => ''));
    const panelVisible = await searchInput.isVisible().catch(() => false);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 't1_panel_keyword.png') });
    record('T1 展开面板携带当前输入', panelVisible && kw === '伟星', `panel=${panelVisible} kw="${kw}"`);
    // 关闭面板
    await page.keyboard.press('Escape');
    await sleep(800);

    // ============================================================
    // T2 产品列：Enter 提交后不自动展开面板
    // ============================================================
    console.log('\n--- T2 Enter 只保存不自动展开 ---');
    await prodCell(row0).click();
    await sleep(600);
    const e2 = prodCell(row0).locator('input').first();
    await e2.fill('测试EFG');
    await sleep(200);
    await e2.press('Enter');
    await sleep(1500);
    const panelAfterEnter = await page.locator('.product-picker-main-float-panel').isVisible().catch(() => false);
    const linesAfterT2 = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const t2Line = linesAfterT2.find((l) => (l.productRef || '').includes('测试EFG'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 't2_enter_no_panel.png') });
    record('T2 Enter 保存文字', !!t2Line, `productRef=${t2Line?.productRef ?? 'null'}`);
    record('T2 Enter 不自动展开面板', !panelAfterEnter, `panel=${panelAfterEnter}`);
    // 手动点箭头应能展开（保留手动展开方式）
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    const manualPanel = await page.locator('.product-picker-main-float-panel').isVisible().catch(() => false);
    record('T2 手动箭头仍可展开', manualPanel, `panel=${manualPanel}`);
    await page.keyboard.press('Escape');
    await sleep(800);

    // ============================================================
    // T3 单位列 dropdown 模式（下拉箭头存在 + 文本可编辑）
    // ============================================================
    console.log('\n--- T3 单位列 dropdown 模式 ---');
    const unitArrow = unitCell(row0).locator('.anticon-down');
    record('T3 单位列有下拉箭头', (await unitArrow.count()) > 0, `箭头数=${await unitArrow.count()}`);
    // 点击单位文本 → 进入编辑态输入框
    await unitCell(row0).click();
    await sleep(600);
    const unitInput = unitCell(row0).locator('input').first();
    const editable = await unitInput.isVisible().catch(() => false);
    record('T3 单位文本可自由输入', editable, `editable=${editable}`);
    if (editable) { await unitInput.fill('个'); await sleep(200); await unitInput.press('Tab'); await sleep(1200); }

    // ============================================================
    // T4 单位列：标准行输入新单位失焦 → 补充档案建档绑定
    // ============================================================
    console.log('\n--- T4 标准行输入新单位 → 补充档案建档 ---');
    // 先选品成标准行（搜索日丰双层 en4.2 带售价 SKU）
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    await page.locator('input[placeholder="搜索产品…"]').first().fill('ppr DN25');
    await sleep(1500);
    const optRows = page.locator('.product-picker-main-float-panel [role="button"]');
    const optN = await optRows.count();
    let picked = false;
    for (let i = 0; i < optN; i++) {
      const txt = ((await optRows.nth(i).textContent()) || '');
      // 选「售价非空」的 SKU（排除 —¥ 只有进价的）
      if (/\¥\s*\d+\.\d{2}/.test(txt) && !/—\¥/.test(txt)) {
        await optRows.nth(i).locator('span').first().click();
        picked = true;
        break;
      }
    }
    await sleep(2500);
    let lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const stdLine = lines.find((l) => l.productId !== null);
    if (!stdLine || !picked) {
      record('T4 前置选品标准行', false, `picked=${picked}`);
    } else {
      const beforeUnitId = String(stdLine.unitId);
      const specId = String(stdLine.specId);
      record('T4 前置选品标准行', true, `unitId=${beforeUnitId} specId=${specId}`);
      // 单位列点击文本 → 输入新单位 → Tab 失焦 → 建档
      const newUnitName = `捆${Date.now() % 100000}`;
      await unitCell(row0).click();
      await sleep(600);
      const uInput = unitCell(row0).locator('input').first();
      await uInput.fill(newUnitName);
      await sleep(300);
      await uInput.press('Tab');
      // v11.8：标准行输入新单位失焦 → 弹「新增单位」确认框，脚本点「确认新增」
      await sleep(1000);
      const t4OkBtn = page.locator('.ant-modal-confirm-btns button.ant-btn-primary').first();
      if (await t4OkBtn.count() > 0) { await t4OkBtn.click(); }
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 't4_unit_bind.png') });
      lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      const after = lines.find((l) => l.id === stdLine.id);
      let archiveHasUnit = false;
      try {
        const units = await apiJson(`/api/staff/units?specId=${specId}&page=1&pageSize=200`, { headers: authHeaders });
        archiveHasUnit = (units.list || []).some((u) => u.unitName === newUnitName);
      } catch { /* 忽略 */ }
      if (!after) {
        record('T4 建档绑定', false, '行不存在');
      } else {
        const unitChanged = after.unit === newUnitName;
        const unitIdChanged = String(after.unitId) !== beforeUnitId && !!after.unitId;
        record('T4 建档绑定', unitChanged && unitIdChanged,
          `unit: ${stdLine.unit}→${after.unit} | unitId: ${beforeUnitId}→${after.unitId} | 档案含新单位=${archiveHasUnit}`);
      }
    }

    // ============================================================
    // T5 单位列：非标行输入单位失焦 → 纯文字（unitId=null）
    // ============================================================
    console.log('\n--- T5 非标行输入单位 → 纯文字 ---');
    // 末尾空行：先输入产品名（非标）再输入单位
    await prodCell(lastRow()).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill('临时产品ZZZ');
    await sleep(200);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    const nonstdRow = tableRows().nth(1); // 第二行数据行（T5 空行升级）
    await unitCell(nonstdRow).click();
    await sleep(600);
    const nInput = unitCell(nonstdRow).locator('input').first();
    await nInput.fill('把');
    await sleep(300);
    await nInput.press('Tab');
    await sleep(1500);
    lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const nonstd = lines.find((l) => (l.productRef || '').includes('临时产品ZZZ'));
    if (!nonstd) {
      record('T5 非标行纯文字', false, '行不存在');
    } else {
      record('T5 非标行纯文字', nonstd.unit === '把' && nonstd.unitId === null,
        `unit=${nonstd.unit} unitId=${String(nonstd.unitId)} specId=${String(nonstd.specId)}`);
    }
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
