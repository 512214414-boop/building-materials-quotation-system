const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FE = 'http://127.0.0.1:8081';
const SHOT = path.join(__dirname, 'screenshots', 'customer_refund_picker');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  ).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${FE}/login?role=staff`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('请输入用户名').fill('manager01');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForURL(/\/staff\//, { timeout: 20000 });

  await page.goto(`${FE}/staff/documents`, { waitUntil: 'networkidle' });
  await sleep(500);
  await page.getByRole('button', { name: /新建单据/ }).first().click();
  await sleep(600);
  const custInput = page.getByPlaceholder(/姓名|手机号|尾号/).first();
  await custInput.waitFor({ timeout: 8000 });
  await custInput.click();
  await custInput.fill('0001');
  await sleep(800);
  await page.screenshot({ path: path.join(SHOT, '01-customer-tail.png') });

  const customerPanel = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      hasName: body.includes('名称'),
      hasAddress: /地址/.test(body),
      hasCustomerA: body.includes('测试客户A'),
      has0001: body.includes('13800000001') || body.includes('0001'),
    };
  });

  const addrBtn = page.getByRole('button', { name: '地址', exact: true }).first();
  if (await addrBtn.count()) {
    await addrBtn.click();
    await sleep(700);
    await page.screenshot({ path: path.join(SHOT, '01b-customer-address.png') });
  }

  await page.keyboard.press('Escape');
  await sleep(200);

  await page.goto(`${FE}/staff/workbench/248?view=RefundAfterSale`, { waitUntil: 'networkidle' });
  await sleep(1200);
  const soldInput = page.getByPlaceholder('对着已卖行打名称');
  await soldInput.waitFor({ timeout: 15000 });
  await soldInput.click();
  await soldInput.fill('三通');
  await sleep(900);
  await page.screenshot({ path: path.join(SHOT, '02-sold-lines.png') });

  const soldPanel = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasSantong: t.includes('三通'),
      hasInsert: t.includes('插入'),
      hasSourceHint: t.includes('搜单号') || t.includes('原单'),
    };
  });

  await page.getByPlaceholder('0').first().fill('1');
  const insertBtn = page.getByRole('button', { name: /插入/ }).first();
  if (await insertBtn.count()) {
    const boxes = page.locator('input[type="checkbox"]');
    const n = await boxes.count();
    if (n > 0) await boxes.last().check({ force: true }).catch(() => {});
    await insertBtn.click().catch(() => {});
    await sleep(800);
  }
  await page.screenshot({ path: path.join(SHOT, '03-after-insert.png') });

  await browser.close();
  const out = { errors, customerPanel, soldPanel };
  console.log(JSON.stringify(out, null, 2));
  if (!customerPanel.hasCustomerA || !soldPanel.hasSantong || !soldPanel.hasInsert) {
    process.exit(1);
  }
  if (errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
