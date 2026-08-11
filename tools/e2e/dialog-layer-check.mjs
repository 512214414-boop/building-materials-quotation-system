// v14.3 弹窗层级诊断（只读，不写任何数据）
// 复现：编辑弹窗 → 进价明细面板 → 点击「点位」→ 批量调整弹窗
// 检查：批量弹窗的挂载位置 / z-index / 是否被面板遮挡
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

  // 打开编辑弹窗
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  // 打开进价明细面板（单位行上的进价入口）
  const pBtn = page.locator('.ant-modal-wrap [title*="进价明细"]').first();
  const pc = await pBtn.count();
  console.log(`[info] 进价明细入口=${pc}`);
  if (pc > 0) {
    await pBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(700);
  }

  // 找到「点位」按钮（进价面板行内的点位列）
  const pointBtn = page.locator('.ant-modal-wrap button[title*="点位"]').first();
  const ptc = await pointBtn.count();
  console.log(`[info] 点位按钮=${ptc}`);
  if (ptc === 0) {
    console.log('[result] 未找到点位按钮，无法复现');
    await browser.close();
    return;
  }

  // 点击前：记录面板（popover）位置
  const panelInfo = await page.evaluate(() => {
    const wrap = document.querySelector('.ant-modal-wrap');
    const panel = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    return {
      wrapCount: document.querySelectorAll('.ant-modal-wrap').length,
      wrapZ: wrap ? getComputedStyle(wrap).zIndex : null,
      wrapPos: wrap ? getComputedStyle(wrap).position : null,
      panelExists: !!panel,
      panelZ: panel ? getComputedStyle(panel).zIndex : null,
      panelAncestor: panel ? (panel.closest('.ant-modal-wrap') ? 'inside-wrap' : panel.parentElement ? panel.parentElement.className : '?') : null,
    };
  });
  console.log(`[before] 面板层级=${JSON.stringify(panelInfo)}`);

  await pointBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(900);

  // 点击后：批量调整弹窗与面板层级
  const afterInfo = await page.evaluate(() => {
    const wraps = Array.from(document.querySelectorAll('.ant-modal-wrap')).map((w) => {
      const chain = [];
      let n = w.parentElement;
      while (n && n !== document.body) {
        chain.push(String(n.className).slice(0, 40));
        n = n.parentElement;
      }
      chain.push('BODY');
      return {
        cls: String(w.className).slice(0, 60),
        z: getComputedStyle(w).zIndex,
        pos: getComputedStyle(w).position,
        inBody: w.parentElement === document.body,
        ancestorChain: chain.join(' > '),
        hasDialog: !!w.querySelector('.ant-modal-content') || !!w.querySelector('.ant-modal'),
      };
    });
    const dialogs = Array.from(document.querySelectorAll('.ant-modal')).map((m) => {
      const t = m.querySelector('.ant-modal-title')?.textContent ?? '';
      return { title: t.slice(0, 30), z: getComputedStyle(m).zIndex };
    });
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
    // 面板 popover 是否仍可见
    const panel = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    const panelAfter = panel
      ? {
          z: getComputedStyle(panel).zIndex,
          ancestor: panel.closest('.ant-modal-wrap') ? 'inside-wrap' : panel.parentElement?.className ?? '?',
        }
      : null;
    return { wraps, dialogs, batchWrapZ: batchWrap ? getComputedStyle(batchWrap).zIndex : null, batchVisible, panelAfter };
  });
  console.log(`[after] 弹窗层级=${JSON.stringify(afterInfo, null, 1)}`);

  await page.screenshot({ path: '/tmp/batch-dialog-layer.png', fullPage: false });
  console.log('[info] 截图已保存 /tmp/batch-dialog-layer.png');

  await browser.close();
}

main().catch((e) => {
  console.error('[error]', e);
  process.exit(1);
});
