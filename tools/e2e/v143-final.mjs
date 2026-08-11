// v14.3 最终回归（只读）：弹窗层级 + 推算颜色 + 无报错
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  // ---- 1. 列表流弹窗层级 ----
  const saleCell = page.locator('tbody tr').nth(1).locator('a', { hasText: /¥|—/ }).first();
  await saleCell.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  const tabs = page.locator('.ant-popover:not(.ant-popover-hidden) .ant-tabs-tab', { hasText: '进价明细' });
  if (await tabs.count() > 0) { await tabs.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(500); }
  const pointBtn = page.locator('.ant-popover:not(.ant-popover-hidden) button[title*="点位"]').first();
  await pointBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(900);

  const layer = await page.evaluate(() => {
    const batchWrap = Array.from(document.querySelectorAll('.ant-modal-wrap')).find((w) => w.textContent?.includes('批量调整进价'));
    const batch = batchWrap?.querySelector('.ant-modal');
    const panel = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    if (!batch || !panel) return { batch: !!batch, panel: !!panel };
    const br = batch.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    // 重叠区域中心
    const ox = Math.max(br.left, pr.left);
    const oy = Math.max(br.top, pr.top);
    const ox2 = Math.min(br.right, pr.right);
    const oy2 = Math.min(br.bottom, pr.bottom);
    const overlap = ox < ox2 && oy < oy2;
    let topInOverlap = null;
    if (overlap) {
      const el = document.elementFromPoint((ox + ox2) / 2, (oy + oy2) / 2);
      topInOverlap = el ? (batch.contains(el) ? '批量弹窗' : panel.contains(el) ? '面板' : String(el.className).slice(0, 30)) : null;
    }
    return {
      batchZ: getComputedStyle(batchWrap).zIndex,
      panelZ: getComputedStyle(panel).zIndex,
      overlap,
      topInOverlap,
      batchRect: { l: Math.round(br.left), t: Math.round(br.top), r: Math.round(br.right), b: Math.round(br.bottom) },
      panelRect: { l: Math.round(pr.left), t: Math.round(pr.top), r: Math.round(pr.right), b: Math.round(pr.bottom) },
    };
  });
  console.log(`[1] 列表流层级=${JSON.stringify(layer, null, 1)}`);

  // ---- 2. 编辑弹窗内推算占位颜色（售价+进价）----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  const pBtn = page.locator('.ant-modal-wrap [title*="进价明细"]').first();
  await pBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  const switchDiv = page.locator('.ant-modal-wrap div[title="切换维度"]').first();
  const cur = await switchDiv.textContent().catch(() => '');
  if (cur && cur.includes('米')) {
    await switchDiv.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const menuRoot = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item', { hasText: /根/ }).first();
    if (await menuRoot.count() > 0) { await menuRoot.click({ force: true }).catch(() => {}); await page.waitForTimeout(700); }
  }
  const checkPh = () =>
    page.evaluate(() => {
      const wrap = document.querySelector('.ant-modal-wrap');
      if (!wrap) return null;
      const out = [];
      for (const i of Array.from(wrap.querySelectorAll('input'))) {
        const r = i.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const ph = i.placeholder || '';
        if (!/^\d/.test(ph)) continue;
        out.push({ ph: ph.slice(0, 12), color: getComputedStyle(i, '::placeholder').color });
      }
      return out;
    });
  const purchasePh = await checkPh();
  console.log(`[2] 进价推算占位颜色=${JSON.stringify(purchasePh)}`);
  const saleTab = page.locator('.ant-modal-wrap .ant-tabs-tab', { hasText: '售价明细' }).first();
  if (await saleTab.count() > 0) { await saleTab.click({ force: true }).catch(() => {}); await page.waitForTimeout(500); }
  const salePh = await checkPh();
  console.log(`[2] 售价推算占位颜色=${JSON.stringify(salePh)}`);
  await page.screenshot({ path: '/tmp/v14.3-final.png', fullPage: false });
  console.log('[3] 截图 /tmp/v14.3-final.png');

  console.log(`[4] console 报错=${errors.length > 0 ? JSON.stringify(errors) : '无'}`);
  await browser.close();
}

main().catch((e) => { console.error('[error]', e); process.exit(1); });
