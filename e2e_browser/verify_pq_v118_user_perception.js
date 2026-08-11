/**
 * v11.8 用户感知验证：
 *   灵活写行为必须可感知可确认 —— 复用提示 + 新增单位确认
 *
 * API 级：
 *   P1 首次建档（forceNew）→ reused=false
 *   P2 同名精确命中 → reused=true（ok 态）
 *   P3 相似档案 → suggestion 候选元素 reused=true
 *
 * 浏览器级：
 *   Q1 产品名精确命中 → 快速建档弹窗保存 → message「已匹配到现有档案，直接使用（未新建）」
 *   Q2 标准行输入不存在单位 → 失焦 → 弹「新增单位」确认框（明确感知将建档）
 *   Q3 取消 → 不建档（units API 无新单位）+ 行 unit 保留原值
 *   Q4 重新输入 → 确认新增 → 建档绑定（行 unit 更新 + unitId 有值 + 档案含新单位）
 *   Q5 再次输入同名单位 → 命中已有 → 不再弹确认直接绑定（幂等感知）
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v118');
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
  console.log('=== v11.8 用户感知验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.8用户感知验证单' }),
  });
  const docId = doc.id;
  console.log(`单据 ${doc.documentNo} (ID: ${docId})`);

  // 清理历史同名验证单
  try {
    const oldList = await apiJson('/api/staff/documents?page=1&pageSize=100', { headers: authHeaders });
    for (const old of oldList.list || []) {
      if ((old.title || '').includes('v11.8用户感知验证单') && String(old.id) !== String(docId)) {
        await fetch(`${API_BASE}/api/staff/documents/${old.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: 'voided' }),
        }).catch(() => {});
      }
    }
  } catch { /* 忽略 */ }

  const suf = Date.now() % 100000;
  const productName = `ZZ感知甲${suf}`;
  // 面板无匹配的新名 → 触发「新建」入口（弹窗内改填已存在档案名 → 走精确命中复用）
  const freshName = `ZZ感知丙${suf}`;

  // ============================================================
  // P1-P3 API 级 reused 字段断言
  // ============================================================
  console.log('\n--- P1-P3 后端 reused 字段 ---');
  try {
    const created = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ productName, specModel: '', unitName: '件', brandName: '普通品牌', forceNew: true }),
    });
    record('P1 首次建档 reused=false', created.result.reused === false,
      `reused=${created.result.reused} product=${created.result.product.id}`);
    const reused = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ productName, specModel: '', unitName: '件', brandName: '普通品牌' }),
    });
    record('P2 同名精确命中 reused=true', reused.result.reused === true,
      `reused=${reused.result.reused} 同 product=${reused.result.product.id === created.result.product.id}`);
    // 相似名（匹配度≥60%）→ suggestion 候选 reused=true
    const similarName = `${productName}plus`;
    const sim = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ productName: similarName, specModel: '', unitName: '件', brandName: '普通品牌' }),
    });
    const isSuggestion = sim.status === 'suggestion' && Array.isArray(sim.candidates) && sim.candidates.length > 0;
    record('P3 相似档案走 suggestion', isSuggestion, `status=${sim.status} 候选数=${sim.candidates?.length ?? 0}`);
    record('P3 候选元素 reused=true', isSuggestion && sim.candidates.every((c) => c.reused === true),
      `候选 reused=${sim.candidates?.map((c) => c.reused).join(',')}`);
  } catch (e) {
    record('P1-P3 后端 reused 验证', false, e.message);
  }

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
    const docRowLink = page.locator('a:has-text("v11.8用户感知验证单")').first();
    if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(3000); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // Q1 精确命中 → 快速建档保存 → 「已使用现有档案」消息
    // ============================================================
    console.log('\n--- Q1 精确命中复用提示 ---');
    // 固定操作第一行（提交后表格自动追加新行，lastRow 会指向新空行导致错位）
    const row0 = tableRows().nth(0);
    await prodCell(row0).click();
    await sleep(500);
    await prodCell(row0).locator('input').first().fill(freshName);
    await sleep(300);
    await prodCell(row0).locator('input').first().press('Tab');
    await sleep(1200);
    // 打开面板 → 点「新建」→ 弹窗（无匹配新名触发新建入口）
    await row0.locator('td').nth(2).locator('.anticon-down').first().click();
    await sleep(1200);
    const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    if (await createOpt.count() > 0) { await createOpt.click(); await sleep(1200); }
    // 弹窗内把产品名改为已存在档案名 → 保存 → 后端宽表组合精确命中 → reused=true
    const nameInput = page.locator('.ant-modal input[placeholder="如 PPR热水管"]').first();
    if (await nameInput.count() > 0) { await nameInput.fill(productName); await sleep(200); }
    const saveBtn = page.locator('.ant-modal-footer button').last();
    if (await saveBtn.count() > 0) { await saveBtn.click(); await sleep(1200); }
    const confirmSave = page.locator('.ant-modal-confirm button:has-text("确认保存")').first();
    if (await confirmSave.count() > 0) { await confirmSave.click(); await sleep(2000); }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q1_reused_msg.png') });
    // antd v6：消息文本在 .ant-message-notice-title（content 结构已废弃）
    const msgTexts = (await page.locator('.ant-message-notice-title').allTextContents().catch(() => [])) || [];
    const hasReuseMsg = msgTexts.some((t) => /已匹配到现有档案|已使用现有档案/.test(t));
    record('Q1 精确命中出现复用提示消息', hasReuseMsg, msgTexts.join(' | ').slice(0, 120));
    // 行绑定为标准行（后续 Q2-Q5 依赖 specId）
    let q1Line = null;
    try {
      const l1 = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      q1Line = l1[0] || null;
    } catch { /* 忽略 */ }
    record('Q1 行绑定标准档案', !!q1Line?.specId && !!q1Line?.productId,
      `specId=${q1Line?.specId} productId=${q1Line?.productId} unit=${q1Line?.unit}`);
    if (!q1Line?.specId) throw new Error('Q1 未绑定标准行，后续用例无法继续');

    // ============================================================
    // Q2 标准行输入新单位 → 失焦 → 弹「新增单位」确认框
    // ============================================================
    console.log('\n--- Q2 新增单位确认框 ---');
    const newUnit = `个${suf}`;
    await unitCell(row0).click();
    await sleep(400);
    const unitInput = unitCell(row0).locator('input').first();
    const editable = await unitInput.isVisible().catch(() => false);
    if (editable) {
      await unitInput.fill(newUnit);
      await sleep(200);
      await unitInput.press('Tab'); // 失焦 → bindUnitByName → 未命中 → 弹确认
    }
    await sleep(1200);
    const confirmTitle = (await page.locator('.ant-modal-confirm-title').allTextContents().catch(() => [])) || [];
    const confirmContent = ((await page.locator('.ant-modal-confirm-content').textContent().catch(() => '')) || '');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q2_confirm_dialog.png') });
    const hasConfirmTitle = confirmTitle.some((t) => t.includes('新增单位'));
    const hasConfirmContent = confirmContent.includes('确认新增到该产品档案');
    record('Q2 弹出新增单位确认框', hasConfirmTitle && hasConfirmContent,
      `title="${confirmTitle.join('|')}" content="${confirmContent.replace(/\s+/g, ' ').slice(0, 60)}"`);

    // ============================================================
    // Q3 取消 → 不建档 + 保留原值
    // ============================================================
    console.log('\n--- Q3 取消不建档 ---');
    let line0 = null;
    try {
      const lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      line0 = lines[0] || null;
    } catch { /* 忽略 */ }
    const beforeUnit = line0 ? line0.unit : '';
    const cancelBtn = page.locator('.ant-modal-confirm-btns button:has-text("取 消")').first();
    if (await cancelBtn.count() > 0) { await cancelBtn.click(); }
    await sleep(1500);
    // 校验：该 SKU 无新单位档案 + 行 unit 保留原值
    let archiveHasUnit = false;
    try {
      const units = await apiJson(`/api/staff/units?specId=${line0?.specId ?? specId}&page=1&pageSize=200`, { headers: authHeaders });
      archiveHasUnit = (units.list || []).some((u) => u.unitName === newUnit);
    } catch { /* 忽略 */ }
    let afterLine = null;
    try {
      const lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      afterLine = lines[0] || null;
    } catch { /* 忽略 */ }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q3_cancelled.png') });
    record('Q3 取消后未建档', !archiveHasUnit, `档案含「${newUnit}」=${archiveHasUnit}`);
    record('Q3 行单位保留原值', afterLine ? afterLine.unit === beforeUnit : false,
      `unit ${beforeUnit} → ${afterLine?.unit}`);

    // ============================================================
    // Q4 重新输入 → 确认新增 → 建档绑定
    // ============================================================
    console.log('\n--- Q4 确认新增建档绑定 ---');
    await unitCell(row0).click();
    await sleep(400);
    const unitInput2 = unitCell(row0).locator('input').first();
    await unitInput2.fill(newUnit);
    await sleep(200);
    await unitInput2.press('Tab');
    await sleep(1000);
    const okBtn = page.locator('.ant-modal-confirm-btns button.ant-btn-primary').first();
    if (await okBtn.count() > 0) { await okBtn.click(); }
    await sleep(2000);
    let lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const q4Line = lines[0] || null;
    let q4ArchiveHasUnit = false;
    let q4UnitList = [];
    try {
      const units = await apiJson(`/api/staff/units?specId=${q4Line?.specId}&page=1&pageSize=200`, { headers: authHeaders });
      q4UnitList = units.list || [];
      q4ArchiveHasUnit = q4UnitList.some((u) => u.unitName === newUnit);
    } catch { /* 忽略 */ }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q4_confirmed.png') });
    record('Q4 确认后档案含新单位', q4ArchiveHasUnit, `档案单位=${q4UnitList.map((u) => u.unitName).join(',')}`);
    record('Q4 行 unit 更新且绑定', q4Line ? q4Line.unit === newUnit && !!q4Line.unitId : false,
      `unit=${q4Line?.unit} unitId=${q4Line?.unitId}`);

    // ============================================================
    // Q5 再次输入同名单位 → 命中已有 → 不弹确认直接绑定
    // ============================================================
    console.log('\n--- Q5 已存在单位不再弹确认 ---');
    await unitCell(row0).click();
    await sleep(400);
    const unitInput3 = unitCell(row0).locator('input').first();
    await unitInput3.fill(newUnit);
    await sleep(200);
    await unitInput3.press('Tab');
    await sleep(1200);
    const confirmTitles5 = (await page.locator('.ant-modal-confirm-title').allTextContents().catch(() => [])) || [];
    const confirmShownAgain = confirmTitles5.some((t) => t.includes('新增单位'));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q5_no_confirm.png') });
    record('Q5 已存在单位不弹确认', !confirmShownAgain, `确认框出现=${confirmShownAgain}`);
    let q5Line = null;
    try {
      const l5 = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      q5Line = l5[0] || null;
    } catch { /* 忽略 */ }
    record('Q5 行仍绑定该单位', q5Line ? q5Line.unit === newUnit && !!q5Line.unitId : false,
      `unit=${q5Line?.unit} unitId=${q5Line?.unitId}`);
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
