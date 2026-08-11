/** 工作台视图遍历回归（生产版 8080） */
const { chromium } = require('playwright');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
(async () => {
  const browser = await chromium.launch({ headless: true });
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));

  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2000);

  await page.locator('button:has-text("订单协同工作台")').first().click();
  await sleep(2500);
  const docLink = page.locator('a').filter({ hasText: '生产冒烟验证' }).first();
  if (await docLink.count() > 0) await docLink.click();
  await sleep(2500);

  const views = ['采购报价', '统一配货', '订单交付', '成本标注', '收款对账', '售后退款', '定档归档', '销售汇总'];
  for (const v of views) {
    errors.length = 0;
    // 宽泛定位含视图名的可点击元素并点击
    const clicked = await page.evaluate((name) => {
      const els = document.querySelectorAll('button, [role="tab"], a, .ds-viewtab span, [class*="tab"]');
      for (const el of els) {
        const t = (el.innerText || '').trim();
        if (t.includes(name) && t.length < 12) { el.click(); return true; }
      }
      return false;
    }, v);
    if (!clicked) { console.log(`✗ ${v} 未找到 tab`); continue; }
    await sleep(1800);
    const bodyLen = (await page.evaluate(() => document.body ? document.body.innerText.length : 0)) || 0;
    const errs = [...errors];
    console.log(`${bodyLen > 100 && errs.length === 0 ? '✓' : '✗'} ${v} body=${bodyLen}${errs.length ? ' ERR=' + errs.join(' | ') : ''}`);
  }
  await browser.close();
})();
