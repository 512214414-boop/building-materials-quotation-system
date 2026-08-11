// v2.8 布局整改视图验证 - 精确 DOM 检查版本
// 通过 DOM 结构精确判定 StageActionBar / StageBizStrip 是否存在
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'v28_verify');

const ADMIN = { username: 'admin', password: 'Admin@123' };

// menu.config 中实际注册的 8 个工作台视图（RequireConfirm 不在其中）
const REGISTERED_VIEWS = [
  { key: 'PurchaseQuote', label: '采购报价', tabText: '采购报价', permissionKey: 'purchase_quote' },
  { key: 'PaymentReconcile', label: '收款对账', tabText: '收款对账', permissionKey: 'payment_recon' },
  { key: 'Allocation', label: '统一配货', tabText: '统一配货', permissionKey: 'allocation' },
  { key: 'Delivery', label: '订单交付', tabText: '订单交付', permissionKey: 'delivery_fulfill' },
  { key: 'CostVerify', label: '成本标注', tabText: '成本标注', permissionKey: 'cost_verify' },
  { key: 'RefundAfterSale', label: '售后退款', tabText: '售后退款', permissionKey: 'after_sales' },
  { key: 'SalesSummary', label: '销售汇总', tabText: '销售汇总', permissionKey: 'sales_summary' },
  { key: 'ArchiveView', label: '定档归档', tabText: '定档归档', permissionKey: 'archive' },
];

