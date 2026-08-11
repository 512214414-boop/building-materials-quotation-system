// v14.2 面板诊断：产品列表 → 售价/进价面板，截图 + 检查推算单元格与供应商输入
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:8080';
const errors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });

  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  // 打开某行的售价列（列表第 5 列=售价？先找含价格的单元格）
  // 列表列：操作|#|分类|图|产品全名|单位|售价|进价|备注|状态|更新时间 → 售价约第 6 列（0-based）
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  console.log(`[info] 列表行数=${rowCount}`);
  for (let i = 1; i < Math.min(rowCount, 4); i++) {
    const r = rows.nth(i);
    // 售价列（含 ¥ 的单元格，倒数第6列附近）
    const priceCell = r.locator('td').nth(6);
    const text = await priceCell.textContent().catch(() => '');
    if (/¥|未定价|未设/.test(text ?? '')) {
      console.log(`[info] 行${i} 售价列文本=${text?.trim()}`);
      await priceCell.click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
      break;
    }
  }

  // 截图面板
  await page.screenshot({ path: '/tmp/panel-sale.png', fullPage: false });
  console.log('[info] 已截图 /tmp/panel-sale.png');

  // 检查面板内"推算"标签位置与颜色
  const calcTags = page.locator('text=推算');
  const calcCount = await calcTags.count();
  console.log(`[info] 面板内「推算」标签数=${calcCount}`);
  for (let i = 0; i < Math.min(calcCount, 3); i++) {
    const box = await calcTags.nth(i).boundingBox().catch(() => null);
    const color = await calcTags.nth(i).evaluate((el) => getComputedStyle(el).color).catch(() => '');
    const parentBox = await calcTags.nth(i).evaluate((el) => {
      const cell = el.closest('td');
      if (!cell) return null;
      const cr = cell.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      return { cellW: cr.width, cellH: cr.height, elRight: cr.right - er.right, elBottom: cr.bottom - er.bottom };
    }).catch(() => null);
    console.log(`[info] 推算#${i}: color=${color} 相对单元格=`, JSON.stringify(parentBox));
  }

  // 检查进价面板（关闭当前面板，点进价列）
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  for (let i = 1; i < Math.min(rowCount, 4); i++) {
    const r = rows.nth(i);
    const priceCell = r.locator('td').nth(7); // 进价列
    const text = await priceCell.textContent().catch(() => '');
    if (/¥|未设进价/.test(text ?? '')) {
      console.log(`[info] 行${i} 进价列文本=${text?.trim()}`);
      await priceCell.click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
      break;
    }
  }
  await page.screenshot({ path: '/tmp/panel-purchase.png', fullPage: false });
  console.log('[info] 已截图 /tmp/panel-purchase.png');

  // 切到进价明细 Tab（若默认在售价）
  const tabs = page.locator('.ant-tabs-tab, [role="tab"]');
  const tabTexts = [];
  for (let i = 0; i < await tabs.count(); i++) {
    tabTexts.push(await tabs.nth(i).textContent().catch(() => ''));
  }
  console.log(`[info] 面板 Tab=${JSON.stringify(tabTexts)}`);
  const purchaseTab = page.locator('[role="tab"]', { hasText: /进价/ });
  if (await purchaseTab.count()) {
    await purchaseTab.first().click().catch(() => {});
    await page.waitForTimeout(400);
    console.log('[info] 已切换进价明细 Tab');
  }

  // dump 面板内全部可见 input（确认供应商输入框是否渲染）
  const allInputs = page.locator('.ant-popover input, .ant-modal-wrap input, .ant-tabs input, .record-expand input');
  const visibleInputs = [];
  const aiCount = await allInputs.count();
  for (let i = 0; i < aiCount; i++) {
    const vis = await allInputs.nth(i).isVisible().catch(() => false);
    if (!vis) continue;
    const ph = await allInputs.nth(i).getAttribute('placeholder').catch(() => '');
    const val = await allInputs.nth(i).inputValue().catch(() => '');
    visibleInputs.push({ i, ph: ph ?? '', val: val ?? '' });
  }
  console.log(`[info] 可见 input 清单=${JSON.stringify(visibleInputs.slice(0, 12))}`);

  // 精确测供应商输入框（第一个有值的非价格输入框 = 供应商 nameCell）
  const supplierTarget = page.locator('.ant-popover input, .record-expand input').filter({ has: undefined });
  let targetIdx = -1;
  for (let i = 0; i < aiCount; i++) {
    const vis = await allInputs.nth(i).isVisible().catch(() => false);
    if (!vis) continue;
    const val = await allInputs.nth(i).inputValue().catch(() => '');
    const ph = await allInputs.nth(i).getAttribute('placeholder').catch(() => '');
    if (val && val !== '0.00' && val !== '20.27' && ph !== '0.00' && ph !== '输入单位名') {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx >= 0) {
    const t = allInputs.nth(targetIdx);
    const pe = await t.evaluate((el) => getComputedStyle(el).pointerEvents).catch(() => '');
    const cls = await t.getAttribute('class').catch(() => '');
    console.log(`[info] 供应商输入框: pointerEvents=${pe} class=${cls}`);
    await t.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const focused = await t.evaluate((el) => el === document.activeElement).catch(() => false);
    console.log(`[info] 点击后聚焦=${focused}`);
    if (focused) {
      await t.press('Control+a').catch(() => {});
      await t.type('测试供应商').catch(() => {});
      await page.waitForTimeout(300);
      const v2 = await t.inputValue().catch(() => '');
      console.log(`[info] 输入后值=${v2}`);
      // 失焦触发解析
      await page.keyboard.press('Tab').catch(() => {});
      await page.waitForTimeout(500);
      const v3 = await t.inputValue().catch(() => '');
      console.log(`[info] 失焦后值=${v3}`);
    } else {
      const overlay = await t.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit ? hit.tagName + '.' + (hit.className || '') : 'none';
      }).catch(() => '');
      console.log(`[info] 点击未聚焦，命中=${overlay}`);
    }
  } else {
    console.log('[info] 未找到供应商输入框');
  }

  // 关闭面板
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  console.log(`\n===== 控制台报错（共 ${errors.length}） =====`);
  [...new Set(errors)].forEach((e) => console.log(e));
  if (errors.length === 0) console.log('（无报错）');

  await browser.close();
}

main().catch((e) => {
  console.error('脚本异常：', e?.message ?? e);
  process.exit(1);
});
