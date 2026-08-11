/**
 * v11.5 快速建档二次确认验证：
 *   Q1 手输新名 → 面板「新建」→ 弹「快速新增产品」窗口（不直接建档）
 *   Q2 弹窗字段分开预填（产品名/品牌/规格/单位独立）
 *   Q3 保存 → 缺省值二次确认（规格/单位空提示）→ 确认 → 建档（分开存储：产品名+普通品牌+通用+件）
 *   Q4 同名再次输入 → 建档幂等复用（不再重复生成档案）
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_v115');
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
  console.log('=== v11.5 快速建档二次确认验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.5快速建档验证单' }),
  });
  const docId = doc.id;
  console.log(`单据 ${doc.documentNo} (ID: ${docId})`);
  try {
    const oldList = await apiJson('/api/staff/documents?page=1&pageSize=100', { headers: authHeaders });
    for (const old of oldList.list || []) {
      if ((old.title || '').includes('v11.5快速建档验证单') && String(old.id) !== String(docId)) {
        await fetch(`${API_BASE}/api/staff/documents/${old.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: 'voided' }),
        }).catch(() => {});
      }
    }
  } catch { /* 忽略 */ }

  // 唯一产品名（时间戳）
  const productName = `测试新品${Date.now() % 100000}`;
  const fullName = `${productName} 普通品牌 通用`;

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
    const link = page.locator('a:has-text("v11.5快速建档验证单")').first();
    if (await link.count() > 0) { await link.click(); await sleep(3000); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // Q1 手输新名 → 面板「新建」→ 弹窗
    // ============================================================
    console.log('\n--- Q1 新建入口弹确认窗 ---');
    await lastRow().locator('td').nth(2).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill(productName);
    await sleep(300);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    // 点下拉箭头展开面板（搜索已保存的产品名）
    const row0 = tableRows().nth(0);
    await row0.locator('td').nth(2).locator('.anticon-down').first().click();
    await sleep(1500);
    const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    const createVisible = await createOpt.isVisible().catch(() => false);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q1_new_option.png') });
    if (!createVisible) {
      record('Q1 新建入口存在', false, '未找到「新建」选项');
    } else {
      record('Q1 新建入口存在', true, (await createOpt.textContent()).trim());
      await createOpt.click();
      await sleep(1200);
      const dialogTitle = await page.locator('.ant-modal-title').allTextContents().catch(() => []);
      const isDialog = dialogTitle.some((t) => t.includes('快速新增产品'));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q1_dialog.png') });
      record('Q1 弹出快速新增产品窗口', isDialog, dialogTitle.join('|'));
    }

    // ============================================================
    // Q2 弹窗字段分开预填
    // ============================================================
    console.log('\n--- Q2 字段分开预填 ---');
    const nameInput = page.locator('.ant-modal input[placeholder="如 PPR热水管"]').first();
    const brandInput = page.locator('.ant-modal input[placeholder="留空默认普通品牌"]').first();
    const specInput = page.locator('.ant-modal input[placeholder="留空默认通用"]').first();
    const unitInput = page.locator('.ant-modal input[placeholder="留空默认件"]').first();
    const nameVal = (await nameInput.inputValue().catch(() => ''));
    const brandVal = (await brandInput.inputValue().catch(() => ''));
    const specVal = (await specInput.inputValue().catch(() => ''));
    const unitVal = (await unitInput.inputValue().catch(() => ''));
    record('Q2 产品名预填关键词', nameVal === productName, `name="${nameVal}"`);
    record('Q2 品牌预填普通品牌', brandVal === '普通品牌', `brand="${brandVal}"`);
    record('Q2 规格/单位留空待兜底', specVal === '' && unitVal === '', `spec="${specVal}" unit="${unitVal}"`);

    // ============================================================
    // Q3 保存 → 缺省值二次确认 → 确认 → 建档
    // ============================================================
    console.log('\n--- Q3 缺省值确认 → 建档 ---');
    // 注意：antd 对双汉字按钮自动插空格（「保存」渲染为「保 存」），用 footer 末位按钮定位保存
    await page.locator('.ant-modal-footer button').last().click();
    await sleep(1200);
    const confirmTitle = await page.locator('.ant-modal-confirm-title').allTextContents().catch(() => []);
    const confirmBody = ((await page.locator('.ant-modal-confirm-content').textContent().catch(() => '')) || '');
    const hasFillTip = /规格型号未填|单位未填/.test(confirmBody);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q3_confirm.png') });
    record('Q3 缺省值二次确认弹出', hasFillTip, confirmBody.replace(/\s+/g, ' ').slice(0, 80));
    await page.locator('.ant-modal-confirm button:has-text("确认保存")').first().click();
    await sleep(2000);
    // v11.7：若与历史档案相似触发候选 → 点「仍要新建」强制建档（回归候选决策交互）
    const forceBtn = page.locator('.ant-modal-footer button:has-text("仍要新建")');
    if (await forceBtn.count() > 0) { await forceBtn.first().click(); }
    await sleep(3000);
    let lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const created = lines.find((l) => (l.productRef || '').includes(productName));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q3_created.png') });
    if (!created) {
      record('Q3 建档成功', false, '行未关联档案');
    } else {
      const ok = !!created.productId && !!created.specId && created.isStandardized === true
        && (created.productRef || '').includes('普通品牌') && (created.productRef || '').includes('通用');
      record('Q3 建档成功（分开存储）', ok,
        `ref="${(created.productRef || '').slice(0, 40)}" pid=${!!created.productId} spec=${!!created.specId} std=${created.isStandardized}`);
    }

    // ============================================================
    // Q4 同名再次输入 → 不重复建档（档案数不变）
    // ============================================================
    console.log('\n--- Q4 同名不重复建档 ---');
    // 统计同名档案数量（通过搜索接口）
    const searchBefore = await apiJson(`/api/staff/products/search?keyword=${encodeURIComponent(productName)}&size=30`, { headers: authHeaders }).catch(() => null);
    const matchCountBefore = (searchBefore?.list ?? []).filter((r) => r.type === 'sku' && (r.productName || '').includes(productName)).length;
    // 追加第二行，输入相同产品名
    await lastRow().locator('td').nth(2).click();
    await sleep(500);
    await lastRow().locator('td').nth(2).locator('input').first().fill(productName);
    await sleep(300);
    await lastRow().locator('td').nth(2).locator('input').first().press('Tab');
    await sleep(1500);
    // 打开面板：应搜到已有档案（完整名）而非必须新建
    const row1 = tableRows().nth(1);
    await row1.locator('td').nth(2).locator('.anticon-down').first().click();
    await sleep(1500);
    const optTexts = await page.locator('.product-picker-main-float-panel [role="button"]').allTextContents().catch(() => []);
    // 面板选项展示格式为「品牌·产品名·规格单位」，判断是否已存在非「新建」的既有档案选项
    const hasExisting = optTexts.some(
      (t) => (t || '').includes(productName) && !(t || '').includes('新建')
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'q4_same_name.png') });
    record('Q4 同名检索到已有档案', hasExisting, `选项=${optTexts.slice(0, 3).map((t) => t.replace(/\s+/g, '').slice(0, 24)).join(' | ')}`);
    const searchAfter = await apiJson(`/api/staff/products/search?keyword=${encodeURIComponent(productName)}&size=30`, { headers: authHeaders }).catch(() => null);
    const matchCountAfter = (searchAfter?.list ?? []).filter((r) => r.type === 'sku' && (r.productName || '').includes(productName)).length;
    record('Q4 同名不重复建档', matchCountAfter === matchCountBefore, `档案匹配数 ${matchCountBefore} → ${matchCountAfter}`);
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
