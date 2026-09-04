/**
 * 页面装配器验证（元模型运行时 · 阶段 F）
 *   验证供应商管理页的列顺序来自登记表 pages.supplier.slots，且功能正常。
 * 用法：node e2e_browser/verify_supplier_assembler.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const OUT = '/tmp/assembler-verify';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(BASE + '/staff/login', { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2200);

  await page.goto(BASE + '/staff/basic/suppliers', { waitUntil: 'networkidle' });
  await sleep(3000);
  await page.screenshot({ path: `${OUT}/supplier-list.png` });

  // 读表头列顺序
  const headers = await page.locator('.ds-table-shell thead th, .ant-table-thead th').allInnerTexts();
  console.log('[表头列顺序]', headers.map((h) => h.trim()).filter(Boolean).join(' | '));

  const rowCount = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  console.log('[数据行数(含表头)]', rowCount);

  const body = (await page.locator('body').innerText()).slice(0, 400);
  console.log('[页面片段]', body.replace(/\s+/g, ' ').slice(0, 260));

  await browser.close();
  console.log('产物:', fs.readdirSync(OUT).join(', '));
})();
