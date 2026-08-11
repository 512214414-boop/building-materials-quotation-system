/**
 * v11.18 生产版（8080）验证：
 *  1. 产品全名列编辑态 input 撑满单元格（原 183px → 应 ≈212px）
 *  2. 点击下拉箭头展开面板，面板稳定不闪关
 *  3. 列宽编辑态前后一致
 */
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
async function snapshotCols(page, label) {
  const s = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.ds-table-shell .ant-table-thead th'));
    const cols = ths.map((th, i) => ({ i, w: Math.round(th.getBoundingClientRect().width), title: (th.innerText || '').trim().slice(0, 8) }));
    return { cols };
  });
  console.log(`[${label}]`, JSON.stringify(s.cols));
  return s;
}
(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── 桌面 1440×900 ──
  console.log('=== 桌面 1440×900 ===');
  {
    const { page } = await login(browser, { width: 1440, height: 900 });
    await openPurchaseQuote(page);
    await snapshotCols(page, '初始');
    const rows = page.locator('.ds-table-shell .ant-table-tbody tr');
    const r0 = rows.first();
    const prodCell = r0.locator('td').nth(2);
    await prodCell.click();
    await sleep(800);
    await snapshotCols(page, '编辑态');
    const info = await page.evaluate(() => {
      const td = document.querySelector('.ds-table-shell .ant-table-tbody tr td:nth-child(3)');
      const input = td ? td.querySelector('input') : null;
      const tdR = td ? td.getBoundingClientRect() : null;
      const iR = input ? input.getBoundingClientRect() : null;
      return {
        tdW: tdR ? Math.round(tdR.width) : null,
        inputW: iR ? Math.round(iR.width) : null,
      };
    });
    console.log('[编辑态单元格/input]', JSON.stringify(info));

    // 点击下拉箭头展开面板，跟踪 1 秒是否稳定
    const arrow = prodCell.locator('.anticon-down').first();
    if (await arrow.count() > 0) await arrow.click();
    for (let i = 0; i <= 6; i++) {
      await sleep(150);
      const s = await page.evaluate(() => {
        const p = document.querySelector('.float-panel');
        if (!p) return 'closed';
        const r = p.getBoundingClientRect();
        return `open(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)})`;
      });
      console.log(`  t+${i * 150}ms:`, s);
    }
    await page.close();
  }

  // ── 移动 390×844 ──
  console.log('=== 移动 390×844 ===');
  {
    const { page } = await login(browser, { width: 390, height: 844 });
    await openPurchaseQuote(page);
    const rows = page.locator('.ds-table-shell .ant-table-tbody tr');
    const r0 = rows.first();
    const prodCell = r0.locator('td').nth(2);
    await prodCell.click();
    await sleep(800);
    const info = await page.evaluate(() => {
      const td = document.querySelector('.ds-table-shell .ant-table-tbody tr td:nth-child(3)');
      const input = td ? td.querySelector('input') : null;
      const tdR = td ? td.getBoundingClientRect() : null;
      const iR = input ? input.getBoundingClientRect() : null;
      return { tdW: tdR ? Math.round(tdR.width) : null, inputW: iR ? Math.round(iR.width) : null };
    });
    console.log('[编辑态单元格/input]', JSON.stringify(info));

    // 点击下拉箭头展开面板（进入激活态），再模拟键盘弹出
    const arrow = prodCell.locator('.anticon-down').first();
    if (await arrow.count() > 0) await arrow.click();
    await sleep(800);
    const open1 = await page.evaluate(() => (document.querySelector('.float-panel') ? 'open' : 'closed'));
    console.log('[点击箭头后]', open1);

    // 模拟键盘弹出：dispatchEvent + 滚动
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      if (window.visualViewport) {
        window.visualViewport.dispatchEvent(new Event('resize'));
        window.visualViewport.dispatchEvent(new Event('scroll'));
      }
      window.scrollTo(0, 300);
    });
    await sleep(500);
    const after = await page.evaluate(() => {
      const p = document.querySelector('.float-panel');
      return p ? 'open' : 'closed';
    });
    console.log('[模拟键盘/滚动后]', after);
    await page.close();
  }

  await browser.close();
})();
