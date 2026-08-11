/** 移动端专项诊断：390×844 下产品列「初始/点击/编辑/展开面板」列宽是否恒定（8080） */
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
async function snap(page, label) {
  const s = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
    const cols = ths.map((th) => Math.round(th.getBoundingClientRect().width));
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    const input = td ? td.querySelector('input') : null;
    const span = td ? td.querySelector('span') : null;
    return {
      cols,
      productTdW: td ? Math.round(td.getBoundingClientRect().width) : null,
      inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
      spanW: span ? Math.round(span.getBoundingClientRect().width) : null,
      hasInput: !!input,
    };
  });
  console.log(`[${label}] cols=${JSON.stringify(s.cols)} tdW=${s.productTdW} inputW=${s.inputW} spanW=${s.spanW}`);
  return s;
}
async function run(viewport, tag) {
  console.log(`\n===== ${tag} ${viewport.width}x${viewport.height} =====`);
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, viewport);
  await openPurchaseQuote(page);
  await snap(page, '①初始(未点击)');
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);
  // ② 注入超长内容（模拟真机字体渲染更宽）
  await page.evaluate(() => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    const span = td.querySelector('span');
    if (span) span.textContent = 'ppr DN25给水管 伟星绿 en2.8 超长扩展内容追加测试文字';
  });
  await sleep(600);
  await snap(page, '②超长内容后');
  // ③ 点击进入编辑态
  await prodCell.click();
  await sleep(600);
  await snap(page, '③点击进入编辑态');
  // ④ 点击下拉箭头展开面板
  const arrow = prodCell.locator('.anticon-down').first();
  if (await arrow.count() > 0) {
    await arrow.click();
    await sleep(900);
    await snap(page, '④展开面板激活态');
    const panelOpen = await page.evaluate(() => (document.querySelector('.float-panel') ? 'open' : 'closed'));
    console.log(`面板状态: ${panelOpen}`);
  }
  await browser.close();
}
(async () => {
  await run({ width: 1440, height: 900 }, '桌面');
  await run({ width: 390, height: 844 }, '手机');
})();
