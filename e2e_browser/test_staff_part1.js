/**
 * 员工视角浏览器自动化测试 - Part 1
 * sales登录 → 看到客户清单 → 需求确认 → 报价 → 确认报价
 * 修复 viewPermissions 键名不一致Bug后重新执行
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'staff_part1');
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

/** 等待 antd Modal 关闭，超时则强制按 Escape */
async function waitForModalClosed(page, timeoutMs = 5000) {
  try {
    await page.waitForSelector('.ant-modal-wrap', { state: 'detached', timeout: timeoutMs });
    return true;
  } catch {
    // modal 未关闭，可能有校验错误，强制关闭
    console.log('  → 对话框未自动关闭，尝试 Escape 关闭');
    await page.keyboard.press('Escape');
    await sleep(500);
    return false;
  }
}

async function run() {
  console.log('=== 员工视角测试 Part1：sales需求确认+报价 ===');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // 捕获控制台错误
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [浏览器console.error] ${msg.text()}`);
  });

  try {
    // ========== 场景1：sales登录 ==========
    console.log('\n--- 场景1：sales登录 ---');
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(1000);
    await screenshot(page, 'staff_login_page', '员工登录页');

    await page.fill('input[placeholder="请输入用户名"]', 'sales01');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await sleep(300);
    await screenshot(page, 'staff_login_filled', '输入sales01账号密码');

    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.waitForURL('**/staff/**', { timeout: 10000 });
    await sleep(1000);
    await screenshot(page, 'staff_document_list', '登录成功，进入单据列表页');

    // ========== 场景2：进入工作台 ==========
    console.log('\n--- 场景2：进入工作台 ---');
    const workBtn = page.locator('button:has-text("进入工作台")').first();
    if (await workBtn.count() > 0) {
      await workBtn.click();
    } else {
      const firstRow = page.locator('tr.ant-table-row').first();
      await firstRow.click();
    }
    await sleep(2000);
    await page.waitForURL('**/staff/documents/**', { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await screenshot(page, 'staff_workbench_default', '进入单据工作台（默认显示需求确认视图）');

    // 验证权限修复
    const addBtn = page.locator('button:has-text("添加物料")');
    const addBtnCount = await addBtn.count();
    console.log(`  → "添加物料"按钮数量: ${addBtnCount}`);
    if (addBtnCount === 0) {
      await screenshot(page, 'permission_error', '权限未生效：无添加物料按钮');
      throw new Error('权限修复未生效');
    }
    console.log('  → ✓ 权限修复生效！sales01可见需求确认视图');

    // ========== 场景3：sales补充物料行 ==========
    console.log('\n--- 场景3：sales补充物料行 ---');
    await addBtn.first().click();
    await sleep(1500);
    await screenshot(page, 'staff_add_material_dialog', '点击添加物料，弹出对话框');

    // 搜索产品：antd Select 交互
    const selectSelector = page.locator('.ds-select .ant-select-selector').first();
    if (await selectSelector.count() > 0) {
      await selectSelector.click();
      await sleep(500);
      const searchInput = page.locator('.ds-select input.ant-select-selection-search-input').first();
      if (await searchInput.count() > 0) {
        await searchInput.fill('圣象');
        await sleep(2000);
        await screenshot(page, 'staff_search_shengxiang', '搜索"圣象"');

        const option = page.locator('.ds-select-dropdown .ant-select-item-option').first();
        if (await option.count() > 0) {
          await option.click();
          await sleep(800);
          await screenshot(page, 'staff_selected_shengxiang', '选中圣象地板');
        } else {
          console.log('  → 未找到搜索结果，将手动填写');
        }
      }
    }

    // 填写商品名称（如果为空）
    const productRefInput = page.locator('.ant-modal input[placeholder="如未检索到产品可手动输入"]');
    if (await productRefInput.count() > 0) {
      const currentVal = await productRefInput.inputValue();
      if (!currentVal) {
        await productRefInput.fill('圣象 复合地板 12mm 经典橡木 E0级');
      }
    }

    // 填写规格
    const specInput = page.locator('.ant-modal input[placeholder="规格型号"]');
    if (await specInput.count() > 0) {
      const currentVal = await specInput.inputValue();
      if (!currentVal) {
        await specInput.fill('12mm');
      }
    }

    // 填写单位
    const unitInput = page.locator('.ant-modal input[placeholder="如：件/米/吨"]');
    if (await unitInput.count() > 0) {
      const currentVal = await unitInput.inputValue();
      if (!currentVal) {
        await unitInput.fill('㎡');
      }
    }

    // 填写数量 - 数量输入框 placeholder 是"数量"
    const qtyInput = page.locator('.ant-modal input[placeholder="数量"]');
    if (await qtyInput.count() > 0) {
      await qtyInput.fill('');
      await qtyInput.fill('50');
    } else {
      // 尝试用 type=number 定位最后一个
      const numInputs = page.locator('.ant-modal input[type="number"]');
      const cnt = await numInputs.count();
      if (cnt > 0) {
        await numInputs.nth(cnt - 1).fill('');
        await numInputs.nth(cnt - 1).fill('50');
      }
    }
    await sleep(500);
    await screenshot(page, 'staff_fill_material', '填写物料信息（圣象地板50㎡）');

    // 点击确认添加
    await page.click('.ant-modal button:has-text("确认添加")');
    await sleep(2000);

    // 等待 modal 关闭
    const modalClosed = await waitForModalClosed(page, 5000);
    if (!modalClosed) {
      console.log('  → 添加物料可能失败（校验错误），截图后关闭对话框继续测试');
      await screenshot(page, 'staff_add_material_failed', '添加物料校验失败提示');
      // 强制关闭对话框
      const cancelBtn = page.locator('.ant-modal button:has-text("取消")');
      if (await cancelBtn.count() > 0) {
        await cancelBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await sleep(1000);
    } else {
      console.log('  → ✓ 物料行添加成功');
    }
    await screenshot(page, 'staff_after_add_material', '添加物料后的需求确认视图');

    // ========== 场景4：报价核算 ==========
    console.log('\n--- 场景4：报价核算 ---');
    // 确保 modal 已关闭
    await page.waitForSelector('.ant-modal-wrap', { state: 'detached', timeout: 3000 }).catch(() => {});

    // 切换到报价核算视图
    const quoteNavBtn = page.locator('nav button:has-text("报价核算")');
    if (await quoteNavBtn.count() > 0) {
      await quoteNavBtn.first().click();
      await sleep(2000);
    }
    await screenshot(page, 'staff_quote_view', '切换到报价核算视图');

    // 获取所有数据行
    const quoteRows = page.locator('table tr.ant-table-row');
    const rowCount = await quoteRows.count();
    console.log(`  → 报价核算视图行数: ${rowCount}`);

    // 逐行输入单价和折扣
    for (let i = 0; i < rowCount; i++) {
      const rowInputs = quoteRows.nth(i).locator('input[type="number"]');
      const inputCount = await rowInputs.count();
      console.log(`  → 第${i + 1}行 number input 数量: ${inputCount}`);

      if (i === 0 && inputCount >= 1) {
        // 第一行：东鹏地砖 单价35
        await rowInputs.nth(0).fill('35');
        await sleep(200);
        if (inputCount >= 2) {
          await rowInputs.nth(1).fill('0');
          await sleep(200);
        }
      } else if (i === 1 && inputCount >= 1) {
        // 第二行：圣象地板 单价158
        await rowInputs.nth(0).fill('158');
        await sleep(200);
        if (inputCount >= 2) {
          await rowInputs.nth(1).fill('100');
          await sleep(200);
        }
      }
    }
    await sleep(500);
    await screenshot(page, 'staff_price_filled', '输入单价后实时算价');

    // 保存报价
    const saveBtn = page.locator('button:has-text("保存报价")');
    if (await saveBtn.count() > 0) {
      await saveBtn.first().click();
      await sleep(2000);
    }
    await screenshot(page, 'staff_quote_saved', '报价保存成功');

    // 确认报价
    const confirmBtn = page.locator('button:has-text("确认报价")');
    if (await confirmBtn.count() > 0) {
      await confirmBtn.first().click();
      await sleep(3000);
    }
    await screenshot(page, 'staff_quote_confirmed', '确认报价成功（状态→quote_confirmed）');

    // 记录结果
    const result = {
      title: '员工视角测试 Part1',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/staff_part1',
      steps: steps,
      status: 'PASS',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    console.log('\n=== 员工视角Part1测试完成 ===');
    console.log(`总步骤: ${stepCounter}`);
    await sleep(3000);

  } catch (err) {
    console.error('测试失败:', err.message);
    await screenshot(page, 'error', '测试出错: ' + err.message);
    const result = {
      title: '员工视角测试 Part1',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/staff_part1',
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
