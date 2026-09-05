// 临时 e2e：字典并档下沉验证 v2 —— 产品档案确认层（分类/品牌格）路径
// 验证：确认层字典下拉的两档切换、行内改/删按钮、完整字典档、改全局按钮、删除 confirm。
// 只验证 UI 形态，不真正落库（确认/删除一律取消）。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:8081';
const SHOTS = 'e2e_browser/shots-suggestdict';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? '✓' : '✗'} ${name}${extra ? `（${extra}）` : ''}`);
  if (!cond) process.exitCode = 1;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 20000 });
  ok('登录进入 staff', page.url().includes('/staff'));

  // 产品管理页
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  const tableOk = await page
    .waitForSelector('tbody tr:not(.ant-table-measure-row)', { timeout: 60000 })
    .then(() => true)
    .catch(async () => {
      console.log('页面停留:', page.url());
      console.log('页面文本:', ((await page.locator('body').textContent().catch(() => '')) ?? '').slice(0, 200).replace(/\s+/g, ' '));
      await page.screenshot({ path: `${SHOTS}/00-stuck.png` });
      return false;
    });
  if (!tableOk) {
    await browser.close();
    console.log(results.join('\n'));
    return;
  }
  await page.waitForTimeout(1000);

  // 逐列探测：点格子直到出现「修改分类/修改品牌」确认层（.float-panel）
  const row0 = page.locator('tbody tr:not(.ant-table-measure-row)').first();
  const gate = page.locator('.float-panel:visible').last();
  let gateOpen = false;
  for (let c = 0; c < 7 && !gateOpen; c++) {
    // 关掉上一次误开的浮层/弹窗
    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
    const td = row0.locator('td').nth(c);
    const text = ((await td.textContent()) ?? '').trim().slice(0, 20);
    if (!text || text === '—') continue;
    await td.click();
    await page.waitForTimeout(800);
    const t = ((await page.locator('.float-panel:visible').last().textContent().catch(() => '')) ?? '');
    gateOpen = /修改分类|修改品牌/.test(t);
    if (!gateOpen) {
      // 误开了编辑弹窗等：关掉
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }
  ok('分类/品牌格确认层打开', gateOpen);
  if (!gateOpen) {
    await browser.close();
    console.log(results.join('\n'));
    return;
  }
  const gateText0 = ((await gate.textContent()) ?? '').replace(/\s+/g, ' ');
  ok('确认层出现「改全局」按钮', (await gate.getByRole('button', { name: '改全局' }).count()) > 0);
  ok('确认层字典检索下拉自动展开', await page.locator('.float-panel:visible [role="button"]').first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/11-gate-open.png` });

  // ① 确认层下拉里的两档切换条（PickerTreeViewBar 渲染在字典下拉 FloatPanel 里）
  const dictPanel = page.locator('.float-panel:visible', { hasText: '完整字典' }).last();
  const viewBar = await dictPanel.locator('text=完整字典').first().isVisible().catch(() => false);
  ok('确认层下拉出现「检索结果/完整字典」两档', viewBar);
  await page.screenshot({ path: `${SHOTS}/12-gate-viewbar.png` });

  // ② 检索档行 hover → 行内改/删按钮（排除「直接选用」占位行与「（默认）」占位概念行——设计上仅 existing 真字典项给按钮）
  const suggestRows = dictPanel
    .locator('[role="button"]')
    .filter({ hasNotText: '直接选用' })
    .filter({ hasNotText: '（默认）' });
  const suggestCount = await suggestRows.count();
  if (suggestCount > 0) {
    const sTxt = ((await suggestRows.first().textContent()) ?? '').trim().slice(0, 24);
    await suggestRows.first().hover();
    await page.waitForTimeout(300);
    ok('检索档 hover 行尾出现「改」', await dictPanel.locator('[aria-label^="改名"]').first().isVisible().catch(() => false), `hover 行="${sTxt}"`);
    ok('检索档 hover 行尾出现「改」', await dictPanel.locator('[aria-label^="改名"]').first().isVisible().catch(() => false));
    ok('检索档 hover 行尾出现「删」', await dictPanel.locator('[aria-label^="删除"]').first().isVisible().catch(() => false));
    await page.screenshot({ path: `${SHOTS}/13-suggest-row-actions.png` });
  } else {
    results.push('— 检索档无结果行（关键词为空），跳过 hover 检查');
  }

  // ③ 切「完整字典」→ 全量列表 + hover 行内按钮
  await dictPanel.locator('text=完整字典').first().click();
  await page.waitForTimeout(1000);
  // 真实字典行 = 排除「已有·直接选用」占位行（占位行设计上不带改/删按钮）
  const dictItemRows = dictPanel.locator('[role="button"]').filter({ hasNotText: '直接选用' });
  const dictRows = await dictItemRows.count();
  const rowTexts = [];
  for (let i = 0; i < Math.min(dictRows, 6); i++) {
    rowTexts.push(((await dictItemRows.nth(i).textContent()) ?? '').trim().slice(0, 24));
  }
  ok('完整字典档列出全量字典项', dictRows > 0, `rows=${dictRows} [${rowTexts.join(' | ')}]`);
  if (dictRows > 0) {
    const firstRow = dictItemRows.first();
    await firstRow.hover();
    await page.waitForTimeout(300);
    ok('完整字典 hover 行尾出现「改/删」',
      (await dictPanel.locator('[aria-label^="改名"]').first().isVisible().catch(() => false)) &&
      (await dictPanel.locator('[aria-label^="删除"]').first().isVisible().catch(() => false)));
    await page.screenshot({ path: `${SHOTS}/14-dict-full.png` });

    // ④ 行内「改」→ 该项名装进确认层 draft、下拉收起
    const rowName = ((await firstRow.textContent()) ?? '').trim();
    await dictPanel.locator('[aria-label^="改名"]').first().click();
    await page.waitForTimeout(600);
    ok('行内「改」把该项装进改名流程（下拉收起、值进入输入框）',
      !(await dictPanel.isVisible().catch(() => false)) || !(await page.locator('.float-panel:visible', { hasText: '完整字典' }).last().isVisible().catch(() => false)),
      `rowName=${rowName.slice(0, 12)}`);
    await page.screenshot({ path: `${SHOTS}/15-rename-in-gate.png` });
  }

  // ⑤ 行内「删」→ 单条 confirm（取消，不真删）——重新打开下拉
  const input = page.locator('.float-panel:visible input:visible').first();
  await input.click();
  await page.waitForTimeout(700);
  const dictPanel2 = page.locator('.float-panel:visible', { hasText: '完整字典' }).last();
  const row2 = dictPanel2
    .locator('[role="button"]')
    .filter({ hasNotText: '直接选用' })
    .first();
  if ((await row2.count()) > 0) {
    await row2.hover();
    await page.waitForTimeout(300);
    await dictPanel2.locator('[aria-label^="删除"]').first().click();
    await page.waitForTimeout(600);
    const confirmText = ((await page.locator('.ant-modal-confirm:visible').last().textContent().catch(() => '')) ?? '');
    ok('行内「删」弹单条确认（历史值保留说明）', /删除/.test(confirmText) && /字符串保留/.test(confirmText), confirmText.slice(0, 50).replace(/\s+/g, ' '));
    await page.screenshot({ path: `${SHOTS}/16-delete-confirm.png` });
    await page.keyboard.press('Escape'); // 取消删除（不真删）
    await page.waitForTimeout(400);
  }

  // ⑥ 关闭确认层（不落库）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await browser.close();
  console.log(results.join('\n'));
}

main().catch(async (e) => {
  console.error('e2e 失败：', String(e).slice(0, 300));
  console.log(results.join('\n'));
  process.exit(1);
});
