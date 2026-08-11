// v2.8 布局整改剩余视图验证脚本
// 验证目标：8 个工作台视图（RequireConfirm / PurchaseQuote / PaymentReconcile / Delivery /
//              CostVerify / RefundAfterSale / SalesSummary / ArchiveView）
// 每个视图检查项：L3 StageActionBar / L2 StageBizStrip / 旧结构残留 / 权限拒绝 / 表格区

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'v28_verify');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const ADMIN = { username: 'admin', password: 'Admin@123' };

// 用户列出的 8 个待验证视图（key 与 menu.config.WorkbenchViewDef.key 对应）
// 注意：RequireConfirm 在 menu.config 中未注册，需通过 URL 直接验证
const VIEWS_TO_VERIFY = [
  { key: 'RequireConfirm', label: '需求确认', expectedTabText: null }, // 未注册到工作台 Tab
  { key: 'PurchaseQuote', label: '报价核算(采购报价)', expectedTabText: '采购报价' },
  { key: 'PaymentReconcile', label: '收款对账', expectedTabText: '收款对账' },
  { key: 'Delivery', label: '交付履约(订单交付)', expectedTabText: '订单交付' },
  { key: 'CostVerify', label: '成本核定(成本标注)', expectedTabText: '成本标注' },
  { key: 'RefundAfterSale', label: '退换售后(售后退款)', expectedTabText: '售后退款' },
  { key: 'SalesSummary', label: '销售汇总', expectedTabText: '销售汇总' },
  { key: 'ArchiveView', label: '定档归档', expectedTabText: '定档归档' },
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 通过 API 获取 token + 第一个单据 ID
async function getFirstDocumentId(token) {
  const res = await fetch(`${API_BASE}/api/staff/documents?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data?.data?.list?.[0]?.id ?? null;
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

async function loginStaff(page, username, password) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await delay(1500);
  await page.locator('input[placeholder="请输入用户名"]').fill(username);
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/staff/documents**', { timeout: 15000 });
  await delay(1500);
}

// 收集工作台 Tab 文案
async function collectWorkbenchTabs(page) {
  // 工作台九视图 Tab 位于工作台容器中，按钮文字 = 视图 label
  // 容器中包含多单据标签 + 九视图 Tab（在 DocumentContextBar 附近）
  // 这里用宽松匹配：所有 button 中文字与已知视图名匹配
  const allButtons = await page.locator('button').allTextContents();
  const tabs = allButtons
    .map((t) => (t || '').trim())
    .filter(Boolean);
  return tabs;
}

// 验证单个视图
async function verifyView(page, viewKey, viewLabel, docId) {
  const result = {
    view: viewLabel,
    key: viewKey,
    stageActionBar: '无',
    stageBizStrip: '无',
    oldResidue: '无',
    permissionDenied: '无',
    tableArea: '无',
    screenshot: null,
    notes: [],
  };

  // 通过 URL 参数切换视图
  const url = `${BASE_URL}/staff/workbench/${docId}?view=${viewKey}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await delay(2500); // 等待视图懒加载 + 数据请求

  const shotName = `view_${viewKey}.png`;
  const shotPath = path.join(SCREENSHOT_DIR, shotName);
  await page.screenshot({ path: shotPath, fullPage: false });
  result.screenshot = shotName;

  // ---------- 检查权限拒绝 ----------
  const noPermText = await page
    .locator('text=暂不能使用')
    .first()
    .isVisible()
    .catch(() => false);
  const noPermText2 = await page
    .locator('text=权限不足')
    .first()
    .isVisible()
    .catch(() => false);
  const noPermBlock = await page
    .locator('text=没有权限')
    .first()
    .isVisible()
    .catch(() => false);
  if (noPermText || noPermText2 || noPermBlock) {
    result.permissionDenied = '有';
  }

  // ---------- 检查 L3 StageActionBar ----------
  // StageActionBar 渲染 "共 N 项" 或 "共 N 行" 字样
  const stageActionBarMatch = await page
    .locator('span:has-text(/^共\\s*\\d+\\s*(项|行|条|笔)$/)')
    .first()
    .isVisible()
    .catch(() => false);
  // 备用：直接定位 StageActionBar 容器（高度 28px + 含「共」字）
  const gongText = await page
    .locator('span')
    .filter({ hasText: /^共\s*\d+\s*(项|行|条|笔)$/ })
    .first()
    .isVisible()
    .catch(() => false);
  if (stageActionBarMatch || gongText) {
    result.stageActionBar = '有';
  } else {
    // 进一步：查找含「共」「项/行」文本的 span
    const anyGong = await page
      .locator('span:has-text("共")')
      .first()
      .isVisible()
      .catch(() => false);
    if (anyGong) {
      const text = await page.locator('span:has-text("共")').first().textContent();
      if (text && /共\s*\d+\s*(项|行|条|笔)/.test(text)) {
        result.stageActionBar = '有';
      }
    }
  }

  // ---------- 检查 L2 StageBizStrip ----------
  // StageBizStrip 含 BizField：label: value 序列，label 后跟冒号
  // 容器高度 = WORKBENCH_ROW_H（约 32px），有 borderBottom
  // 检测策略：查找带 ¥ 的金额 + label: value 模式
  const yenText = await page
    .locator('span:has-text("¥")')
    .first()
    .isVisible()
    .catch(() => false);
  // 查找常见业务字段 label
  const bizLabels = ['需求总量', '已配', '缺口', '来源数', '应收', '已收', '未收', '毛利', '毛利率', '成本', '销售额', '退款', '已发', '未发', '已退', '已定档', '未定档', '订单总额', '总成本', '总利润', '行数'];
  let bizFieldCount = 0;
  for (const label of bizLabels) {
    const visible = await page
      .locator(`span:has-text("${label}:")`)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) bizFieldCount++;
  }
  if (bizFieldCount >= 1 || yenText) {
    result.stageBizStrip = '有';
  }

  // ---------- 检查旧结构残留 ----------
  // 1. 方形 StatCard 卡片堆叠：检测 div 内含统计数字 + 大字号
  const statCardLike = await page
    .locator('div[class*="stat-card"], div[class*="StatCard"], div[class*="stat_card"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (statCardLike) {
    result.oldResidue = '有-StatCard类名残留';
  }
  // 2. 橙色锁定横幅（alloc-lock-banner 等）
  const lockBanner = await page
    .locator('[class*="lock-banner"], [class*="lockBanner"], [class*="LockBanner"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (lockBanner) {
    result.oldResidue = result.oldResidue === '无' ? '有-锁定横幅' : result.oldResidue + '+锁定横幅';
  }
  // 3. 自造工具栏（alloc-header, alloc-footer 等非 v2.8 类名）
  const homegrown = await page
    .locator('[class*="alloc-header"], [class*="alloc-footer"], [class*="toolbar"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (homegrown) {
    result.oldResidue = result.oldResidue === '无' ? '有-自造工具栏' : result.oldResidue + '+自造工具栏';
  }

  // ---------- 检查表格区 ----------
  const dsTable = await page
    .locator('.ant-table, table')
    .first()
    .isVisible()
    .catch(() => false);
  const emptyState = await page
    .locator('.ant-empty')
    .first()
    .isVisible()
    .catch(() => false);
  if (dsTable) {
    result.tableArea = '有-DsTable';
  } else if (emptyState) {
    result.tableArea = '有空态';
  } else {
    // ArchiveView 可能不是 DsTable 而是阶段卡片
    const archiveCards = await page
      .locator('div:has-text("定档")')
      .first()
      .isVisible()
      .catch(() => false);
    if (archiveCards && viewKey === 'ArchiveView') {
      result.tableArea = '有-阶段卡片(归档)';
    }
  }

  return result;
}

(async () => {
  console.log('===== v2.8 布局整改剩余视图验证 =====\n');

  // 1. 通过 API 获取 token + 单据 ID
  const token = await loginAndGetToken(ADMIN.username, ADMIN.password);
  if (!token) {
    console.error('登录失败：无法获取 token');
    process.exit(1);
  }
  console.log('API 登录成功，token 已获取');

  const docId = await getFirstDocumentId(token);
  if (!docId) {
    console.error('未找到任何单据');
    process.exit(1);
  }
  console.log(`使用单据 ID: ${docId}\n`);

  // 2. 启动浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 3. 通过 UI 登录（建立 cookie + localStorage）
  await loginStaff(page, ADMIN.username, ADMIN.password);
  console.log('UI 登录成功\n');

  // 4. 先访问工作台，收集实际可见的 Tab 文案
  await page.goto(`${BASE_URL}/staff/workbench/${docId}`, { waitUntil: 'networkidle' });
  await delay(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'workbench_initial.png') });

  const tabs = await collectWorkbenchTabs(page);
  console.log(`工作台可见 Tab（前 20 个按钮文本）:`);
  console.log(tabs.slice(0, 20).map((t, i) => `  [${i}] ${t}`).join('\n'));
  console.log('');

  // 5. 逐个验证 8 个视图
  const results = [];
  for (const view of VIEWS_TO_VERIFY) {
    console.log(`--- 验证视图: ${view.label} (key=${view.key}) ---`);
    try {
      const r = await verifyView(page, view.key, view.label, docId);
      results.push(r);
      console.log(
        `  StageActionBar: ${r.stageActionBar} | StageBizStrip: ${r.stageBizStrip} | 旧结构: ${r.oldResidue} | 权限拒绝: ${r.permissionDenied} | 表格: ${r.tableArea} | 截图: ${r.screenshot}`,
      );
      if (r.notes.length) console.log(`  备注: ${r.notes.join('; ')}`);
    } catch (e) {
      console.error(`  验证异常: ${e.message}`);
      results.push({
        view: view.label,
        key: view.key,
        stageActionBar: '异常',
        stageBizStrip: '异常',
        oldResidue: '异常',
        permissionDenied: '异常',
        tableArea: '异常',
        screenshot: null,
        notes: [e.message],
      });
    }
    console.log('');
  }

  // 6. 汇总输出
  console.log('===== 汇总报告 =====\n');
  console.log('视图名 | StageActionBar | StageBizStrip | 旧结构残留 | 权限拒绝 | 截图文件名');
  console.log('---|---|---|---|---|---');
  for (const r of results) {
    console.log(
      `${r.view} | ${r.stageActionBar} | ${r.stageBizStrip} | ${r.oldResidue} | ${r.permissionDenied} | ${r.screenshot || '-'}`,
    );
  }

  // 7. 写入 JSON 结果
  const summary = {
    testTime: new Date().toISOString(),
    account: ADMIN.username,
    docId,
    workbenchTabs: tabs.slice(0, 20),
    results,
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(`\n结果已写入: ${path.join(SCREENSHOT_DIR, 'result.json')}`);

  await browser.close();
})();
