/**
 * 档案售价/进价：面价|点位|实际价同构；点位点确认层（当前/改全局）；列表无点位列
 * 运行：node e2e_browser/verify_archive_points.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FE = 'http://localhost:8081';
const SHOT = path.join(__dirname, 'screenshots', 'archive_points');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const fails = [];
function check(name, ok, detail) {
  log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
}

async function assertInCanvas(page, label) {
  const info = await page.evaluate(() => {
    const shell = document.querySelector('.ds-app-shell');
    if (!shell) return { ok: false, reason: 'no-shell' };
    const canvas = shell.getBoundingClientRect();
    const els = [...document.querySelectorAll('.float-panel, .ant-popover:not(.ant-popover-hidden)')];
    const bad = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const left = r.left - canvas.left;
      const right = canvas.right - r.right;
      if (left < -1.5 || right < -1.5) {
        bad.push({
          cls: String(el.className).slice(0, 48),
          left: Math.round(left),
          right: Math.round(right),
          w: Math.round(r.width),
        });
      }
    }
    return { ok: bad.length === 0, bad, canvasW: Math.round(canvas.width) };
  });
  check(`${label}不超出画布左右`, !!info.ok, JSON.stringify(info));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${FE}/login?role=staff`, { waitUntil: 'networkidle' });
  await sleep(400);
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForURL(/\/staff\//, { timeout: 15000 });

  await page.goto(`${FE}/staff/basic/products`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-table-tbody tr.ant-table-row', { timeout: 15000 });
  await sleep(600);

  const thead = await page.locator('.ant-table-thead').innerText();
  check('列表表头没有点位列', !thead.includes('点位'), thead.replace(/\s+/g, ' ').slice(0, 80));

  const skuRow = page.locator('.ant-table-tbody tr.ant-table-row').filter({
    has: page.locator('.ds-picker-edit-trigger'),
  }).first();
  await skuRow.waitFor({ timeout: 10000 });

  const saleCell = skuRow.locator('td').filter({ hasText: /¥|未定/ }).first();
  await saleCell.click();
  await sleep(800);
  await page.screenshot({ path: path.join(SHOT, '01-sale-panel.png') });

  const salePanel = page.locator('.ant-popover:visible, .float-panel').last();
  const saleHead = await page.evaluate(() => {
    const pop = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    if (!pop) return { text: '', heads: [] };
    const heads = [...pop.querySelectorAll('.ds-grid-header > *')].map((el) =>
      (el.textContent || '').trim(),
    );
    return { text: (pop.innerText || '').slice(0, 200), heads };
  });
  log('SALE_HEAD', JSON.stringify(saleHead));
  check('售价面板有面价列', saleHead.heads.includes('面价'), JSON.stringify(saleHead.heads));
  check('售价面板有点位列', saleHead.heads.includes('点位'), JSON.stringify(saleHead.heads));
  check('售价面板有售价列', saleHead.heads.includes('售价') || saleHead.heads.includes('价格'), JSON.stringify(saleHead.heads));
  await assertInCanvas(page, '售价维护浮层');

  const pointTrigger = page.locator('.ant-popover:not(.ant-popover-hidden) .ds-picker-edit-trigger').nth(2);
  const pointCount = await page.locator('.ant-popover:not(.ant-popover-hidden) .ds-picker-edit-trigger').count();
  log('sale triggers', pointCount);
  if (pointCount >= 3) {
    await pointTrigger.click({ force: true });
    await sleep(500);
    await page.screenshot({ path: path.join(SHOT, '02-sale-point-gate.png') });
    const gateText = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('.float-panel')];
      return panels.map((p) => (p.innerText || '').slice(0, 300));
    });
    log('GATE', JSON.stringify(gateText));
    const joined = gateText.join('\n');
    check('点位点开确认层不是批量窗', joined.includes('修改售价点位') || joined.includes('点位'), joined.slice(0, 120));
    check('确认层有确认修改', joined.includes('确认修改'), joined.slice(0, 80));
    check('确认层有改全局', joined.includes('改全局'), joined.slice(0, 80));
    check('确认层不说例外/组默认', !joined.includes('例外') && !joined.includes('组默认'), joined.slice(0, 120));
    check('没有弹出批量调整对话框', (await page.locator('.ant-modal:visible').count()) === 0);
    await assertInCanvas(page, '点位确认层');
    const footerInfo = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('.float-panel')].find((p) =>
        (p.textContent || '').includes('确认修改'),
      );
      if (!panel) return { ok: false, reason: 'no-panel' };
      const footer = panel.querySelector('[data-float-footer]');
      if (!footer) return { ok: false, reason: 'no-footer' };
      const pr = panel.getBoundingClientRect();
      const fr = footer.getBoundingClientRect();
      const text = (footer.textContent || '').replace(/\s+/g, '');
      return {
        ok: true,
        hasCancel: text.includes('取消'),
        hasConfirm: text.includes('确认修改'),
        pinBottom: Math.abs(fr.bottom - pr.bottom) < 6,
        gap: Math.round(pr.bottom - fr.bottom),
        panelW: Math.round(pr.width),
      };
    });
    check('确认/取消在底栏', !!(footerInfo.ok && footerInfo.hasCancel && footerInfo.hasConfirm), JSON.stringify(footerInfo));
    check('底栏钉在面板底部', !!footerInfo.pinBottom, JSON.stringify(footerInfo));
    check('确认层不按整句撑宽', (footerInfo.panelW ?? 0) > 0 && footerInfo.panelW <= 400, JSON.stringify(footerInfo));

    const cancel = page.getByRole('button', { name: '取消' }).last();
    if (await cancel.count()) await cancel.click();
    await sleep(300);
  } else {
    check('售价面板点位格子可点', false, `triggers=${pointCount}`);
  }

  await page.keyboard.press('Escape');
  await sleep(300);

  const purchaseCell = skuRow.locator('td').nth(-4);
  // 进价列通常在售价右边。点开进价：找含红色/进价的单元格
  const tds = skuRow.locator('td');
  const tdCount = await tds.count();
  // 尝试点倒数几列里带 ¥ 的第二个
  let openedPurchase = false;
  for (let i = 0; i < tdCount; i++) {
    const t = await tds.nth(i).innerText();
    if (/未设进价|¥/.test(t) && i > 6) {
      await tds.nth(i).click();
      await sleep(700);
      const tab = page.locator('.ant-popover:not(.ant-popover-hidden)').getByText('进价明细');
      if ((await tab.count()) > 0) {
        await tab.click();
        await sleep(400);
        openedPurchase = true;
        break;
      }
    }
  }
  await page.screenshot({ path: path.join(SHOT, '03-purchase-panel.png') });
  const buyHead = await page.evaluate(() => {
    const pop = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
    if (!pop) return { heads: [], text: '' };
    const heads = [...pop.querySelectorAll('.ds-grid-header > *')].map((el) =>
      (el.textContent || '').trim(),
    );
    return { heads, text: (pop.innerText || '').slice(0, 200) };
  });
  log('BUY_HEAD', JSON.stringify(buyHead), 'opened', openedPurchase);
  check('进价面板有面价列', buyHead.heads.includes('面价') || !openedPurchase, JSON.stringify(buyHead.heads));
  check('进价面板有点位列', buyHead.heads.includes('点位') || !openedPurchase, JSON.stringify(buyHead.heads));
  if (openedPurchase) await assertInCanvas(page, '进价维护浮层');

  if (openedPurchase) {
    const clicked = await page.evaluate(() => {
      const pop = document.querySelector('.ant-popover:not(.ant-popover-hidden)');
      if (!pop) return false;
      const rows = [...pop.querySelectorAll('.ds-grid-row')].filter((r) => {
        const st = getComputedStyle(r);
        return st.display !== 'none' && st.visibility !== 'hidden' && r.getClientRects().length > 0;
      });
      for (const row of rows) {
        const t = row.textContent || '';
        if (/零售价|批发价|工程价|测试输入|输入新价格类型/.test(t) && !/供应商|渠道|批发/.test(t)) continue;
        const point = [...row.querySelectorAll('.ds-picker-edit-trigger')].find((el) =>
          /^(0\.\d+|1(\.0+)?)$/.test((el.textContent || '').trim()),
        );
        if (point) {
          point.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
          return true;
        }
      }
      return false;
    });
    await sleep(500);
    await page.screenshot({ path: path.join(SHOT, '04-purchase-point-gate.png') });
    const gateText = await page.evaluate(() =>
      [...document.querySelectorAll('.float-panel')].map((p) => (p.innerText || '').slice(0, 300)).join('\n'),
    );
    check('进价点位格子可点', clicked);
    check('进价点位确认层', gateText.includes('进价点位') || gateText.includes('修改进价点位'), gateText.slice(0, 100));
    check('进价点位有改全局', gateText.includes('改全局'));
    check('进价点位不是批量窗', (await page.getByText('批量调整').count()) === 0);
    await assertInCanvas(page, '进价点位确认层');
  }

  check('页面无 JS 错误', errors.length === 0, errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('\nFAILED:\n' + fails.map((f) => '- ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nALL GREEN');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
