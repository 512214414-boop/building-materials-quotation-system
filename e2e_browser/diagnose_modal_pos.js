/** 诊断：快速建档流程中各级弹窗的位置（是否视口居中） */
const { chromium } = require('playwright');
const path = require('path');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API_BASE}${pathname}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${pathname} 失败`);
  return data.data;
}
(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ title: 'v11.10弹窗诊断单' }),
  });
  const docId = doc.id;

  // 手机视口模拟（用户反馈小屏/手机端体验）
  const browser = await chromium.launch({ headless: true });
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'zh-CN' });
    const page = await context.newPage();
    console.log(`\n===== 视口 ${vp.w}x${vp.h} =====`);
    await page.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' });
    await sleep(600);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(1800);
    await page.goto(`http://localhost:8081/staff/documents/${docId}`, { waitUntil: 'networkidle' });
    await sleep(2500);
    const docRowLink = page.locator('a:has-text("v11.10弹窗诊断单")').first();
    if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
    const pqTab = page.locator('nav button:has-text("采购报价")');
    if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }

    const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
    const row0 = tableRows().nth(0);

    // 打开快速建档弹窗
    const prodCell = () => row0.locator('td').nth(2);
    await prodCell().click();
    await sleep(400);
    await prodCell().locator('input').first().fill(`弹窗诊断${Date.now() % 100000}`);
    await sleep(200);
    await prodCell().locator('input').first().press('Tab');
    await sleep(1000);
    await prodCell().locator('.anticon-down').first().click();
    await sleep(1000);
    const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
    if (await createOpt.count() > 0) { await createOpt.click(); }
    await sleep(1200);

    // 诊断主弹窗（快速新增产品）
    const dialog = page.locator('.ant-modal-content:has-text("快速新增产品")').first();
    if (await dialog.count() > 0) {
      const box = await dialog.boundingBox();
      const vw = vp.w, vh = vp.h;
      const centered = box && Math.abs((box.x + box.width / 2) - vw / 2) < 5;
      const vCentered = box && Math.abs((box.y + box.height / 2) - vh / 2) < 5;
      console.log(`主弹窗: x=${box?.x?.toFixed(0)} y=${box?.y?.toFixed(0)} w=${box?.width?.toFixed(0)} h=${box?.height?.toFixed(0)} | 水平居中=${centered} 垂直居中=${vCentered}`);
    } else {
      console.log('主弹窗未找到');
    }

    // 保存 → 缺省确认弹窗
    const saveBtn = page.locator('.ant-modal-footer button').last();
    if (await saveBtn.count() > 0) { await saveBtn.click(); }
    await sleep(1000);
    const confirm = page.locator('.ant-modal-confirm-content:has-text("系统将自动补充")').first();
    if (await confirm.count() > 0) {
      const box = await confirm.locator('xpath=ancestor::div[contains(@class,"ant-modal")]').first().boundingBox().catch(() => null);
      console.log(`缺省确认弹窗: x=${box?.x?.toFixed(0)} y=${box?.y?.toFixed(0)} w=${box?.width?.toFixed(0)} h=${box?.height?.toFixed(0)}`);
    } else {
      console.log('缺省确认弹窗未找到');
    }
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'pq_v119', `diagnose_${vp.w}.png`) });
    await context.close();
  }
  await browser.close();
})();
