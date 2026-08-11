/** WebKit 真机模拟：iPhone Safari 下采购报价产品列四态列宽是否恒定（8080） */
const { webkit, devices } = require('playwright');
const API_BASE = 'http://localhost:3000';
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
  async function snap(label) {
    const s = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
      const cols = ths.map((th) => Math.round(th.getBoundingClientRect().width));
      const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
      const input = td ? td.querySelector('input') : null;
      return { cols, tdW: td ? Math.round(td.getBoundingClientRect().width) : null, inputW: input ? Math.round(input.getBoundingClientRect().width) : null };
    });
    console.log(`[${label}]`, JSON.stringify(s));
  }
  await snap('①初始');
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);
  await prodCell.click();
  await sleep(800);
  await snap('②点击编辑态');
  const arrow = prodCell.locator('.anticon-down').first();
  if (await arrow.count() > 0) {
    await arrow.click();
    await sleep(1000);
    await snap('③展开面板激活态');
    console.log('面板:', await page.evaluate(() => (document.querySelector('.float-panel') ? 'open' : 'closed')));
  }
  await browser.close();
})();
