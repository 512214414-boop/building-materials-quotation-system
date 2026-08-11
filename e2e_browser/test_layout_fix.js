// 布局整改验证测试 v2：通过API获取单据ID直接访问工作台
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'layout_fix');

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
  return firstDoc?.id;
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

async function verifyListLayout(page, username) {
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
  
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${username}_list.png`) });
  return results;
}

async function verifyWorkbenchLayout(page, username, docId) {
  const results = [];
  
  // 直接访问工作台URL
  await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await delay(4000);
  
  // 多单据标签页栏
  const closeBtn = page.locator('[aria-label*="关闭"]').first();
  results.push({ check: '多单据标签页栏（关闭按钮可见）', pass: await closeBtn.isVisible().catch(() => false) });
  
  const newDocBtn = page.locator('button:has-text("新建单据")').first();
  results.push({ check: '"+新建单据"按钮存在', pass: await newDocBtn.isVisible().catch(() => false) });
  
  // 九视图Tab
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
  
  // 状态标签（StatusBadge 渲染的元素）
  const statusArea = page.locator('div:has(> span:has-text("单据编号:"))').last();
  results.push({ check: '状态标签区域存在', pass: await statusArea.isVisible().catch(() => false) });
  
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${username}_workbench.png`) });
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
      // 获取第一个单据ID
      const docId = await getFirstDocumentId(account.username, account.password);
      console.log(`  单据ID: ${docId}`);
      
      await loginStaff(page, account.username, account.password);
      
      // 验证列表页布局
      const listResults = await verifyListLayout(page, account.username);
      allResults.push({ account: account.label, page: '列表页', results: listResults });
      
      // 验证工作台布局
      const workbenchResults = await verifyWorkbenchLayout(page, account.username, docId);
      allResults.push({ account: account.label, page: '工作台', results: workbenchResults });
      
      // 打印结果
      [...listResults, ...workbenchResults].forEach(r => {
        console.log(`  ${r.pass ? '✓' : '✗'} ${r.check}`);
      });
      
    } catch (e) {
      console.error(`  ✗ 失败: ${e.message}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_error.png`) }).catch(() => {});
      allResults.push({ account: account.label, page: '错误', results: [{ check: '测试执行', pass: false, error: e.message }] });
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