// 用户列出的 8 个待验证视图（RequireConfirm 不在 menu.config 注册中）
const USER_LISTED_VIEWS = [
  { key: 'RequireConfirm', label: '需求确认', tabText: '需求确认', permissionKey: 'demand_confirm?' },
  { key: 'PurchaseQuote', label: '报价核算(采购报价)', tabText: '采购报价', permissionKey: 'purchase_quote' },
  { key: 'PaymentReconcile', label: '收款对账', tabText: '收款对账', permissionKey: 'payment_recon' },
  { key: 'Delivery', label: '交付履约(订单交付)', tabText: '订单交付', permissionKey: 'delivery_fulfill' },
  { key: 'CostVerify', label: '成本核定(成本标注)', tabText: '成本标注', permissionKey: 'cost_verify' },
  { key: 'RefundAfterSale', label: '退换售后(售后退款)', tabText: '售后退款', permissionKey: 'after_sales' },
  { key: 'SalesSummary', label: '销售汇总', tabText: '销售汇总', permissionKey: 'sales_summary' },
  { key: 'ArchiveView', label: '定档归档', tabText: '定档归档', permissionKey: 'archive' },
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginAndGetToken(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  return data?.data?.accessToken || data?.data?.token || null;
}

async function getFirstDocumentId(token) {
  const res = await fetch(`${API_BASE}/api/staff/documents?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data?.data?.list?.[0]?.id ?? null;
}

async function loginStaff(page, username, password) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await delay(1500);
  await page.locator('input[placeholder="请输入用户名"]').fill(username);
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/staff/documents**', { timeout: 15000 });
  await delay(1500);
}

// 通过点击 Tab 切换视图（更可靠，模拟真实用户行为）
async function switchViewByTab(page, tabText) {
  // 工作台九视图 Tab：button 内文本为视图 label
  const btn = page.locator(`button:has-text("${tabText}")`).first();
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) return false;
  await btn.click();
  await delay(2500); // 等待视图懒加载 + 数据请求
  return true;
}

// 精确 DOM 检查：StageActionBar / StageBizStrip
async function inspectViewDOM(page, viewKey, viewLabel) {
  const result = {
    view: viewLabel,
    key: viewKey,
    stageActionBar: { found: false, countText: '', actionButtons: [] },
    stageBizStrip: { found: false, bizFields: [], hasYen: false },
    oldResidue: { statCard: false, lockBanner: false, homegrown: false },
    permissionDenied: false,
    tableArea: '无',
    screenshot: null,
    notes: [],
  };

  // 截图
  const shotName = `dom_${viewKey}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotName), fullPage: false });
  result.screenshot = shotName;

  // ---------- 精确 DOM 检查：通过 React 渲染后的 DOM 结构 ----------
  // StageActionBar 容器：height: 28px, borderBottom 1px, padding 0 12px
  // 包含 "共 N 项/行" 文本
  // 检查策略：查找含 "共" "项"/"行"/"条"/"笔" 的 span，且其祖先容器高度 ≤ 32px

  // 1. 收集所有"共 X 项/行"模式
  const actionBarInfo = await page.evaluate(() => {
    const allSpans = Array.from(document.querySelectorAll('span'));
    const matches = [];
    for (const span of allSpans) {
      const text = (span.textContent || '').trim();
      if (/^共\s*\d+\s*(项|行|条|笔)$/.test(text)) {
        // 找到 StageActionBar 容器：上溯至含 borderBottom + height 28 的父级
        let container = span;
        for (let i = 0; i < 6 && container; i++) {
          container = container.parentElement;
          if (!container) break;
          const style = window.getComputedStyle(container);
          const h = parseInt(style.height, 10);
          if (h >= 24 && h <= 36 && style.borderBottomWidth !== '0px') {
            // 收集该容器内所有按钮文本
            const buttons = Array.from(container.querySelectorAll('button'))
              .map((b) => (b.textContent || '').trim())
              .filter(Boolean);
            matches.push({ countText: text, actionButtons: buttons, height: h });
            break;
          }
        }
      }
    }
    return matches;
  });
  if (actionBarInfo.length > 0) {
    result.stageActionBar.found = true;
    result.stageActionBar.countText = actionBarInfo[0].countText;
    result.stageActionBar.actionButtons = actionBarInfo[0].actionButtons;
  }

  // 2. 检查 StageBizStrip：BizField = label: value 模式
  // BizField 结构：<span><span>label:</span><span>value</span></span>
  // 检测策略：查找带 ¥ 的金额 + label: 文本
  const bizStripInfo = await page.evaluate(() => {
    // 查找所有 span 文本，找 ¥ 符号
    const hasYen = document.body.innerText.includes('¥');
    // BizField 的 label 后跟 ":"，如 "应收:" "已收:"
    const labelPatterns = [
      '需求总量', '已配', '缺口', '来源数',
      '应收', '已收', '未收', '本次应收',
      '毛利', '毛利率', '成本', '总成本', '成本总额',
      '销售额', '订单总额', '退款', '已退',
      '已发', '未发', '已交付', '未交付',
      '已定档', '未定档', '已归档', '未归档',
      '行数', '项数', '笔数', '总数',
      '售价', '采购价', '实付', '应付',
    ];
    const foundLabels = [];
    const allSpans = Array.from(document.querySelectorAll('span'));
    for (const span of allSpans) {
      const text = (span.textContent || '').trim();
      for (const label of labelPatterns) {
        // 严格匹配 "label:" 或 "label：" 模式
        if (text === `${label}:` || text === `${label}：`) {
          foundLabels.push(label);
        }
      }
    }
    // 进一步：检查是否有 StageBizStrip 容器（高度约 32px，borderBottom）
    let bizStripContainer = null;
    for (const span of allSpans) {
      if (foundLabels.length === 0) break;
      const text = (span.textContent || '').trim();
      if (foundLabels.some((l) => text === `${l}:` || text === `${l}：`)) {
        let container = span;
        for (let i = 0; i < 8 && container; i++) {
          container = container.parentElement;
          if (!container) break;
          const style = window.getComputedStyle(container);
          const h = parseInt(style.height, 10);
          if (h >= 28 && h <= 40 && style.borderBottomWidth !== '0px' && style.overflowX === 'auto') {
            bizStripContainer = true;
            break;
          }
        }
        if (bizStripContainer) break;
      }
    }
    return { hasYen, foundLabels: [...new Set(foundLabels)], bizStripContainer };
  });
  result.stageBizStrip.hasYen = bizStripInfo.hasYen;
  result.stageBizStrip.bizFields = bizStripInfo.foundLabels;
  if (bizStripInfo.bizStripContainer || bizStripInfo.foundLabels.length >= 2) {
    result.stageBizStrip.found = true;
  }

  // 3. 检查旧结构残留
  const oldResidue = await page.evaluate(() => {
    const r = { statCard: false, lockBanner: false, homegrown: false, details: [] };
    // StatCard 类名
    const statCard = document.querySelector(
      '[class*="stat-card"], [class*="StatCard"], [class*="stat_card"], [class*="statCard"]',
    );
    if (statCard) {
      r.statCard = true;
      r.details.push(`StatCard: ${statCard.className}`);
    }
    // 锁定横幅
    const lockBanner = document.querySelector(
      '[class*="lock-banner"], [class*="lockBanner"], [class*="LockBanner"], [class*="lock_banner"]',
    );
    if (lockBanner) {
      r.lockBanner = true;
      r.details.push(`lockBanner: ${lockBanner.className}`);
    }
    // 自造工具栏
    const homegrown = document.querySelector(
      '[class*="alloc-header"], [class*="alloc-footer"], [class*="toolbar-header"], [class*="toolbar-footer"]',
    );
    if (homegrown) {
      r.homegrown = true;
      r.details.push(`homegrown: ${homegrown.className}`);
    }
    return r;
  });
  result.oldResidue = oldResidue;

  // 4. 检查权限拒绝
  const permDenied = await page.evaluate(() => {
    const body = document.body.innerText;
    return (
      body.includes('暂不能使用') ||
      body.includes('权限不足') ||
      body.includes('没有权限') ||
      body.includes('无权访问')
    );
  });
  result.permissionDenied = permDenied;

  // 5. 检查表格区
  const tableInfo = await page.evaluate(() => {
    const antTable = document.querySelector('.ant-table');
    const empty = document.querySelector('.ant-empty');
    if (antTable) return { type: 'DsTable', rows: antTable.querySelectorAll('tbody tr').length };
    if (empty) return { type: 'Empty', rows: 0 };
    return { type: 'None', rows: 0 };
  });
  result.tableArea = tableInfo.type === 'DsTable'
    ? `有-DsTable(${tableInfo.rows}行)`
    : tableInfo.type === 'Empty'
      ? '有空态'
      : '无';

  return result;
}

