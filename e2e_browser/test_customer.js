/**
 * 客户视角浏览器自动化测试
 * 模拟真实用户在浏览器中的操作：准入登录→搜索→加入→修改→删除→查看
 * 每一步截图保存，最后生成可视化报告
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'customer');
const AUTH_CODE = '281244';
const PHONE = '13887254983';

// 确保截图目录存在
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// 测试步骤记录
const steps = [];
let stepCounter = 0;

async function screenshot(page, name, description) {
  stepCounter++;
  const filename = `${String(stepCounter).padStart(2, '0')}_${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  steps.push({ step: stepCounter, name, description, filename });
  console.log(`[步骤${stepCounter}] ${description} → ${filename}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== 启动浏览器（可见模式）===');
  const browser = await chromium.launch({
    headless: false,  // 可见模式，让你能看到操作
    slowMo: 300,      // 每个操作间隔300ms，便于观察
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    // ========== 步骤1：打开客户准入页 ==========
    console.log('\n--- 场景1：客户准入登录 ---');
    await page.goto(`${BASE_URL}/gate`, { waitUntil: 'networkidle' });
    await sleep(1000);
    await screenshot(page, 'gate_page', '客户打开准入登录页');

    // ========== 步骤2：输入手机号和授权码 ==========
    await page.fill('input[placeholder="请输入手机号"]', PHONE);
    await sleep(300);
    await page.fill('input[placeholder="请输入门店提供的授权码"]', AUTH_CODE);
    await sleep(300);
    await screenshot(page, 'gate_filled', '客户填写手机号和授权码');

    // ========== 步骤3：点击进入采购清单 ==========
    await page.click('button:has-text("进入采购清单")');
    await sleep(2000);
    await page.waitForURL('**/');
    await screenshot(page, 'purchase_list_empty', '登录成功，进入空购物清单页');

    // ========== 步骤4：点击添加物料（自动创建单据） ==========
    console.log('\n--- 场景2：添加第一行物料 ---');
    await page.click('button:has-text("添加物料")');
    await sleep(1500);
    await screenshot(page, 'add_material_dialog', '点击添加物料，弹出对话框（同时自动创建单据）');

    // ========== 步骤5：搜索产品"东鹏" ==========
    await page.fill('input[placeholder="搜索物料名称 / 规格"]', '东鹏');
    await sleep(1500);  // 等待防抖+搜索结果
    await screenshot(page, 'search_dongpeng', '搜索"东鹏"，查看搜索结果（注意：客户看不到价格）');

    // ========== 步骤6：点击第一个搜索结果 ==========
    const searchResults = page.locator('button:has-text("东鹏")');
    await searchResults.first().click();
    await sleep(500);
    await screenshot(page, 'selected_product', '选中第一个产品（东鹏客厅地砖）');

    // ========== 步骤7：修改数量为100 ==========
    const qtyInput = page.locator('.ant-modal input[type="number"]').first();
    await qtyInput.fill('');
    await qtyInput.fill('100');
    await sleep(300);
    await screenshot(page, 'set_qty_100', '设置数量为100');

    // ========== 步骤8：点击确认添加 ==========
    await page.click('.ant-modal button:has-text("确认添加")');
    await sleep(1500);
    await screenshot(page, 'first_line_added', '第一行物料添加成功（东鹏地砖100片）');

    // ========== 步骤9：再添加第二行（九牧马桶） ==========
    console.log('\n--- 场景3：添加第二行物料 ---');
    await page.click('button:has-text("添加物料")');
    await sleep(1000);
    await page.fill('input[placeholder="搜索物料名称 / 规格"]', '九牧');
    await sleep(1500);
    await screenshot(page, 'search_jiumu', '搜索"九牧"');

    const jiumuResults = page.locator('.ant-modal button:has-text("九牧")');
    await jiumuResults.first().click();
    await sleep(500);
    const qtyInput2 = page.locator('.ant-modal input[type="number"]').first();
    await qtyInput2.fill('');
    await qtyInput2.fill('2');
    await sleep(300);
    await page.click('.ant-modal button:has-text("确认添加")');
    await sleep(1500);
    await screenshot(page, 'second_line_added', '第二行物料添加成功（九牧马桶2套），现在有2行物料');

    // ========== 步骤10：修改第一行数量 100→80 ==========
    console.log('\n--- 场景4：临时修改第一行数量 ---');
    const firstLineQty = page.locator('article input[type="number"]').first();
    await firstLineQty.click();
    await firstLineQty.fill('');
    await firstLineQty.fill('80');
    await firstLineQty.press('Enter');
    await sleep(1000);
    await screenshot(page, 'qty_modified_80', '第一行数量从100修改为80（已保存）');

    // ========== 步骤11：删除第二行 ==========
    console.log('\n--- 场景5：删除第二行物料 ---');
    const deleteBtn = page.locator('button[aria-label="删除物料"]').last();
    await deleteBtn.click();
    await sleep(500);
    // 如有确认弹窗则点击确认
    const confirmBtn = page.locator('.ant-popconfirm-buttons button:has-text("确定"), .ant-popconfirm button.ant-btn-primary');
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await sleep(800);
    }
    await screenshot(page, 'second_line_deleted', '第二行（九牧马桶）已删除，只剩1行');

    // ========== 步骤12：查看当前清单（demand_pending状态） ==========
    console.log('\n--- 场景6：查看当前清单（价格不可见）---');
    await sleep(1000);
    await screenshot(page, 'final_list_demand_pending', '最终清单（demand_pending状态，价格显示"待报价"）');

    // ========== 步骤13：滚动查看底部合计栏 ==========
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await screenshot(page, 'bottom_bar', '查看底部合计栏（应显示"待报价"）');

    // 记录测试结果
    const result = {
      title: '客户视角测试',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/customer',
      steps: steps,
      status: 'PASS',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    console.log('\n=== 客户视角测试完成 ===');
    console.log(`总步骤: ${stepCounter}`);
    console.log(`截图目录: ${SCREENSHOT_DIR}`);
    console.log('浏览器保持打开10秒供观察...');
    await sleep(10000);

  } catch (err) {
    console.error('测试失败:', err.message);
    await screenshot(page, 'error', '测试出错: ' + err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
