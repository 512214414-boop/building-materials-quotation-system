/** 验证「内容撑开列宽」机制：文本态超长内容 → 编辑态回落（8080） */
const { chromium } = require('playwright');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
async function login(browser, viewport) {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const page = await browser.newPage({ viewport });
  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  return { page, token };
}
async function openPurchaseQuote(page) {
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
  await sleep(1800);
}
const W = async (page) => page.evaluate(() => {
  const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
  return ths.map((th) => Math.round(th.getBoundingClientRect().width));
});
(async () => {
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, { width: 1440, height: 900 });
  await openPurchaseQuote(page);
  console.log('初始列宽:', JSON.stringify(await W(page)));

  // 用 JS 注入超长产品名到第一行产品列（模拟真机文字更宽的效果）
  await page.evaluate(() => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    if (td) {
      const span = td.querySelector('span');
      if (span) span.textContent = '超长产品名称测试AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA超长产品名称测试BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    }
  });
  await sleep(600);
  console.log('超长内容后列宽:', JSON.stringify(await W(page)));

  // 点击进入编辑态
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  await r0.locator('td').nth(2).click();
  await sleep(700);
  console.log('编辑态列宽:', JSON.stringify(await W(page)));

  await browser.close();
})();
