import { chromium } from 'playwright';
const BASE = 'http://localhost:8081';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('请输入用户名').fill('admin');
await page.getByPlaceholder('请输入密码').fill('Admin@123');
const loginBtn = page.getByRole('button', { name: /登\s*录/ });
await loginBtn.waitFor({ state: 'visible', timeout: 10000 });
await Promise.all([
  page.waitForURL('**/staff/**', { timeout: 20000 }).catch(async () => {
    console.log('登录后仍在:', page.url());
    console.log('页面提示:', ((await page.locator('.ant-message, [class*="message"]').textContent().catch(() => '')) ?? '').slice(0, 120));
  }),
  loginBtn.click(),
]);
await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
console.log('当前 URL:', page.url());
await page.waitForSelector('tbody tr:not(.ant-table-measure-row)', { timeout: 30000 });
await page.waitForTimeout(1000);

console.log('modal-wrap 数:', await page.locator('.ant-modal-wrap').count());
console.log('modal-content 数:', await page.locator('.ant-modal-content').count());
console.log('modal-wrap 可见:', await page.locator('.ant-modal-wrap:visible').count());
const wrapText = await page.locator('.ant-modal-wrap').first().textContent().catch(() => '');
console.log('modal-wrap 首个文本:', (wrapText || '').slice(0, 120).replace(/\s+/g, ' '));
const rows = page.locator('tbody tr:not(.ant-table-measure-row)');
console.log('行数:', await rows.count());
const r0 = rows.first();
console.log('行0 文本:', ((await r0.textContent()) ?? '').slice(0, 100).replace(/\s+/g, ' '));
console.log('行0 td 数:', await r0.locator('td').count());
for (let i = 0; i < Math.min(4, await r0.locator('td').count()); i++) {
  const t = ((await r0.locator('td').nth(i).textContent()) ?? '').slice(0, 30).replace(/\s+/g, ' ');
  const btns = await r0.locator('td').nth(i).locator('button').count();
  console.log(`  td[${i}] 按钮=${btns} 文本="${t}"`);
}
await page.screenshot({ path: 'e2e_browser/shots-suggestdict/debug-products.png' });
await browser.close();
