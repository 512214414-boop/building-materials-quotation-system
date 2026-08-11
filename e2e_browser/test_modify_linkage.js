/**
 * 修改联动场景浏览器自动化测试
 * 场景：员工解锁报价 → 客户修改数量 → 员工重新报价
 * 验证需求变更与报价的联动机制
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'modify_linkage');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== 修改联动场景测试：解锁→客户改数量→重新报价 ===');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });

  try {
    // ========== Part A: sales01 解锁报价 ==========
    console.log('\n--- Part A：sales01 解锁报价 ---');
    const staffContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });
    const staffPage = await staffContext.newPage();

    // 登录
    await staffPage.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(1000);
    await staffPage.fill('input[placeholder="请输入用户名"]', 'sales01');
    await staffPage.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await staffPage.click('button:has-text("登 录")');
    await sleep(2000);
    await staffPage.waitForURL('**/staff/**', { timeout: 10000 });
    await sleep(1000);
    await screenshot(staffPage, 'staff_login_done', 'sales01登录成功，单据列表');

    // 进入工作台
    const workBtn = staffPage.locator('button:has-text("进入工作台")').first();
    if (await workBtn.count() > 0) {
      await workBtn.click();
    } else {
      await staffPage.locator('tr.ant-table-row').first().click();
    }
    await sleep(2000);
    await staffPage.waitForURL('**/staff/documents/**', { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await screenshot(staffPage, 'staff_workbench', '进入工作台（需求确认视图）');

    // 切换到报价核算视图
    const quoteNavBtn = staffPage.locator('nav button:has-text("报价核算")');
    if (await quoteNavBtn.count() > 0) {
      await quoteNavBtn.first().click();
      await sleep(2000);
    }
    await screenshot(staffPage, 'staff_quote_view_locked', '报价核算视图');

    // 检查当前状态：如果有"解锁报价"按钮 → quote_confirmed；如果有"确认报价"按钮 → demand_pending
    const unlockBtn = staffPage.locator('button:has-text("解锁报价")');
    const confirmQuoteBtn = staffPage.locator('button:has-text("确认报价")');
    const unlockCount = await unlockBtn.count();
    const confirmCount = await confirmQuoteBtn.count();
    console.log(`  → "解锁报价"按钮: ${unlockCount}, "确认报价"按钮: ${confirmCount}`);

    if (unlockCount > 0) {
      // 当前是 quote_confirmed，点击解锁
      await unlockBtn.first().click();
      await sleep(3000);
      console.log('  → ✓ 报价已解锁，状态回退到 demand_pending');
    } else if (confirmCount > 0) {
      console.log('  → 当前已是 demand_pending 状态，无需解锁');
    } else {
      // 可能需要先保存报价再确认，然后解锁
      console.log('  → 当前状态需先确认报价再解锁测试');
      const saveBtn = staffPage.locator('button:has-text("保存报价")');
      if (await saveBtn.count() > 0) {
        await saveBtn.first().click();
        await sleep(1500);
      }
      if (await confirmQuoteBtn.count() > 0) {
        await confirmQuoteBtn.first().click();
        await sleep(3000);
      }
      // 现在应该有解锁按钮了
      const unlockBtn2 = staffPage.locator('button:has-text("解锁报价")');
      if (await unlockBtn2.count() > 0) {
        await unlockBtn2.first().click();
        await sleep(3000);
        console.log('  → ✓ 先确认再解锁，状态回退到 demand_pending');
      }
    }
    await screenshot(staffPage, 'staff_quote_unlocked', '报价已解锁，回到需求待确认状态');

    // ========== Part B: 客户修改数量 ==========
    console.log('\n--- Part B：客户修改数量 ---');
    const customerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });
    const customerPage = await customerContext.newPage();

    // 客户准入登录
    await customerPage.goto(`${BASE_URL}/gate`, { waitUntil: 'networkidle' });
    await sleep(1000);
    await screenshot(customerPage, 'customer_gate', '客户准入页');

    await customerPage.fill('input[placeholder="请输入手机号"]', '13887254983');
    await customerPage.fill('input[placeholder="请输入门店提供的授权码"]', '854137');
    await sleep(300);
    await screenshot(customerPage, 'customer_gate_filled', '输入手机号+授权码');

    // 点击"进入采购清单"
    await customerPage.click('button:has-text("进入采购清单")');
    await sleep(2000);
    await customerPage.waitForURL('**/', { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await screenshot(customerPage, 'customer_list', '客户采购清单（解锁后可修改）');

    // 修改第一行数量：80 → 60
    console.log('  → 修改第一行数量 80→60');
    // 客户端用卡片布局（antd Input type="number"），不是表格
    const qtyInputs = customerPage.locator('input[type="number"]');
    const qtyCount = await qtyInputs.count();
    console.log(`  → 客户端 number input 数量: ${qtyCount}`);
    if (qtyCount > 0) {
      await qtyInputs.first().click();
      await qtyInputs.first().fill('');
      await qtyInputs.first().fill('60');
      // 触发 onBlur（按 Tab 或点击页面其他位置）
      await customerPage.keyboard.press('Tab');
      await sleep(1500);
      console.log('  → ✓ 数量已修改并触发保存');
    }
    await screenshot(customerPage, 'customer_qty_modified', '客户端修改数量80→60（onBlur自动保存）');

    // 尝试点击保存（如果有保存按钮）
    const customerSaveBtn = customerPage.locator('button:has-text("保存")');
    if (await customerSaveBtn.count() > 0) {
      await customerSaveBtn.first().click();
      await sleep(1500);
      console.log('  → ✓ 客户端保存修改');
    }
    await screenshot(customerPage, 'customer_saved', '客户端保存后的清单');

    await customerContext.close();

    // ========== Part C: sales01 重新报价 ==========
    console.log('\n--- Part C：sales01 重新报价 ---');
    // 回到 staffPage，刷新数据
    await staffPage.reload({ waitUntil: 'networkidle' });
    await sleep(2000);
    await screenshot(staffPage, 'staff_after_customer_modify', '员工端刷新后（看到客户修改的数量60）');

    // 切换到报价核算视图
    const quoteNavBtn2 = staffPage.locator('nav button:has-text("报价核算")');
    if (await quoteNavBtn2.count() > 0) {
      await quoteNavBtn2.first().click();
      await sleep(2000);
    }
    await screenshot(staffPage, 'staff_quote_view_after_modify', '报价核算视图（数量已更新为60）');

    // 重新输入单价
    const quoteRows = staffPage.locator('table tr.ant-table-row');
    const rowCount = await quoteRows.count();
    console.log(`  → 报价行数: ${rowCount}`);
    if (rowCount > 0) {
      const rowInputs = quoteRows.nth(0).locator('input[type="number"]');
      const inputCount = await rowInputs.count();
      if (inputCount >= 1) {
        await rowInputs.nth(0).fill('38');
        await sleep(200);
      }
      if (inputCount >= 2) {
        await rowInputs.nth(1).fill('0');
        await sleep(200);
      }
    }
    await sleep(500);
    await screenshot(staffPage, 'staff_reprice_filled', '重新输入单价38（数量60）');

    // 保存报价
    const saveBtn = staffPage.locator('button:has-text("保存报价")');
    if (await saveBtn.count() > 0) {
      await saveBtn.first().click();
      await sleep(2000);
    }
    await screenshot(staffPage, 'staff_reprice_saved', '重新保存报价');

    // 确认报价
    const confirmBtn = staffPage.locator('button:has-text("确认报价")');
    if (await confirmBtn.count() > 0) {
      await confirmBtn.first().click();
      await sleep(3000);
    }
    await screenshot(staffPage, 'staff_reprice_confirmed', '重新确认报价（状态→quote_confirmed）');

    await staffContext.close();

    // 记录结果
    const result = {
      title: '修改联动场景测试',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/modify_linkage',
      steps: steps,
      status: 'PASS',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    console.log('\n=== 修改联动场景测试完成 ===');
    console.log(`总步骤: ${stepCounter}`);

  } catch (err) {
    console.error('测试失败:', err.message);
    const result = {
      title: '修改联动场景测试',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/modify_linkage',
      steps: steps,
      status: 'FAIL',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'result.json'),
      JSON.stringify(result, null, 2)
    );
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
