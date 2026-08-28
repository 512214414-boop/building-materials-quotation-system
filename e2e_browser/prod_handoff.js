/**
 * 生产闭环走查：登录后点产品 / 库存期初 / 采购入库 / 经营分析
 * 运行：node e2e_browser/prod_handoff.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FE = 'http://localhost:8081';
const SHOT = path.join(__dirname, 'screenshots', 'prod_handoff');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(`${FE}/login?role=staff`, { waitUntil: 'networkidle' });
  await sleep(800);
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForURL(/\/staff\//, { timeout: 15000 });
  log('login ok', page.url());

  const visits = [
    ['产品管理', '/staff/basic/products'],
    ['库存台账', '/staff/basic/inventory'],
    ['采购入库', '/staff/operation/purchase-inbound'],
    ['经营分析', '/staff/ops'],
    ['供应商应付', '/staff/operation/payables'],
  ];
  for (const [name, url] of visits) {
    await page.goto(`${FE}${url}`, { waitUntil: 'networkidle' });
    await sleep(1500);
    const body = await page.locator('body').innerText();
    const hit =
      body.includes(name) ||
      body.includes('共') ||
      body.includes('查询') ||
      body.includes('确认入库') ||
      body.includes('期初') ||
      body.includes('区间经营') ||
      body.includes('应付账龄');
    log(`${name}: url=${page.url()} hit=${hit} len=${body.length}`);
    await page.screenshot({ path: path.join(SHOT, `${name}.png`), fullPage: true });
    if (!hit) errors.push(`${name} 页面未见预期文案`);
  }

  await browser.close();
  if (errors.length) {
    log('ERRORS', errors.slice(0, 12));
    process.exit(1);
  }
  log('handoff pages ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
