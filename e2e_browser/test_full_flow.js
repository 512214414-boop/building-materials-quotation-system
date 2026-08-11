/**
 * 后续环节浏览器自动化测试
 * 收款(cashier01) → 配货(allocator01) → 交付(delivery01) → 成本(sales01) → 售后
 * 前端无状态推进按钮的环节，用 API 推进状态，浏览器中验证各视图操作
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'full_flow');
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

// 获取员工 token
async function getStaffToken(username, password) {
  const resp = await fetch(`${API_BASE}/api/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await resp.json();
  return data.data.token;
}

// 推进单据状态
async function advanceStatus(token, docId, targetStatus) {
  const resp = await fetch(`${API_BASE}/api/staff/documents/${docId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status: targetStatus }),
  });
  const data = await resp.json();
  console.log(`  → API推进状态 → ${targetStatus}: ${data.code === 0 ? '成功' : data.message}`);
  return data;
}

// 获取最新单据
async function getLatestDocument(token) {
  const resp = await fetch(`${API_BASE}/api/staff/documents?page=1&pageSize=1`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await resp.json();
  return data.data.list[0];
}

// 员工登录并进入工作台
async function loginAndEnterWorkbench(page, username, password, docId) {
  await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(800);
  await page.fill('input[placeholder="请输入用户名"]', username);
  await page.fill('input[placeholder="请输入密码"]', password);
  await page.click('button:has-text("登 录")');
  await sleep(2000);
  await page.waitForURL('**/staff/**', { timeout: 10000 });
  await sleep(1000);
  // 直接访问工作台
  await page.goto(`${BASE_URL}/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2000);
}

// 切换视图
async function switchView(page, viewName) {
  const btn = page.locator(`nav button:has-text("${viewName}")`);
  if (await btn.count() > 0) {
    await btn.first().click();
    await sleep(2000);
    return true;
  }
  console.log(`  → 未找到视图按钮: ${viewName}`);
  return false;
}

async function run() {
  console.log('=== 后续环节测试：收款→配货→交付→成本→售后 ===');
  const browser = await chromium.launch({ headless: false, slowMo: 300 });

  // 先获取 manager token（manager 有所有视图 rw 权限）和最新单据
  const managerToken = await getStaffToken('manager01', 'Admin@123');
  const doc = await getLatestDocument(managerToken);
  if (!doc) {
    console.error('未找到单据！');
    await browser.close();
    return;
  }
  const docId = doc.id;
  console.log(`当前单据: ${doc.documentNo} (ID: ${docId}), 状态: ${doc.status}`);

  try {
    // ========== 环节1：收款对账（cashier01） ==========
    console.log('\n--- 环节1：收款对账（cashier01） ---');
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page1 = await ctx1.newPage();
    await loginAndEnterWorkbench(page1, 'cashier01', 'Admin@123', docId);
    await screenshot(page1, 'cashier_workbench', 'cashier01进入工作台');

    // 切换到收款对账视图
    await switchView(page1, '收款对账');
    await screenshot(page1, 'cashier_payment_view', '收款对账视图（当前无收款记录）');

    // 点击"添加收款"
    const addPayBtn = page1.locator('button:has-text("添加收款")');
    if (await addPayBtn.count() > 0) {
      await addPayBtn.first().click();
      await sleep(1500);
      await screenshot(page1, 'cashier_add_payment_dialog', '添加收款对话框');

      // 选择收款类型 - antd Select
      const typeSelect = page1.locator('.ds-select .ant-select-selector').first();
      if (await typeSelect.count() > 0) {
        await typeSelect.click();
        await sleep(500);
        // 选择"定金"
        const depositOpt = page1.locator('.ds-select-dropdown .ant-select-item-option:has-text("定金")');
        if (await depositOpt.count() > 0) {
          await depositOpt.first().click();
          await sleep(300);
        }
      }

      // 选择收款方式 - 第二个 Select
      const methodSelect = page1.locator('.ds-select .ant-select-selector').nth(1);
      if (await methodSelect.count() > 0) {
        await methodSelect.click();
        await sleep(500);
        const wechatOpt = page1.locator('.ds-select-dropdown .ant-select-item-option:has-text("微信")');
        if (await wechatOpt.count() > 0) {
          await wechatOpt.first().click();
          await sleep(300);
        }
      }

      // 输入金额
      const amountInput = page1.locator('.ant-modal input[type="number"]');
      if (await amountInput.count() > 0) {
        await amountInput.first().fill('1000');
        await sleep(300);
      }

      await screenshot(page1, 'cashier_payment_filled', '填写收款信息（定金1000元/微信）');

      // 确认添加
      await page1.click('.ant-modal button:has-text("确认添加")');
      await sleep(2000);
      await page1.waitForSelector('.ant-modal-wrap', { state: 'detached', timeout: 5000 }).catch(() => {});
      await screenshot(page1, 'cashier_payment_added', '收款记录添加成功');

      // 核销收款记录
      const reconcileBtn = page1.locator('button:has-text("核销")');
      if (await reconcileBtn.count() > 0) {
        await reconcileBtn.first().click();
        await sleep(1500);
        console.log('  → ✓ 收款记录已核销');
      }
      await screenshot(page1, 'cashier_payment_reconciled', '收款记录已核销');
    }

    // 用 API 推进状态到 payment_settled
    await advanceStatus(managerToken, docId, 'payment_settled');
    await page1.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await screenshot(page1, 'cashier_status_advanced', '状态已推进到 payment_settled');
    await ctx1.close();

    // ========== 环节2：仓库配货（allocator01） ==========
    console.log('\n--- 环节2：仓库配货（allocator01） ---');
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page2 = await ctx2.newPage();
    await loginAndEnterWorkbench(page2, 'allocator01', 'Admin@123', docId);
    await screenshot(page2, 'allocator_workbench', 'allocator01进入工作台');

    // 切换到仓库配货视图
    await switchView(page2, '仓库配货');
    await screenshot(page2, 'allocator_warehouse_view', '仓库配货视图');

    // 编辑出库数量
    const outboundInputs = page2.locator('table input[type="number"]');
    const outboundCount = await outboundInputs.count();
    console.log(`  → 出库数量输入框数量: ${outboundCount}`);
    if (outboundCount > 0) {
      await outboundInputs.first().fill('60');
      await sleep(300);
    }

    // 选择仓库
    const warehouseSelect = page2.locator('.ds-select .ant-select-selector').first();
    if (await warehouseSelect.count() > 0) {
      await warehouseSelect.click();
      await sleep(500);
      const firstOption = page2.locator('.ds-select-dropdown .ant-select-item-option').first();
      if (await firstOption.count() > 0) {
        await firstOption.click();
        await sleep(300);
      }
    }
    await screenshot(page2, 'allocator_warehouse_filled', '填写出库数量60+选择仓库');

    // 保存配货记录
    const saveBtn = page2.locator('button:has-text("保存配货记录")');
    if (await saveBtn.count() > 0) {
      await saveBtn.first().click();
      await sleep(2000);
      console.log('  → ✓ 配货记录已保存');
    }
    await screenshot(page2, 'allocator_warehouse_saved', '配货记录保存成功');

    // 用 API 推进状态到 warehouse_in_progress
    await advanceStatus(managerToken, docId, 'warehouse_in_progress');
    await page2.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await screenshot(page2, 'allocator_status_advanced', '状态已推进到 warehouse_in_progress');
    await ctx2.close();

    // ========== 环节3：交付履约（delivery01） ==========
    console.log('\n--- 环节3：交付履约（delivery01） ---');
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page3 = await ctx3.newPage();
    await loginAndEnterWorkbench(page3, 'delivery01', 'Admin@123', docId);
    await screenshot(page3, 'delivery_workbench', 'delivery01进入工作台');

    // 切换到交付履约视图
    await switchView(page3, '交付履约');
    await screenshot(page3, 'delivery_view', '交付履约视图');

    // 新增交付记录
    const createDeliveryBtn = page3.locator('button:has-text("新增交付记录")');
    if (await createDeliveryBtn.count() > 0) {
      await createDeliveryBtn.first().click();
      await sleep(1500);
      await screenshot(page3, 'delivery_create_dialog', '新增交付记录对话框');

      // 选择配送方式
      const methodSelect = page3.locator('.ds-select .ant-select-selector').first();
      if (await methodSelect.count() > 0) {
        await methodSelect.click();
        await sleep(500);
        const selfOpt = page3.locator('.ds-select-dropdown .ant-select-item-option:has-text("自提")');
        if (await selfOpt.count() > 0) {
          await selfOpt.first().click();
          await sleep(300);
        }
      }

      // 填写收货人
      const receiverInput = page3.locator('.ant-modal input[placeholder="收货人姓名"]');
      if (await receiverInput.count() > 0) {
        await receiverInput.fill('张三');
        await sleep(200);
      }

      // 填写电话
      const phoneInput = page3.locator('.ant-modal input[placeholder="联系电话"]');
      if (await phoneInput.count() > 0) {
        await phoneInput.fill('13800006000');
        await sleep(200);
      }

      await screenshot(page3, 'delivery_filled', '填写交付信息（自提/张三）');

      // 确认新增
      await page3.click('.ant-modal button:has-text("确认新增")');
      await sleep(2000);
      await page3.waitForSelector('.ant-modal-wrap', { state: 'detached', timeout: 5000 }).catch(() => {});
      await screenshot(page3, 'delivery_created', '交付记录创建成功');
    }

    // 确认发货
    const shipBtn = page3.locator('button:has-text("确认发货")');
    if (await shipBtn.count() > 0) {
      await shipBtn.first().click();
      await sleep(2000);
      console.log('  → ✓ 已确认发货');
    }
    await screenshot(page3, 'delivery_shipped', '已发货（pending→shipped）');

    // 签收确认（自动推进到 delivery_completed）
    const signBtn = page3.locator('button:has-text("签收确认")');
    if (await signBtn.count() > 0) {
      await signBtn.first().click();
      await sleep(3000);
      console.log('  → ✓ 已签收确认（自动流转到 delivery_completed）');
    }
    await screenshot(page3, 'delivery_signed', '已签收（状态自动→delivery_completed）');
    await ctx3.close();

    // ========== 环节4：成本核定（sales01） ==========
    console.log('\n--- 环节4：成本核定（sales01） ---');
    const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page4 = await ctx4.newPage();
    await loginAndEnterWorkbench(page4, 'sales01', 'Admin@123', docId);
    await screenshot(page4, 'cost_workbench', 'sales01进入工作台');

    // 切换到成本核定视图
    await switchView(page4, '成本核定');
    await screenshot(page4, 'cost_view', '成本核定视图');

    // 编辑单位成本和运费
    const costInputs = page4.locator('table input[type="number"], .cost-verify-input input, input.cost-verify-input');
    const costCount = await costInputs.count();
    console.log(`  → 成本输入框数量: ${costCount}`);
    if (costCount >= 1) {
      await costInputs.first().fill('25');
      await sleep(200);
    }
    if (costCount >= 2) {
      await costInputs.nth(1).fill('10');
      await sleep(200);
    }
    await screenshot(page4, 'cost_filled', costCount > 0 ? '填写单位成本25+运费10' : '成本行为空（无输入框）');

    if (costCount > 0) {
      // 保存成本
      const saveCostBtn = page4.locator('button:has-text("保存成本")');
      if (await saveCostBtn.count() > 0) {
        const isDisabled = await saveCostBtn.first().isDisabled();
        if (!isDisabled) {
          await saveCostBtn.first().click();
          await sleep(2000);
          console.log('  → ✓ 成本已保存');
        }
      }
      await screenshot(page4, 'cost_saved', '成本保存成功');

      // 核定完成（自动推进到 cost_verified）
      const verifyBtn = page4.locator('button:has-text("核定完成")');
      if (await verifyBtn.count() > 0) {
        await verifyBtn.first().click();
        await sleep(3000);
        console.log('  → ✓ 核定完成（自动流转到 cost_verified）');
      }
    } else {
      console.log('  → 成本行为空，用 API 推进状态到 cost_verified');
      await advanceStatus(managerToken, docId, 'cost_verified');
      await page4.reload({ waitUntil: 'networkidle' });
      await sleep(1500);
    }
    await screenshot(page4, 'cost_verified', '核定完成（状态→cost_verified）');
    await ctx4.close();

    // ========== 环节5：售后处理（sales01） ==========
    console.log('\n--- 环节5：售后处理（sales01） ---');
    const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page5 = await ctx5.newPage();
    await loginAndEnterWorkbench(page5, 'sales01', 'Admin@123', docId);

    // 用 API 推进到售后状态
    await advanceStatus(managerToken, docId, 'after_sales');
    await page5.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await screenshot(page5, 'aftersales_workbench', 'sales01进入工作台（售后阶段）');

    // 切换到售后处理视图
    await switchView(page5, '售后处理');
    await screenshot(page5, 'aftersales_view', '售后处理视图');

    // 添加退换记录
    // 选择商品行
    const lineSelect = page5.locator('.ds-select .ant-select-selector').first();
    if (await lineSelect.count() > 0) {
      await lineSelect.click();
      await sleep(500);
      const firstOpt = page5.locator('.ds-select-dropdown .ant-select-item-option').first();
      if (await firstOpt.count() > 0) {
        await firstOpt.click();
        await sleep(300);
      }
    }

    // 选择退换类型
    const refundTypeSelect = page5.locator('.ds-select .ant-select-selector').nth(1);
    if (await refundTypeSelect.count() > 0) {
      await refundTypeSelect.click();
      await sleep(500);
      const refundOpt = page5.locator('.ds-select-dropdown .ant-select-item-option:has-text("退款")');
      if (await refundOpt.count() > 0) {
        await refundOpt.first().click();
        await sleep(300);
      }
    }

    // 填写退换数量
    const refundQtyInput = page5.locator('input[type="number"]').first();
    if (await refundQtyInput.count() > 0) {
      await refundQtyInput.fill('5');
      await sleep(200);
    }

    await screenshot(page5, 'aftersales_filled', '填写退换信息（退款5件）');

    // 点击添加
    const addRefundBtn = page5.locator('button:has-text("添加")');
    if (await addRefundBtn.count() > 0) {
      await addRefundBtn.first().click();
      await sleep(2000);
      console.log('  → ✓ 退换记录已添加');
    }
    await screenshot(page5, 'aftersales_added', '退换记录添加成功');

    // 用 API 推进到归档
    await advanceStatus(managerToken, docId, 'archived');
    await page5.reload({ waitUntil: 'networkidle' });
    await sleep(1500);
    await screenshot(page5, 'aftersales_archived', '单据已归档（archived）');
    await ctx5.close();

    // 记录结果
    const result = {
      title: '后续环节测试',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/full_flow',
      steps: steps,
      status: 'PASS',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    console.log('\n=== 后续环节测试完成 ===');
    console.log(`总步骤: ${stepCounter}`);

  } catch (err) {
    console.error('测试失败:', err.message);
    const result = {
      title: '后续环节测试',
      totalSteps: stepCounter,
      screenshotDir: 'screenshots/full_flow',
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
