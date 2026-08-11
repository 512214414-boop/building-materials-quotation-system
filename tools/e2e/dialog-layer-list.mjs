// v14.3 弹窗层级诊断·列表流（只读）
// 列表页直接点「售价」单元格 → 面板 → 进价 Tab → 点位 → 批量弹窗
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });

  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  // 列表行内售价单元格（a[title 含 售价] / 点击展开面板）
  const saleCell = page.locator('tbody tr').nth(1).locator('a', { hasText: /¥|—/ }).first();
  const sc = await saleCell.count();
  console.log(`[info] 列表售价单元格=${sc}`);
  if (sc > 0) {
    await saleCell.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }

  // 面板是否打开（body 级 popover）
  const panel = await page.evaluate(() => {
    const p = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    if (!p) return null;
    return {
      z: getComputedStyle(p).zIndex,
      parent: p.parentElement ? String(p.parentElement.className).slice(0, 40) : '?',
      inModalWrap: !!p.closest('.ant-modal-wrap'),
    };
  });
  console.log(`[panel] 列表面板=${JSON.stringify(panel)}`);

  // 切到进价 Tab
  const tabs = page.locator('.ant-popover:not(.ant-popover-hidden) .ant-tabs-tab', { hasText: '进价明细' });
  if (await tabs.count() > 0) {
    await tabs.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // 点位按钮
  const pointBtn = page.locator('.ant-popover:not(.ant-popover-hidden) button[title*="点位"]').first();
  const ptc = await pointBtn.count();
  console.log(`[info] 列表面板点位按钮=${ptc}`);
  if (ptc === 0) {
    // 兜底：任意可见点位按钮
    const anyP = page.locator('button[title*="点位"]:visible').first();
    if (await anyP.count() > 0) await anyP.click({ force: true }).catch(() => {});
    else { console.log('[result] 无点位按钮'); await browser.close(); return; }
  } else {
    await pointBtn.click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(900);

  const info = await page.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll('.ant-modal-wrap')).map((w) => ({
      z: getComputedStyle(w).zIndex,
      title: w.textContent?.includes('批量调整进价') ? '批量调整进价' : '其他',
      inBody: w.parentElement === document.body,
      parent: String(w.parentElement?.className ?? '').slice(0, 30),
    }));
    const batchWrap = Array.from(document.querySelectorAll('.ant-modal-wrap')).find((w) =>
      w.textContent?.includes('批量调整进价'),
    );
    const batch = batchWrap?.querySelector('.ant-modal');
    let batchVisible = null;
    if (batch) {
      const r = batch.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
      batchVisible = el && batch.contains(el);
    }
    const panelAfter = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    return { wraps, batchVisible, panelStillOpen: !!panelAfter };
  });
  console.log(`[after] 列表流弹窗层级=${JSON.stringify(info, null, 1)}`);
  await page.screenshot({ path: '/tmp/batch-dialog-list.png', fullPage: false });
  console.log('[info] 截图 /tmp/batch-dialog-list.png');

  await browser.close();
}

main().catch((e) => {
  console.error('[error]', e);
  process.exit(1);
});
