// v14.3 档案输入统一组件（DictRefField）综合回归（只读）
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const wrap = page.locator('.ant-modal-wrap');

  // ---- 1. 进价面板供应商（DictRefField）----
  await wrap.locator('[title*="进价明细"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const supBtn = wrap.locator('button[title*="管理档案"]').first();
  console.log(`[1] 供应商管理按钮=${await supBtn.count()}`);
  await supBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  const supPanel = await page.evaluate(() => {
    const pops = Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)'));
    const mgr = pops[pops.length - 1];
    return mgr ? { text: mgr.textContent?.replace(/\s+/g, ' ').slice(0, 120), z: getComputedStyle(mgr).zIndex } : null;
  });
  console.log(`[1] 供应商档案面板=${JSON.stringify(supPanel)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- 2. 品牌编辑态（DictRefField）----
  // 关闭进价面板后进入品牌编辑态
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const brandEditBtn = wrap.locator('button[title="编辑品牌名称"]').first();
  const be = await brandEditBtn.count();
  console.log(`[2] 品牌编辑按钮=${be}`);
  if (be > 0) {
    await brandEditBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    const brandBtn = wrap.locator('button[title*="管理档案"]').first();
    console.log(`[2] 品牌管理按钮=${await brandBtn.count()}`);
    await brandBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    const brandPanel = await page.evaluate(() => {
      const pops = Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)'));
      const mgr = pops[pops.length - 1];
      return mgr ? { text: mgr.textContent?.replace(/\s+/g, ' ').slice(0, 120) } : null;
    });
    console.log(`[2] 品牌档案面板=${JSON.stringify(brandPanel)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ---- 3. 分类（DictRefField）----
  const catBtn = wrap.locator('button[title*="管理档案"]').first();
  const cb = await catBtn.count();
  console.log(`[3] 分类管理按钮=${cb}`);
  if (cb > 0) {
    await catBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    const catPanel = await page.evaluate(() => {
      const pops = Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)'));
      const mgr = pops[pops.length - 1];
      return mgr ? { text: mgr.textContent?.replace(/\s+/g, ' ').slice(0, 120) } : null;
    });
    console.log(`[3] 分类档案面板=${JSON.stringify(catPanel)}`);
  }

  // ---- 4. 全量回归：弹窗层级 + 推算颜色 ----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const saleCell = page.locator('tbody tr').nth(1).locator('a', { hasText: /¥|—/ }).first();
  await saleCell.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  const tabs = page.locator('.ant-popover:not(.ant-popover-hidden) .ant-tabs-tab', { hasText: '进价明细' });
  if (await tabs.count() > 0) { await tabs.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(500); }
  const ptBtn = page.locator('.ant-popover:not(.ant-popover-hidden) button[title*="点位"]').first();
  await ptBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(900);
  const layer = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.ant-modal-wrap')).find((w) => w.textContent?.includes('批量调整进价'));
    const p = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    return { batchZ: b ? getComputedStyle(b).zIndex : null, panelZ: p ? getComputedStyle(p).zIndex : null };
  });
  console.log(`[4] 弹窗层级 batchZ=${layer.batchZ} panelZ=${layer.panelZ}（期望 1000 > 999）`);

  console.log(`[5] errors=${errors.length ? JSON.stringify(errors) : '无'}`);
  await page.screenshot({ path: '/tmp/dictreffield-final.png', fullPage: false });
  console.log('[截图] /tmp/dictreffield-final.png');
  await browser.close();
}

main().catch((e) => { console.error('[error]', e); process.exit(1); });
