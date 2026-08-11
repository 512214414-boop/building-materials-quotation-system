/** 调试：快速建档弹窗打开流程各步骤状态 */
const { chromium } = require('playwright');
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
    body: JSON.stringify({ title: 'v11.10调试单' }),
  });
  const docId = doc.id;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[页面错误]', e.message));
  await page.goto('http://localhost:8081/staff/login', { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  await page.goto(`http://localhost:8081/staff/documents/${docId}`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const docRowLink = page.locator('a:has-text("v11.10调试单")').first();
  if (await docRowLink.count() > 0) { await docRowLink.click(); await sleep(2500); }
  const pqTab = page.locator('nav button:has-text("采购报价")');
  if (await pqTab.count() > 0) { await pqTab.first().click(); await sleep(1500); }

  const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
  console.log('表格行数:', await tableRows().count());
  const row0 = tableRows().nth(0);
  const prodCell = () => row0.locator('td').nth(2);

  await prodCell().click();
  await sleep(500);
  const inputCount = await prodCell().locator('input').count();
  console.log('点击后 input 数:', inputCount);
  if (inputCount > 0) {
    await prodCell().locator('input').first().fill(`调试弹窗${Date.now() % 100000}`);
    await sleep(300);
    await prodCell().locator('input').first().press('Tab');
    await sleep(1200);
    console.log('Tab 后行文本:', ((await row0.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 80));
    const arrow = await prodCell().locator('.anticon-down').count();
    console.log('下拉箭头数:', arrow);
    if (arrow > 0) {
      await prodCell().locator('.anticon-down').first().click();
      await sleep(1200);
      const panels = page.locator('.float-panel');
      console.log('FloatPanel 数:', await panels.count());
      for (let i = 0; i < (await panels.count()); i++) {
        const txt = ((await panels.nth(i).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 120);
        console.log(`  面板[${i}]:`, txt);
      }
      const createOpt = page.locator('.product-picker-main-float-panel [role="button"]:has-text("新建")').first();
      console.log('新建选项数:', await createOpt.count());
      if (await createOpt.count() > 0) {
        await createOpt.click();
        await sleep(1500);
        const wraps = await page.evaluate(() => {
          const ws = Array.from(document.querySelectorAll('.ant-modal-wrap'));
          return ws.map((w) => {
            const c = w.querySelector('.ant-modal-content');
            const r = c?.getBoundingClientRect();
            return {
              title: c?.querySelector('.ant-modal-title')?.textContent || '',
              rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
              visible: w.style.display !== 'none',
            };
          });
        });
        console.log('Modal 列表:', JSON.stringify(wraps));
      }
    }
  }
  await page.screenshot({ path: 'screenshots/pq_v1110/debug_open.png' });
  await browser.close();
})();
