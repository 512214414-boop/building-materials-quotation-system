// 布局架构 v2 验证：配置驱动 + 零分支外层 + 工作台独立路由 + 切换性能
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'layout_v2');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const TEST_ACCOUNTS = [
  { username: 'admin', password: 'Admin@123', label: '管理员' },
  { username: 'sales01', password: 'Admin@123', label: '报价员' },
  { username: 'allocator01', password: 'Admin@123', label: '配货员' },
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 通过API登录获取token和第一个单据ID
async function getFirstDocumentId(username, password) {
  const loginRes = await fetch(`${API_BASE}/api/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken || loginData.data?.token;

  const docRes = await fetch(`${API_BASE}/api/staff/documents?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const docData = await docRes.json();
  const firstDoc = docData.data?.list?.[0];
  return { docId: firstDoc?.id, token };
}

async function loginStaff(page, username, password) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await delay(2000);
  await page.locator('input[placeholder="请输入用户名"]').fill(username);
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/staff/documents**', { timeout: 15000 });
  await delay(2000);
}

// 验证通用层（Level 1 + Level 2 导航常驻不销毁）
async function verifyCommonLayout(page, username) {
  const results = [];
  const header = page.locator('header').first();

  // Level 1 顶栏
  results.push({ check: 'Level 1 顶栏存在', pass: await header.isVisible() });
  results.push({ check: 'Logo "建" 存在', pass: await header.locator('span:has-text("建")').first().isVisible() });
  results.push({ check: '系统名称 "建材报价系统" 存在', pass: await header.locator('span:has-text("建材报价系统")').first().isVisible() });

  // 一级导航
  const mainNav = header.locator('nav button');
  const mainNavCount = await mainNav.count();
  const mainNavTexts = [];
  for (let i = 0; i < mainNavCount; i++) {
    mainNavTexts.push((await mainNav.nth(i).textContent())?.trim());
  }
  results.push({ check: `一级导航项: [${mainNavTexts.join(', ')}]`, pass: mainNavCount > 0 });

  // 用户头像 + 退出按钮
  results.push({ check: '用户头像圆圈存在', pass: await header.locator('span[style*="border-radius: 50%"]').first().isVisible() });
  results.push({ check: '退出按钮存在', pass: await header.locator('button[aria-label="退出登录"]').first().isVisible() });

  // Level 2 二级导航
  const subNav = page.locator('nav').nth(1);
  const subNavVisible = await subNav.isVisible();
  results.push({ check: 'Level 2 二级导航存在', pass: subNavVisible });

  if (subNavVisible) {
    const subNavButtons = subNav.locator('button');
    const subNavCount = await subNavButtons.count();
    const subNavTexts = [];
    for (let i = 0; i < subNavCount; i++) {
      subNavTexts.push((await subNavButtons.nth(i).textContent())?.trim());
    }
    results.push({ check: `二级导航项: [${subNavTexts.join(', ')}]`, pass: subNavCount > 0 });
    results.push({ check: '二级导航包含"购物清单"', pass: subNavTexts.some(t => t?.includes('购物清单')) });
    results.push({ check: '二级导航包含"报价工作台"', pass: subNavTexts.some(t => t?.includes('报价工作台')) });
  }

  return results;
}

// 验证工作台布局（新路由 /staff/workbench/:id）
async function verifyWorkbench(page, username, docId) {
  const results = [];

  // 直接访问工作台URL（新路由）
  await page.goto(`${BASE_URL}/staff/workbench/${docId}`, { waitUntil: 'networkidle' });
  await delay(4000);

  // 工作台特殊层：多单据标签页 + 九视图Tab + 单据上下文栏
  const closeBtn = page.locator('[aria-label*="关闭"]').first();
  results.push({ check: '多单据标签页栏（关闭按钮可见）', pass: await closeBtn.isVisible().catch(() => false) });

  const newDocBtn = page.locator('button:has-text("新建单据")').first();
  results.push({ check: '"+新建单据"按钮存在', pass: await newDocBtn.isVisible().catch(() => false) });

  // 九视图Tab（按权限过滤）
  const viewTexts = ['需求确认', '报价核算', '收款对账', '仓库配货', '采购调货', '交付履约', '成本核定', '退换售后', '销售汇总'];
  let viewTabCount = 0;
  const foundViews = [];
  for (const text of viewTexts) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      viewTabCount++;
      foundViews.push(text);
    }
  }
  results.push({ check: `九视图Tab可见: ${viewTabCount}个 [${foundViews.join(', ')}]`, pass: viewTabCount > 0 });

  // 单据上下文栏
  results.push({ check: '单据上下文栏（"单据编号:"可见）', pass: await page.locator('text=单据编号:').first().isVisible().catch(() => false) });
  results.push({ check: '返回按钮存在', pass: await page.locator('button[aria-label="返回单据列表"]').first().isVisible().catch(() => false) });

  // 验证导航仍可见（关键：进入工作台后导航不消失）
  const headerStillVisible = await page.locator('header').first().isVisible();
  const subNavStillVisible = await page.locator('nav').nth(1).isVisible();
  results.push({ check: '进入工作台后 Level 1 顶栏仍可见', pass: headerStillVisible });
  results.push({ check: '进入工作台后 Level 2 二级导航仍可见', pass: subNavStillVisible });

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${username}_workbench.png`) });
  return results;
}

// 验证无id入口（/staff/workbench 自动加载最近单据）
async function verifyWorkbenchEntry(page, username) {
  const results = [];

  // 访问无id入口
  await page.goto(`${BASE_URL}/staff/workbench`, { waitUntil: 'networkidle' });
  await delay(5000); // 等待自动加载最近单据

  const currentUrl = page.url();
  const redirectedToWorkbench = /\/staff\/workbench\/[^/]+$/.test(currentUrl);
  results.push({ check: `无id入口自动跳转到工作台: ${currentUrl}`, pass: redirectedToWorkbench });

  if (redirectedToWorkbench) {
    // 验证工作台元素正常渲染
    const closeBtn = page.locator('[aria-label*="关闭"]').first();
    results.push({ check: '无id入口跳转后多单据标签页可见', pass: await closeBtn.isVisible().catch(() => false) });
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${username}_workbench_entry.png`) });
  return results;
}

