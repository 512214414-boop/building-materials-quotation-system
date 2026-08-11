// 权限禁用态验证：所有账号看到完整菜单 + 无权限项禁用 + 点击跳无权限页
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'permission_disable');

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

async function loginStaff(page, username, password) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await delay(2000);
  await page.locator('input[placeholder="请输入用户名"]').fill(username);
  await page.locator('input[placeholder="请输入密码"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/staff/documents**', { timeout: 15000 });
  await delay(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const allResults = [];

  for (const account of TEST_ACCOUNTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    console.log(`\n===== ${account.label} (${account.username}) =====`);
    const results = [];

    try {
      await loginStaff(page, account.username, account.password);

      // 1. 验证一级导航完整可见（所有账号都应看到3个一级导航）
      const mainNavButtons = page.locator('header nav button');
      const mainNavCount = await mainNavButtons.count();
      const mainNavTexts = [];
      for (let i = 0; i < mainNavCount; i++) {
        mainNavTexts.push((await mainNavButtons.nth(i).textContent())?.trim());
      }
      results.push({
        check: `一级导航完整可见 (${mainNavCount}个): [${mainNavTexts.join(', ')}]`,
        pass: mainNavCount === 3 && mainNavTexts.includes('报价中心') && mainNavTexts.includes('基础数据') && mainNavTexts.includes('系统管理'),
      });

      // 2. 验证二级导航完整可见（所有账号都应看到2个二级导航）
      const subNavButtons = page.locator('nav').nth(1).locator('button');
      const subNavCount = await subNavButtons.count();
      const subNavTexts = [];
      for (let i = 0; i < subNavCount; i++) {
        subNavTexts.push((await subNavButtons.nth(i).textContent())?.trim());
      }
      results.push({
        check: `二级导航完整可见 (${subNavCount}个): [${subNavTexts.join(', ')}]`,
        pass: subNavCount === 2 && subNavTexts.includes('购物清单') && subNavTexts.includes('报价工作台'),
      });

      // 3. 截图当前状态
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_01_documents.png`) });

      // 4. 点击"基础数据"一级导航
      // sales01/allocator01 无 product_manage 权限，应跳无权限页
      // admin 有权限，应跳产品管理页
      const basicDataBtn = page.locator('header nav button:has-text("基础数据")').first();
      await basicDataBtn.click();
      await delay(2000);

      const urlAfterBasic = page.url();
      if (account.username === 'admin') {
        // admin 应跳到产品管理
        results.push({
          check: `admin点击"基础数据"跳转产品管理: ${urlAfterBasic}`,
          pass: urlAfterBasic.includes('/staff/basic/products'),
        });
      } else {
        // sales01/allocator01 应跳无权限页
        results.push({
          check: `${account.username}点击"基础数据"跳无权限页: ${urlAfterBasic}`,
          pass: urlAfterBasic.includes('/staff/no-permission'),
        });

        // 验证无权限页内容
        const noPermTitle = await page.locator('h2:has-text("无访问权限")').first().isVisible().catch(() => false);
        results.push({ check: '无权限页标题"无访问权限"可见', pass: noPermTitle });

        const noPermText = await page.locator('p').first().textContent().catch(() => '');
        results.push({
          check: `无权限页提示文字包含"基础数据": ${noPermText?.includes('基础数据')}`,
          pass: noPermText?.includes('基础数据'),
        });

        // 验证导航仍可见（布局稳定）
        const headerVisible = await page.locator('header').first().isVisible();
        const subNavVisible = await page.locator('nav').nth(1).isVisible();
        results.push({ check: '无权限页 Level 1 顶栏仍可见', pass: headerVisible });
        results.push({ check: '无权限页 Level 2 二级导航仍可见', pass: subNavVisible });
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_02_basic_data.png`) });

      // 5. 点击"系统管理"一级导航（只有 admin 有权限）
      const systemBtn = page.locator('header nav button:has-text("系统管理")').first();
      await systemBtn.click();
      await delay(2000);

      const urlAfterSystem = page.url();
      if (account.username === 'admin') {
        results.push({
          check: `admin点击"系统管理"跳转授权码管理: ${urlAfterSystem}`,
          pass: urlAfterSystem.includes('/staff/system/auth-codes'),
        });
      } else {
        results.push({
          check: `${account.username}点击"系统管理"跳无权限页: ${urlAfterSystem}`,
          pass: urlAfterSystem.includes('/staff/no-permission'),
        });
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_03_system.png`) });

      // 6. 返回报价中心，验证报价工作台可访问
      const quoteBtn = page.locator('header nav button:has-text("报价中心")').first();
      await quoteBtn.click();
      await delay(2000);

      const workbenchBtn = page.locator('nav button:has-text("报价工作台")').first();
      await workbenchBtn.click();
      await delay(5000);

      const urlAfterWorkbench = page.url();
      results.push({
        check: `点击"报价工作台"跳转: ${urlAfterWorkbench}`,
        pass: /\/staff\/workbench/.test(urlAfterWorkbench),
      });

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_04_workbench.png`) });

    } catch (e) {
      console.error(`  ✗ 失败: ${e.message}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${account.username}_error.png`) }).catch(() => {});
      results.push({ check: '测试执行', pass: false, error: e.message });
    }

    results.forEach(r => {
      console.log(`  ${r.pass ? '✓' : '✗'} ${r.check}`);
    });
    allResults.push({ account: account.label, results });

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
