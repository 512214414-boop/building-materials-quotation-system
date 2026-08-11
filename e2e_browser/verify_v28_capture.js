// v2.8 布局整改视图验证 - DOM 结构抓取（computed style 版）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'v28_verify');

const ADMIN = { username: 'admin', password: 'Admin@123' };

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

// 通过 computed style 找到工作台内容区容器
async function captureViewStructure(page) {
  return await page.evaluate(() => {
    // 策略：找到所有 div，筛选出 display:flex, flexDirection:column, 且其第一个子元素高度=28px（StageActionBar）
    // 或者其子元素中含 "共 N 项/行/条/笔/已确认" 文本
    const allDivs = Array.from(document.querySelectorAll('div'));
    let viewRoot = null;
    for (const div of allDivs) {
      const cs = window.getComputedStyle(div);
      if (cs.display !== 'flex' || cs.flexDirection !== 'column') continue;
      // 视图根 div 的特征：height: 100% 或 minHeight: 0，含 StageActionBar 子元素
      const text = (div.textContent || '').trim();
      // 检查是否含 "共 X 项/行/条/笔/已确认" 模式
      if (!/共\s*\d+\s*(项|行|条|笔|已确认|笔)/.test(text)) continue;
      // 检查子元素中是否有高度 28px 的（StageActionBar）
      const firstChild = div.firstElementChild;
      if (firstChild) {
        const childStyle = window.getComputedStyle(firstChild);
        const h = parseInt(childStyle.height, 10);
        if (h === 28) {
          viewRoot = div;
          break;
        }
      }
    }

    // 备用策略：找含 StageActionBar 特征的最深 div
    if (!viewRoot) {
      for (const div of allDivs) {
        const text = (div.textContent || '').trim();
        if (!/共\s*\d+\s*(项|行|条|笔)/.test(text)) continue;
        // 确认 div 直接子元素含 "共 X 项"
        const firstChild = div.firstElementChild;
        if (!firstChild) continue;
        const childText = (firstChild.textContent || '').trim();
        if (/共\s*\d+\s*(项|行|条|笔)/.test(childText)) {
          viewRoot = div;
          break;
        }
      }
    }

    if (!viewRoot) {
      return { error: '未找到视图根', bodyExcerpt: document.body.innerText.slice(0, 1000) };
    }

    // 收集视图根的直接子元素（前 4 个）
    const children = Array.from(viewRoot.children).slice(0, 4);
    const layers = children.map((child, idx) => {
      const cs = window.getComputedStyle(child);
      const text = (child.textContent || '').trim();
      return {
        index: idx,
        tag: child.tagName,
        height: cs.height,
        flexShrink: cs.flexShrink,
        borderBottomWidth: cs.borderBottomWidth,
        background: cs.backgroundColor,
        overflowX: cs.overflowX,
        display: cs.display,
        text: text.slice(0, 250),
        // 提取所有 "label:" 模式的文本（BizField）
        bizFields: Array.from(child.querySelectorAll('span'))
          .map((s) => (s.textContent || '').trim())
          .filter((t) => /^[^:]{1,8}:$/.test(t) || /^[^:]{1,8}：$/.test(t))
          .slice(0, 10),
        // 提取所有按钮文本
        buttons: Array.from(child.querySelectorAll('button'))
          .map((b) => (b.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 8),
      };
    });

    return {
      viewRootStyle: viewRoot.getAttribute('style') || '',
      childCount: viewRoot.children.length,
      layers,
    };
  });
}

(async () => {
  console.log('===== v2.8 布局整改视图验证（computed style 抓取）=====\n');

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

  // 1. RequireConfirm 注册检查
  console.log('--- RequireConfirm 注册检查 ---');
  await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=RequireConfirm`, { waitUntil: 'networkidle' });
  await delay(2000);
  const requireConfirmView = new URL(page.url()).searchParams.get('view');
  console.log(`  RequireConfirm URL fallback: view 参数 = ${requireConfirmView}`);
  console.log(`  >>> 结论：RequireConfirm ${requireConfirmView === 'RequireConfirm' ? '已注册' : '未注册（fallback 至 ' + requireConfirmView + '）'}\n`);

  // 2. 验证 8 个注册视图
  const allResults = [];
  for (const view of REGISTERED_VIEWS) {
    console.log(`--- 验证视图: ${view.label} (key=${view.key}) ---`);
    const btn = page.locator(`button:has-text("${view.tabText}")`).first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
      await delay(2500);
    } else {
      await page.goto(`${BASE_URL}/staff/workbench/${docId}?view=${view.key}`, { waitUntil: 'networkidle' });
      await delay(2500);
    }

    const currentView = new URL(page.url()).searchParams.get('view');
    console.log(`  当前 view: ${currentView}`);

    const structure = await captureViewStructure(page);
    const shotName = `final_${view.key}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotName), fullPage: false });

    if (structure.error) {
      console.log(`  ✗ ${structure.error}`);
      console.log(`  body 节选: ${structure.bodyExcerpt?.slice(0, 300)}`);
      allResults.push({ view: view.label, key: view.key, currentView, error: structure.error, bodyExcerpt: structure.bodyExcerpt, screenshot: shotName });
    } else {
      console.log(`  视图根子元素数: ${structure.childCount}`);
      for (const layer of structure.layers) {
        const isActionBar = layer.height === '28px';
        const isBizStrip = layer.overflowX === 'auto' && layer.height !== '28px' && layer.borderBottomWidth !== '0px';
        const type = isActionBar ? 'L3-StageActionBar' : isBizStrip ? 'L2-StageBizStrip?' : '其他';
        console.log(`  [子${layer.index}] ${type} | h=${layer.height} | overflowX=${layer.overflowX} | borderBottom=${layer.borderBottomWidth}`);
        console.log(`    文本: ${layer.text.slice(0, 150)}`);
        if (layer.bizFields.length) console.log(`    BizField 标签: [${layer.bizFields.join(', ')}]`);
        if (layer.buttons.length) console.log(`    按钮: [${layer.buttons.join(', ')}]`);
      }
      allResults.push({ view: view.label, key: view.key, currentView, structure, screenshot: shotName });
    }
    console.log('');
  }

  // 汇总：基于 DOM 抓取结果，人工判定每个视图的 StageActionBar/StageBizStrip 是否存在
  console.log('===== 基于 DOM 抓取的判定汇总 =====\n');
  console.log('视图名 | StageActionBar | StageBizStrip | 旧结构残留 | 权限拒绝 | 截图文件名');
  console.log('---|---|---|---|---|---');
  for (const r of allResults) {
    if (r.error) {
      console.log(`${r.view} | 异常 | 异常 | - | - | ${r.screenshot}`);
      continue;
    }
    const layers = r.structure.layers;
    // StageActionBar = h=28px 且含 "共" 字
    const actionBar = layers.find((l) => l.height === '28px' && l.text.includes('共'));
    // StageBizStrip = overflowX=auto 且含 BizField 标签（label:）
    const bizStrip = layers.find((l) => l.overflowX === 'auto' && l.bizFields.length > 0);
    // 旧结构检测
    const hasOldResidue = layers.some((l) =>
      l.text.includes('StatCard') || l.text.includes('锁定横幅') || l.text.includes('lock-banner')
    );
    // 权限拒绝
    const fullText = layers.map((l) => l.text).join(' ');
    const permDenied = fullText.includes('暂不能使用') || fullText.includes('权限不足');
    console.log(
      `${r.view} | ${actionBar ? '有' : '无'} | ${bizStrip ? '有' : '无'} | ${hasOldResidue ? '有' : '无'} | ${permDenied ? '有' : '无'} | ${r.screenshot}`,
    );
  }

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'result_capture.json'),
    JSON.stringify({ testTime: new Date().toISOString(), account: ADMIN.username, docId, requireConfirmView, views: allResults }, null, 2),
  );
  console.log(`\n结果已写入: ${path.join(SCREENSHOT_DIR, 'result_capture.json')}`);

  await browser.close();
})();
