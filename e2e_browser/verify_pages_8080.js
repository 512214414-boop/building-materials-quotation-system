/**
 * v11.18+ 删除 107 个重复 .js 后全系统多页面回归（生产版 8080）
 * 逐页访问，捕获页面 JS 错误 + 白屏检测
 */
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
  page.on('pageerror', (e) => errors.push(`[${page.url().split('/').pop()}] ${e.message.slice(0, 120)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console][${page.url().split('/').pop()}] ${m.text().slice(0, 120)}`); });

  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2000);

  const pages = [
    '/staff/workbench',                       // 订单协同工作台
    '/staff/documents',                       // 单据列表
    '/staff/products',                        // 产品管理
    '/staff/suppliers',                       // 供应商
    '/staff/customers',                       // 客户
    '/staff/warehouses',                      // 仓库
    '/staff/inventory',                       // 库存
    '/staff/inbound',                         // 入库
    '/staff/backorders',                      // 缺货
    '/staff/supplier-payable',                // 供应商应付
    '/staff/admin/users',                     // 系统管理
    '/staff/admin/roles',                     // 角色权限
    '/staff/audit-logs',                      // 审计日志
    '/staff/admin/codes',                     // 授权码
    '/staff/access-requests',                 // 接入申请
  ];
  for (const p of pages) {
    errors.length = 0;
    await page.goto(`http://localhost:8080${p}`, { waitUntil: 'networkidle' });
    await sleep(1500);
    const bodyText = (await page.evaluate(() => document.body ? document.body.innerText.length : 0)) || 0;
    const hasApp = await page.evaluate(() => !!document.querySelector('.ds-app-shell, .app-container, #root'));
    const errs = [...errors];
    console.log(`${bodyText > 50 && hasApp ? '✓' : '✗'} ${p} body=${bodyText}${errs.length ? ' ERR=' + errs.join(' | ') : ''}`);
  }
  await browser.close();
})();
