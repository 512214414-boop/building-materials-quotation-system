/** WebKit 真机截图对比：采购报价产品列 未点击 vs 点击编辑 vs 展开面板（8080） */
const { webkit, devices } = require('playwright');
const API_BASE = 'http://localhost:3000';
const fs = require('fs');
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const browser = await webkit.launch({
    headless: true,
    env: { ...process.env, PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin' },
  });
  const device = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...device, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2000);
  await page.locator('button:has-text("订单协同工作台")').first().click();
  await sleep(2000);
  const docLink = page.locator('a').filter({ hasText: '生产冒烟验证' }).first();
  if (await docLink.count() > 0) await docLink.click();
  await sleep(2000);
  const tabs = page.locator('nav button, [role="tab"], .ds-viewtab button');
  for (let i = 0; i < await tabs.count(); i++) {
    const t = ((await tabs.nth(i).innerText()) || '').trim();
    if (t.includes('采购报价')) { await tabs.nth(i).click(); break; }
  }
  await sleep(2000);

  // 截图表格区域（未点击）
  const tableBox = await page.locator('.ds-table-shell').boundingBox();
  if (tableBox) {
    await page.screenshot({ path: '/tmp/shot_m1_initial.png', clip: { x: tableBox.x, y: tableBox.y, width: Math.min(tableBox.width, 800), height: 200 } });
  }
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);
  await prodCell.click();
  await sleep(800);
  if (tableBox) {
    await page.screenshot({ path: '/tmp/shot_m2_editing.png', clip: { x: tableBox.x, y: tableBox.y, width: Math.min(tableBox.width, 800), height: 200 } });
  }
  const arrow = prodCell.locator('.anticon-down').first();
  if (await arrow.count() > 0) {
    await arrow.click();
    await sleep(1000);
    if (tableBox) {
      await page.screenshot({ path: '/tmp/shot_m3_panel.png', clip: { x: tableBox.x, y: tableBox.y, width: Math.min(tableBox.width, 800), height: 200 } });
    }
  }
  console.log('截图完成: /tmp/shot_m1_initial.png /tmp/shot_m2_editing.png /tmp/shot_m3_panel.png');
  await browser.close();
})();
