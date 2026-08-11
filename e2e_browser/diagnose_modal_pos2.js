/** 诊断2：弹窗几何 + 画布滚动状态 */
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
    body: JSON.stringify({ title: 'v11.10弹窗诊断单2' }),
  });
  const docId = doc.id;

  const browser = await chromium.launch({ headless: true });
  const vp = { w: 390, h: 844 };
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'zh-CN' });
  const page = await context.newPage();
  console.log(`===== 视口 ${vp.w}x${vp.h} =====`);
  await page.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  await page.goto(`http://localhost:8081/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const docRowLink = page.locator('a:has-text("v11.10弹窗诊断单2")').first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }

  // 画布状态
  const canvasState = await page.evaluate(() => ({
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    bodyScrollW: document.body.scrollWidth,
    bodyClientW: document.body.clientWidth,
    bodyScrollLeft: document.body.scrollLeft,
    shellW: document.querySelector('.ds-app-shell')?.getBoundingClientRect().width ?? null,
    shellLeft: document.querySelector('.ds-app-shell')?.getBoundingClientRect().left ?? null,
  }));
  console.log('画布状态:', JSON.stringify(canvasState));

  // 打开快速建档弹窗
  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  const row0 = tableRows().nth(0);
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
  console.log('新建选项数:', await createOpt.count());
  if (await createOpt.count() > 0) { await createOpt.click(); }
  await sleep(1500);

  // 所有 modal 的几何
  const modals = await page.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll('.ant-modal-wrap'));
    return wraps.map((w) => {
      const m = w.querySelector('.ant-modal');
      const content = w.querySelector('.ant-modal-content');
      const style = getComputedStyle(w);
      const mRect = m?.getBoundingClientRect();
      const title = content?.querySelector('.ant-modal-title')?.textContent || '';
      return {
        title: (title || '').trim(),
        wrapStyle: { position: style.position, top: style.top, left: style.left },
        modalRect: mRect ? { x: Math.round(mRect.x), y: Math.round(mRect.y), w: Math.round(mRect.width), h: Math.round(mRect.height) } : null,
      };
    });
  });
  console.log('Modal 列表:');
  for (const m of modals) console.log('  ', JSON.stringify(m));

  // 画布滚动后弹窗位置（模拟用户在画布上滚动横向）
  if (canvasState.bodyScrollW > canvasState.innerW) {
    await page.evaluate(() => { document.body.scrollLeft = 400; });
    await sleep(400);
    const after = await page.evaluate(() => {
      const m = document.querySelector('.ant-modal');
      const r = m?.getBoundingClientRect();
      return { scrollLeft: document.body.scrollLeft, modalRect: r ? { x: Math.round(r.x), y: Math.round(r.y) } : null };
    });
    console.log('画布滚动后弹窗:', JSON.stringify(after));
  }

  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'pq_v119', 'diagnose2_390.png') });
  await browser.close();
})();
