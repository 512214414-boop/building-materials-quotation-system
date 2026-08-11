// v2.8 布局整改视图验证 - 最终精确版（DOM HTML 抓取）
// 抓取每个视图顶部 3 层区域的 outerHTML + 文本，人工判定
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'v28_verify');

const ADMIN = { username: 'admin', password: 'Admin@123' };

// menu.config 中实际注册的 8 个工作台视图
const REGISTERED_VIEWS = [
  { key: 'PurchaseQuote', label: '采购报价', tabText: '采购报价' },
  { key: 'PaymentReconcile', label: '收款对账', tabText: '收款对账' },
  { key: 'Allocation', label: '统一配货', tabText: '统一配货' },
  { key: 'Delivery', label: '订单交付', tabText: '订单交付' },
  { key: 'CostVerify', label: '成本标注', tabText: '成本标注' },
  { key: 'RefundAfterSale', label: '售后退款', tabText: '售后退款' },
  { key: 'SalesSummary', label: '销售汇总', tabText: '销售汇总' },
  { key: 'ArchiveView', label: '定档归档', tabText: '定档归档' },
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

// 抓取视图容器内顶部区域的完整结构
async function captureViewStructure(page, viewKey, viewLabel) {
  // 视图容器：QuoteWorkbench 的 Shell > div[flex:1] > 视图组件
  // 视图组件根 div 是 div[display:flex; flex-direction:column; height:100%]
  // 内含 StageActionBar + StageBizStrip + 表格区
  const data = await page.evaluate(() => {
    // 找到工作台内容区（不含多单据标签栏 + DocumentContextBar + DocumentCustomerBar）
    // 该容器是 div[style*="flex: 1, minHeight: 0, overflow: auto, background: var(--bg-base-default)"]
    const contentWrappers = Array.from(document.querySelectorAll('div'));
    let contentArea = null;
    for (const div of contentWrappers) {
      const style = div.getAttribute('style') || '';
      if (
        style.includes('flex: 1') &&
        style.includes('minHeight: 0') &&
        style.includes('overflow') &&
        style.includes('background: var(--bg-base-default)')
      ) {
        contentArea = div;
        break;
      }
    }
    if (!contentArea) {
      // 备用：查找含 Spin 或 PermissionDenied 或视图根 div 的容器
      return { error: '未找到内容区', bodyText: document.body.innerText.slice(0, 500) };
    }

    // 视图根 div（第一个子元素）
    const viewRoot = contentArea.children[0];
    if (!viewRoot) {
      return { error: '内容区无子元素', contentAreaHTML: contentArea.innerHTML.slice(0, 500) };
    }

    // 收集视图根的前 3 个直接子元素（StageActionBar + StageBizStrip + 表格区）
    const children = Array.from(viewRoot.children).slice(0, 4);
    const layers = children.map((child, idx) => {
      const style = window.getComputedStyle(child);
      return {
        index: idx,
        tag: child.tagName,
        height: style.height,
        borderBottom: style.borderBottom,
        background: style.background,
        overflowX: style.overflowX,
        text: (child.textContent || '').trim().slice(0, 300),
        html: child.outerHTML.slice(0, 1500),
      };
    });

    return {
      viewRootTag: viewRoot.tagName,
      viewRootStyle: viewRoot.getAttribute('style'),
      childCount: viewRoot.children.length,
      layers,
      fullText: (viewRoot.textContent || '').trim().slice(0, 800),
    };
  });

  return data;
}

(async () => {
  console.log('===== v2.8 布局整改视图验证（最终 DOM 抓取）=====\n');

  const token = await loginAndGetToken(ADMIN.username, ADMIN.password);
  if (!token) { console.error('登录失败'); process.exit(1); }
  const docId = await getFirstDocumentId(token);
  if (!docId) { console.error('未找到单据'); process.exit(1); }
  console.log(`单据 ID: ${docId}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await loginStaff(page, ADMIN.username, ADMIN.password);
  console.log('UI 登录成功\n');

  await page.goto(`${BASE_URL}/staff/workbench/${docId}`, { waitUntil: 'networkidle' });
  await delay(3000);

  // 1. 先验证 RequireConfirm 是否注册
  console.log('--- RequireConfirm 注册检查 ---');
  await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=RequireConfirm`, { waitUntil: 'networkidle' });
  await delay(2000);
  const requireConfirmUrl = page.url();
  const requireConfirmView = new URL(requireConfirmUrl).searchParams.get('view');
  console.log(`  RequireConfirm URL fallback: view 参数 = ${requireConfirmView}`);
  console.log(`  >>> 结论：RequireConfirm ${requireConfirmView === 'RequireConfirm' ? '已注册' : '未注册，已 fallback 至 ' + requireConfirmView}\n`);

  // 2. 逐个验证 8 个注册视图
  const allResults = [];
  for (const view of REGISTERED_VIEWS) {
    console.log(`--- 验证视图: ${view.label} (key=${view.key}) ---`);
    // 通过 Tab 切换（更真实）
    const btn = page.locator(`button:has-text("${view.tabText}")`).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
      await delay(2500);
    } else {
      // 回退到 URL
      await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=${view.key}`, { waitUntil: 'networkidle' });
      await delay(2500);
    }

    // 验证 URL 是否正确切换
    const currentUrl = page.url();
    const currentView = new URL(currentUrl).searchParams.get('view');
    console.log(`  当前 view 参数: ${currentView}`);

    const structure = await captureViewStructure(page, view.key, view.label);
    const result = {
      view: view.label,
      key: view.key,
      currentView,
      structure,
      screenshot: `final_${view.key}.png`,
    };
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, result.screenshot), fullPage: false });
    allResults.push(result);

    if (structure.error) {
      console.log(`  ✗ 结构抓取失败: ${structure.error}`);
    } else {
      console.log(`  视图根: ${structure.viewRootTag}, 子元素数: ${structure.childCount}`);
      for (const layer of structure.layers) {
        const isActionBar = layer.height === '28px' && layer.borderBottom !== 'none' && layer.borderBottom !== '';
        const isBizStrip = layer.overflowX === 'auto' && layer.borderBottom !== 'none' && layer.borderBottom !== '';
        const layerType = isActionBar ? '[L3 StageActionBar]' : isBizStrip ? '[L2 StageBizStrip?]' : '[其他]';
        console.log(`  子${layer.index} ${layerType} h=${layer.height} overflowX=${layer.overflowX}`);
        console.log(`    文本: ${layer.text.slice(0, 120)}`);
      }
    }
    console.log('');
  }

  // 写入完整结果
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'result_final.json'),
    JSON.stringify({
      testTime: new Date().toISOString(),
      account: ADMIN.username,
      docId,
      requireConfirmRegistered: requireConfirmView === 'RequireConfirm',
      requireConfirmFallbackTo: requireConfirmView,
      views: allResults,
    }, null, 2),
  );
  console.log(`结果已写入: ${path.join(SCREENSHOT_DIR, 'result_final.json')}`);

  await browser.close();
})();
