/**
 * 采购报价·产品数据使用闭环 验证脚本（阶段5 v2）
 *
 * DOM 结构说明（UnifiedTable = antd Table）：
 *   tbody tr td 列序：0=操作列(更多菜单) 1=序号 2=产品 3=单位 4=数量 5=单价 6=金额 7=备注（v11.3：单位紧跟产品全名）
 * 手输用 Tab 提交（Enter 会触发选品面板激活）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8081';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pq_product_usage');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API_BASE}${pathname}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${pathname} 失败: ${JSON.stringify(data)}`);
  return data.data;
}

async function run() {
  console.log('=== 采购报价·产品数据使用闭环 验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title: '产品数据使用闭环验证单' }),
  });
  const docId = doc.id;
  console.log(`已建验证单据: ${doc.documentNo} (ID: ${docId})`);
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // 清理历史同名验证单（避免列表点击误中旧单）
  try {
    const oldList = await apiJson('/api/staff/documents?page=1&pageSize=100', { headers: authHeaders });
    for (const old of oldList.list || []) {
      if ((old.title || '').includes('产品数据使用闭环验证单') && String(old.id) !== String(docId)) {
        await fetch(`${API_BASE}/api/staff/documents/${old.id}/status`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: 'voided' }),
        }).catch(() => {});
        console.log(`  已作废旧验证单 ${old.documentNo}`);
      }
    }
  } catch { /* 忽略清理失败 */ }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  // 表格选择器（最后一个 tr = 末尾空行）
  // v11.3 列序：0=操作 1=序号 2=产品 3=单位 4=数量 5=单价 6=金额 7=备注
  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const lastRow = () => tableRows().last();
  const prodCell = (row) => row.locator('td').nth(2);
  const unitCell = (row) => row.locator('td').nth(3);

  try {
    // 登录 + 进入工作台
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(800);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.waitForURL('**/staff/**', { timeout: 10000 }).catch(() => {});
    await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
    await sleep(3000);
    // 当前页是采购清单列表 → 点击该单据行进入订单协同工作台
    const docRowLink = page.locator('a:has-text("产品数据使用闭环验证单")').first();
    if (await docRowLink.count() > 0) {
      await docRowLink.click();
      await sleep(3000);
    }

    // 确保在采购报价视图（点击「采购报价」nav 若存在）
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(2000); }

    // ============================================================
    // S1 手输非标行
    // ============================================================
    console.log('\n--- S1 手输非标行 ---');
    await prodCell(lastRow()).click();
    await sleep(600);
    const freeInput = lastRow().locator('td').nth(2).locator('input').first();
    await freeInput.fill('测试产品ABC');
    await sleep(300);
    await freeInput.press('Tab'); // Tab 触发失焦提交（Enter 会打开选品面板）
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's1_nonstandard_line.png') });
    let lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const l1 = lines.find((l) => (l.productRef || '').includes('测试产品ABC'));
    if (!l1) {
      record('S1 非标行创建', false, '未找到手输行');
    } else {
      const okS1 = l1.productId === null && Number(l1.specId) === 0 && l1.isStandardized === false;
      // 待确认图标：InfoCircleOutlined → .anticon-info-circle（Tooltip title 不渲染到 DOM）
      const pendingIcon = await page.locator('.ds-table-shell .anticon-info-circle').count();
      record('S1 非标行创建', okS1, `productId=${l1.productId} specId=${l1.specId} std=${l1.isStandardized}`);
      record('S1 待确认图标', pendingIcon >= 1, `图标数=${pendingIcon}`);
    }

    // ============================================================
    // S2 选品落库 + 自动填充单价
    // ============================================================
    console.log('\n--- S2 选品落库 + 自动填充单价 ---');
    const row0 = tableRows().nth(0);
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    const searchInput = page.locator('input[placeholder="搜索产品…"]').first();
    await searchInput.fill('ppr DN25');
    await sleep(1500);
    // 选一个带默认售价的 SKU（验证选品自动填充单价）；行文本含 ¥ 即已录售价
    const optRows = page.locator('.product-picker-main-float-panel [role="button"]');
    const optN = await optRows.count();
    // 注意：选项行 grid 布局（产品全名|单位按钮|售价|进价），点击行中心会落在单位按钮上
    // （target.closest('button') 拦截，不触发 confirmPick）→ 必须点击产品全名 span
    const pickByName = async (idx) => {
      await optRows.nth(idx).locator('span').first().click();
    };
    let picked = false;
    for (let i = 0; i < optN; i++) {
      const txt = ((await optRows.nth(i).textContent()) || '');
      // 选「售价非空」的 SKU：面板文本中售价在前（`—¥14.19` 表示售价空+仅有进价，需排除）
      const hasSalePrice = /\¥\s*\d+\.\d{2}/.test(txt) && !/—\¥/.test(txt);
      if (hasSalePrice) {
        await pickByName(i);
        picked = true;
        break;
      }
    }
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's2_picked.png') });
    lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const l2 = lines.find((l) => l.productId !== null);
    if (!picked || !l2) {
      record('S2 选品落库', false, `picked=${picked} productId=${l2?.productId ?? 'null'}`);
    } else {
      const okS2 = !!l2.productId && !!l2.specId && !!l2.brandId && !!l2.unitId && l2.isStandardized === true;
      const priceFilled = Number(l2.unitPrice) > 0;
      const pendingAfter = await page.locator('.ds-table-shell .anticon-info-circle').count();
      record('S2 选品落库', okS2, `pid=${l2.productId} spec=${l2.specId} brand=${l2.brandId} unitId=${l2.unitId} std=${l2.isStandardized}`);
      record('S2 选品填充单价', priceFilled, `unitPrice=${l2.unitPrice}`);
      record('S2 待确认图标消失', pendingAfter === 0, `图标数=${pendingAfter}`);
    }

    // ============================================================
    // S3 改名清空（问题A）
    // ============================================================
    console.log('\n--- S3 改名清空 ---');
    await prodCell(row0).click();
    await sleep(600);
    const renameInput = row0.locator('td').nth(2).locator('input').first();
    await renameInput.fill('测试改名XYZ');
    await sleep(300);
    await renameInput.press('Tab');
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's3_renamed.png') });
    lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const l3 = lines.find((l) => (l.productRef || '').includes('测试改名XYZ'));
    if (!l3) {
      record('S3 改名清空', false, '未找到改名行');
    } else {
      const okS3 = l3.productId === null && l3.brandId === null && l3.unitId === null
        && Number(l3.specId) === 0 && l3.isStandardized === false;
      record('S3 改名清空', okS3, `pid=${l3.productId} spec=${l3.specId} brand=${l3.brandId} unit=${l3.unitId} std=${l3.isStandardized}`);
    }

    // ============================================================
    // S4 换单位联动
    // ============================================================
    console.log('\n--- S4 换单位联动 ---');
    // 先重新选品成标准行
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    await page.locator('input[placeholder="搜索产品…"]').first().fill('ppr');
    await sleep(1500);
    // v11.5：面板首个选项是「新建」（点击会弹确认窗）→ 跳过，点击第一个真实结果选项
    const opt2s = page.locator('.product-picker-main-float-panel [role="button"]');
    const opt2N = await opt2s.count();
    let pickedS4 = false;
    for (let i = 0; i < opt2N; i++) {
      const txt = ((await opt2s.nth(i).textContent()) || '');
      if (txt.includes('新建')) continue;
      await opt2s.nth(i).locator('span').first().click();
      pickedS4 = true;
      break;
    }
    if (!pickedS4) {
      record('S4 换单位前置选品', false, '无结果选项');
    }
    await sleep(2000);
    lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const l4a = lines.find((l) => l.productId !== null);
    if (!l4a) {
      record('S4 换单位前置选品', false, '无标准行');
    } else {
      record('S4 换单位前置选品', true, `unitId=${l4a.unitId} unit=${l4a.unit} specId=${l4a.specId}`);
      // v11.4 单位列 dropdown 模式：点击下拉箭头展开 UnitPicker 面板
      await unitCell(row0).locator('.anticon-down').first().click();
      await sleep(1200);
      // v11.3 换单位=补充档案：输入新单位名 → 面板「新增到该产品」建档（createUnit）→ 绑定新单位 ID
      // 单位名用时间戳后缀保证验证可重复执行（同名已存在时后端 422）
      const newUnitName = `箱${Date.now() % 100000}`;
      const unitInput = page.locator('input[placeholder="选择/输入单位"]').first();
      await unitInput.fill(newUnitName);
      await sleep(1000);
      const addBtn = page.locator('.float-panel button:has-text("新增到该产品")').first();
      let changed = false;
      if (await addBtn.count() > 0) {
        await addBtn.click();
        changed = true;
      }
      // v11.8：新增单位前弹确认框，脚本点「确认新增」
      await sleep(1000);
      const s4OkBtn = page.locator('.ant-modal-confirm-btns button.ant-btn-primary').first();
      if (await s4OkBtn.count() > 0) { await s4OkBtn.click(); }
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's4_unit_switched.png') });
      lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
      const l4 = lines.find((l) => l.id === l4a.id);
      // 档案确认：该 SKU 单位列表应新增该单位
      let archiveHasUnit = false;
      try {
        const units = await apiJson(`/api/staff/units?specId=${l4a.specId}&page=1&pageSize=200`, { headers: authHeaders });
        archiveHasUnit = (units.list || []).some((u) => u.unitName === newUnitName);
      } catch { /* 忽略查询失败 */ }
      if (!changed || !l4) {
        record('S4 换单位联动', false, `changed=${changed}`);
      } else {
        const unitChanged = l4.unit === newUnitName;
        const unitIdBound = !!l4.unitId && l4.unitId !== l4a.unitId;
        record('S4 换单位联动', unitChanged && unitIdBound,
          `unit: ${l4a.unit}→${l4.unit} | unitId: ${l4a.unitId}→${l4.unitId} | 档案含新单位=${archiveHasUnit}`);
      }
    }

    // ============================================================
    // S5 批量补全
    // ============================================================
    console.log('\n--- S5 批量补全档案 ---');
    // 追加两行手输非标行（用末尾空行，两次）
    for (const kw of ['伟星管材二十五', '日丰管件二十']) {
      await prodCell(lastRow()).click();
      await sleep(500);
      const in2 = lastRow().locator('td').nth(2).locator('input').first();
      await in2.fill(kw);
      await sleep(300);
      await in2.press('Tab');
      await sleep(1200);
    }
    lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
    const nonStd = lines.filter((l) => l.productId === null);
    record('S5 非标行就绪', nonStd.length >= 2, `非标行数=${nonStd.length}`);

    const batchBtn = page.locator('button:has-text("补全档案")');
    if (await batchBtn.count() === 0) {
      record('S5 批量补全入口', false, '未找到「补全档案」按钮');
    } else {
      record('S5 批量补全入口', true, '按钮存在');
      await batchBtn.first().click();
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's5_batch_dialog.png') });
      const dialogTitles = await page.locator('.ant-modal-title').allTextContents().catch(() => []);
      record('S5 批量补全弹窗', dialogTitles.some((t) => t.includes('补全产品档案')), dialogTitles.join('|'));

      const searchInputs = page.locator('input[placeholder="输入产品名/品牌/规格检索档案…"]');
      const inputCount = await searchInputs.count();
      record('S5 非标行检索框', inputCount >= 2, `检索框数=${inputCount}`);
      if (inputCount >= 1) {
        await searchInputs.nth(0).fill('伟星');
        await sleep(1500);
        const m0 = page.locator('.ant-modal [role="button"]').first();
        if (await m0.count() > 0) { await m0.click(); await sleep(800); }
      }
      // 第一行选中后输入框替换为「已匹配」展示 → 重新查询剩余输入框
      const remainInputs = page.locator('input[placeholder="输入产品名/品牌/规格检索档案…"]');
      if (await remainInputs.count() >= 1) {
        await remainInputs.first().fill('日丰');
        await sleep(1500);
        const m1 = page.locator('.ant-modal [role="button"]').first();
        if (await m1.count() > 0) { await m1.click(); await sleep(800); }
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's5_matched.png') });

      const bindBtn = page.locator('.ant-modal button:has-text("绑定已匹配")');
      const bindText = ((await bindBtn.textContent().catch(() => '')) || '').trim();
      record('S5 绑定按钮', /绑定已匹配（\d+）/.test(bindText), bindText);
      if (await bindBtn.count() > 0) {
        await bindBtn.first().click();
        await sleep(3000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 's5_bound.png') });
        lines = await apiJson(`/api/staff/documents/${docId}/lines`, { headers: authHeaders });
        // 绑定后：非标行升级为标准行（productId 非空 + isStandardized=true，specId 随档案落库）
        const upgraded = lines.filter((l) => l.productId !== null);
        const allUpgraded = upgraded.length >= 2 && upgraded.every((l) => !!l.productId && !!l.specId && l.isStandardized === true);
        record('S5 批量补全绑定', allUpgraded,
          upgraded.map((l) => `${l.productRef}→pid=${l.productId} spec=${Number(l.specId)} std=${l.isStandardized}`).join(' | '));
      }
    }
  } catch (e) {
    console.error('脚本异常:', e.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n=== 验证结果汇总 ===');
  let passCount = 0;
  for (const r of results) { if (r.pass) passCount++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${passCount}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
}

run();