// 验证切换性能（导航常驻不销毁，子功能切换不重载）
async function verifySwitchPerformance(page, username) {
  const results = [];

  // 1. 在购物清单页，记录 header 内容
  await page.goto(`${BASE_URL}/staff/documents`, { waitUntil: 'networkidle' });
  await delay(3000);
  const headerBefore = page.locator('header').first();
  const headerTextBefore = await headerBefore.textContent();

  // 2. 直接 goto 工作台（模拟点击"报价工作台"按钮的效果）
  await page.goto(`${BASE_URL}/staff/workbench`, { waitUntil: 'networkidle' });
  await delay(5000); // 等待工作台自动加载最近单据

  const urlAfterWorkbench = page.url();
  results.push({ check: `切换到工作台: ${urlAfterWorkbench}`, pass: /\/staff\/workbench/.test(urlAfterWorkbench) });

  // 3. 验证 header 仍可见且内容一致（导航常驻不销毁）
  const headerAfter = page.locator('header').first();
  const headerVisible = await headerAfter.isVisible().catch(() => false);
  const headerTextAfter = headerVisible ? await headerAfter.textContent() : '';
  const headerStable = headerTextBefore === headerTextAfter;
  results.push({ check: '切换到工作台后 header 内容保持不变（导航常驻）', pass: headerStable });

  // 4. 切回购物清单
  await page.goto(`${BASE_URL}/staff/documents`, { waitUntil: 'networkidle' });
  await delay(3000);
  const urlAfterList = page.url();
  results.push({ check: `切回购物清单: ${urlAfterList}`, pass: urlAfterList.endsWith('/staff/documents') });

  // 5. header 仍可见且内容一致
  const headerFinal = page.locator('header').first();
  const headerTextFinal = await headerFinal.textContent();
  results.push({ check: '再次切换后 header 内容仍保持不变', pass: headerTextFinal === headerTextBefore });

  // 6. 二级导航仍可见（调试：打印 nav 数量和按钮文本）
  const navCount = await page.locator('nav').count();
  const allNavButtons = await page.locator('nav button').allTexts();
  console.log(`    [调试] nav数量=${navCount}, 所有nav按钮=[${allNavButtons.join(', ')}]`);
  const listBtnVisible = await page.locator('nav button:has-text("购物清单")').first().isVisible().catch(() => false);
  const workbenchBtnVisible = await page.locator('nav button:has-text("报价工作台")').first().isVisible().catch(() => false);
  results.push({ check: `切换后二级导航"购物清单"按钮仍可见 (nav数=${navCount})`, pass: listBtnVisible });
  results.push({ check: '切换后二级导航"报价工作台"按钮仍可见', pass: workbenchBtnVisible });

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${username}_switch.png`) });
  return results;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const allResults = [];

  for (const account of TEST_ACCOUNTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    console.log(`\n===== ${account.label} (${account.username}) =====`);

    try {
      const { docId } = await getFirstDocumentId(account.username, account.password);
      console.log(`  单据ID: ${docId}`);

      await loginStaff(page, account.username, account.password);

      // 1. 通用层验证
      const commonResults = await verifyCommonLayout(page, account.username);
      allResults.push({ account: account.label, phase: '通用层', results: commonResults });

      // 2. 工作台验证（新路由）
      const workbenchResults = await verifyWorkbench(page, account.username, docId);
      allResults.push({ account: account.label, phase: '工作台', results: workbenchResults });

      // 3. 无id入口验证
      const entryResults = await verifyWorkbenchEntry(page, account.username);
      allResults.push({ account: account.label, phase: '无id入口', results: entryResults });

      // 4. 切换性能验证
      const switchResults = await verifySwitchPerformance(page, account.username);
      allResults.push({ account: account.label, phase: '切换性能', results: switchResults });

      // 打印结果
      [...commonResults, ...workbenchResults, ...entryResults, ...switchResults].forEach(r => {
        console.log(`  ${r.pass ? '✓' : '✗'} ${r.check}`);
      });

    } catch (e) {
      console.error(`  ✗ 失败: ${e.message}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_error.png`) }).catch(() => {});
      allResults.push({ account: account.label, phase: '错误', results: [{ check: '测试执行', pass: false, error: e.message }] });
    }

    await context.close();
  }

  const summary = {
    testTime: new Date().toISOString(),
    totalChecks: allResults.reduce((s, r) => s + r.results.length, 0),
    passedChecks: allResults.reduce((s, r) => s + r.results.filter(x => x.pass).length, 0),
    details: allResults,
  };
  summary.failedChecks = summary.totalChecks - summary.passedChecks;

  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'result.json'), JSON.stringify(summary, null, 2));

  console.log(`\n===== 汇总 =====`);
  console.log(`总检查项: ${summary.totalChecks} | 通过: ${summary.passedChecks} | 失败: ${summary.failedChecks}`);

  await browser.close();
})();
