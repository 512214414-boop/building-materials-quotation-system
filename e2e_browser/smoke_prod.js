// 生产构建（8080）冒烟验证：登录 → 建单 → 手输非标 → 选品落库（specId/isStandardized 关键修复）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE_URL = 'http://localhost:8080';
const API_BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, pass, detail) { results.push({ name, pass }); console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`); }

async function apiJson(p, opts = {}) {
  const resp = await fetch(`${API_BASE}${p}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${p} 失败: ${JSON.stringify(data)}`);
  return data.data;
}

(async () => {
  console.log('=== 生产构建（8080）冒烟验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const doc = await apiJson('/api/staff/documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title: '生产冒烟验证' }),
  });
  const H = { Authorization: `Bearer ${token}` };
  console.log(`已建单: ${doc.documentNo} (${doc.id})`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  try {
    await page.goto(`${BASE_URL}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(800);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(2000);
    await page.goto(`${BASE_URL}/staff/documents/${doc.id}`, { waitUntil: 'networkidle' });
    await sleep(3000);
    const link = page.locator('a:has-text("生产冒烟验证")').first();
    if ((await link.count()) > 0) { await link.click(); await sleep(3000); }

    const tableRows = () => page.locator('.ds-table-shell .ant-table-tbody tr');
    const lastRow = () => tableRows().last();
    const prodCell = (row) => row.locator('td').nth(2);

    // S1 手输非标
    await prodCell(lastRow()).click();
    await sleep(600);
    const freeInput = lastRow().locator('td').nth(2).locator('input').first();
    await freeInput.fill('生产冒烟测试品');
    await sleep(300);
    await freeInput.press('Tab');
    await sleep(1500);
    let lines = await apiJson(`/api/staff/documents/${doc.id}/lines`, { headers: H });
    const l1 = lines.find((l) => (l.productRef || '').includes('生产冒烟测试品'));
    record('S1 手输非标行', !!l1 && l1.productId === null && Number(l1.specId) === 0 && l1.isStandardized === false,
      l1 ? `specId=${Number(l1.specId)} std=${l1.isStandardized}` : '未找到');

    // S2 选品落库（关键：specId + isStandardized）
    const row0 = tableRows().nth(0);
    await prodCell(row0).locator('.anticon-down').first().click();
    await sleep(1200);
    await page.locator('input[placeholder="搜索产品…"]').first().fill('ppr');
    await sleep(1500);
    const opt = page.locator('.product-picker-main-float-panel [role="button"]').first();
    let picked = false;
    // v11.5：首个选项可能是「新建」（点击会弹二次确认窗）→ 跳过，选第一个真实结果
    const optN = await page.locator('.product-picker-main-float-panel [role="button"]').count();
    for (let i = 0; i < optN; i++) {
      const o = page.locator('.product-picker-main-float-panel [role="button"]').nth(i);
      const txt = ((await o.textContent()) || '');
      if (txt.includes('新建')) continue;
      await o.locator('span').first().click();
      picked = true;
      break;
    }
    await sleep(2000);
    lines = await apiJson(`/api/staff/documents/${doc.id}/lines`, { headers: H });
    const l2 = lines.find((l) => l.productId !== null);
    record('S2 选品落库', picked && !!l2 && !!l2.specId && Number(l2.specId) > 0 && l2.isStandardized === true,
      l2 ? `specId=${Number(l2.specId)} brand=${l2.brandId} unit=${l2.unitId} std=${l2.isStandardized}` : `picked=${picked}`);

    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'pq_product_usage', 'prod_smoke.png') });
  } catch (e) {
    console.error('脚本异常:', e.message);
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'pq_product_usage', 'prod_smoke_error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
})();
