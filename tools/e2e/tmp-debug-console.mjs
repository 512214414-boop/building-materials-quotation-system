import { chromium } from 'playwright';
const BASE = 'http://localhost:8081';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 300));
});
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.getByPlaceholder('请输入用户名').fill('admin');
await page.getByPlaceholder('请输入密码').fill('Admin@123');
await page.getByRole('button', { name: /登\s*录/ }).click();
await page.waitForURL('**/staff/**', { timeout: 20000 }).catch(() => console.log('登录后 URL:', page.url()));
await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
console.log('body 长度:', ((await page.locator('body').innerHTML().catch(() => '')) ?? '').length);
await browser.close();