(async () => {
  console.log('===== v2.8 布局整改视图验证（精确 DOM 检查）=====\n');

  const token = await loginAndGetToken(ADMIN.username, ADMIN.password);
  if (!token) { console.error('登录失败'); process.exit(1); }
  const docId = await getFirstDocumentId(token);
  if (!docId) { console.error('未找到单据'); process.exit(1); }
  console.log(`API 登录成功，单据 ID: ${docId}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await loginStaff(page, ADMIN.username, ADMIN.password);
  console.log('UI 登录成功\n');

  // 访问工作台
  await page.goto(`${BASE_URL}/staff/workbench/${docId}`, { waitUntil: 'networkidle' });
  await delay(3000);

  // 收集实际可见的视图 Tab
  const actualTabs = [];
  for (const v of [...REGISTERED_VIEWS, { key: 'RequireConfirm', label: '需求确认', tabText: '需求确认' }]) {
    const btn = page.locator(`button:has-text("${v.tabText}")`).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) actualTabs.push({ key: v.key, label: v.label, tabText: v.tabText, visible: true });
  }
  console.log('工作台实际可见的视图 Tab:');
  for (const t of actualTabs) {
    console.log(`  ✓ ${t.label} (key=${t.key})`);
  }
  const requireConfirmVisible = actualTabs.some((t) => t.key === 'RequireConfirm');
  console.log(`\n  >>> 需求确认（RequireConfirm）是否注册为工作台 Tab: ${requireConfirmVisible ? '是' : '否（未在 menu.config 注册）'}\n`);

  // 逐个验证：通过点击 Tab 切换（模拟真实用户行为）
  const results = [];
  for (const view of USER_LISTED_VIEWS) {
    console.log(`--- 验证视图: ${view.label} (key=${view.key}) ---`);
    let switched = false;
    if (view.key !== 'RequireConfirm') {
      // 通过 Tab 切换
      switched = await switchViewByTab(page, view.tabText);
      if (!switched) {
        console.log(`  ✗ Tab "${view.tabText}" 不可见，尝试 URL 切换`);
        await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=${view.key}`, { waitUntil: 'networkidle' });
        await delay(2500);
      }
    } else {
      // RequireConfirm：直接尝试 URL（预期会 fallback 到默认视图）
      await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=RequireConfirm`, { waitUntil: 'networkidle' });
      await delay(2500);
      // 验证 URL 是否回填为 RequireConfirm（如果 fallback 则 URL 会变成 PurchaseQuote）
      const currentUrl = page.url();
      const urlView = new URL(currentUrl).searchParams.get('view');
      console.log(`  RequireConfirm URL fallback 检查: 当前 view 参数 = ${urlView}`);
      if (urlView !== 'RequireConfirm') {
        console.log(`  >>> RequireConfirm 未注册，URL fallback 至: ${urlView}`);
      }
    }

    try {
      const r = await inspectViewDOM(page, view.key, view.label);
      results.push(r);
      console.log(`  StageActionBar: ${r.stageActionBar.found ? `有(${r.stageActionBar.countText}, 按钮: [${r.stageActionBar.actionButtons.join(', ')}])` : '无'}`);
      console.log(`  StageBizStrip: ${r.stageBizStrip.found ? `有(字段: [${r.stageBizStrip.bizFields.join(', ')}]${r.stageBizStrip.hasYen ? ', 含¥金额' : ''})` : '无'}`);
      const residueDesc = r.oldResidue.statCard || r.oldResidue.lockBanner || r.oldResidue.homegrown
        ? `有(${r.oldResidue.details.join('; ')})`
        : '无';
      console.log(`  旧结构残留: ${residueDesc}`);
      console.log(`  权限拒绝: ${r.permissionDenied ? '有' : '无'}`);
      console.log(`  表格区: ${r.tableArea}`);
      console.log(`  截图: ${r.screenshot}`);
    } catch (e) {
      console.error(`  检查异常: ${e.message}`);
    }
    console.log('');
  }

  // 汇总
  console.log('===== 汇总报告 =====\n');
  console.log('视图名 | StageActionBar | StageBizStrip | 旧结构残留 | 权限拒绝 | 截图文件名');
  console.log('---|---|---|---|---|---');
  for (const r of results) {
    console.log(
      `${r.view} | ${r.stageActionBar.found ? '有' : '无'} | ${r.stageBizStrip.found ? '有' : '无'} | ${
        r.oldResidue.statCard || r.oldResidue.lockBanner || r.oldResidue.homegrown ? '有' : '无'
      } | ${r.permissionDenied ? '有' : '无'} | ${r.screenshot || '-'}`,
    );
  }

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'result_dom.json'),
    JSON.stringify({
      testTime: new Date().toISOString(),
      account: ADMIN.username,
      docId,
      actualTabs,
      results,
    }, null, 2),
  );
  console.log(`\n结果已写入: ${path.join(SCREENSHOT_DIR, 'result_dom.json')}`);

  await browser.close();
})();
