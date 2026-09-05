// 临时 e2e：确认层收敛复验 —— 无齿轮、统一下拉收/展按钮、行内改/删常驻、两档切换
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
    .catch(() => false);
  ok('产品表格渲染', tableOk);
  if (!tableOk) {
    await browser.close();
    console.log(results.join('\n'));
    return;
  }
  await page.waitForTimeout(1000);

  // 逐列探测：点格子直到出现「修改分类/修改品牌」确认层
  const row0 = page.locator('tbody tr:not(.ant-table-measure-row)').first();
  let gateOpen = false;
  for (let c = 0; c < 7 && !gateOpen; c++) {
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
  const gate = page.locator('.float-panel:visible').last();
  ok('确认层出现「改全局」按钮', (await gate.getByRole('button', { name: '改全局' }).count()) > 0);

  // ① 无齿轮（旧管理入口已删）
  const gearCount = await page.locator('[title="管理字典（增删改）"]').count();
  ok('确认层无齿轮旧入口', gearCount === 0);

  // ② 统一收/展按钮（默认展开）
  const toggleBtn = page.locator('[title="收起字典检索"], [title="展开字典检索"]').last();
  ok('统一收/展按钮存在', (await toggleBtn.count()) > 0);
  ok('默认展开（title=收起字典检索）', (await page.locator('[title="收起字典检索"]').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/21-gate-new-default.png` });

  // ③ 行内改/删常驻（不 hover 直接可见）
  const dictPanel = page.locator('.float-panel:visible', { hasText: '完整字典' }).last();
  const itemRows = dictPanel.locator('[role="button"]').filter({ hasNotText: '直接选用' }).filter({ hasNotText: '（默认）' });
  if ((await itemRows.count()) > 0) {
    ok('行内「改」常驻可见（无 hover）', await dictPanel.locator('[aria-label^="改名"]').first().isVisible().catch(() => false));
    ok('行内「删」常驻可见（无 hover）', await dictPanel.locator('[aria-label^="删除"]').first().isVisible().catch(() => false));
  } else {
    results.push('— 检索档无 existing 行，切完整字典档再验常驻');
  }

  // ④ 点收起 → 下拉收；再点 → 展开
  await toggleBtn.click();
  await page.waitForTimeout(500);
  ok('点收起后下拉关闭', !(await page.locator('.float-panel:visible', { hasText: '完整字典' }).last().isVisible().catch(() => false)));
  const toggleBtn2 = page.locator('[title="展开字典检索"]').last();
  ok('收起后按钮 title 翻转', (await toggleBtn2.count()) > 0);
  await page.screenshot({ path: `${SHOTS}/22-gate-collapsed.png` });
  await toggleBtn2.click();
  await page.waitForTimeout(500);
  ok('再点后下拉重新展开', (await page.locator('.float-panel:visible', { hasText: '完整字典' }).last().isVisible().catch(() => false)));

  // ⑤ 完整字典档 + 常驻改/删
  const dictPanel2 = page.locator('.float-panel:visible', { hasText: '完整字典' }).last();
  await dictPanel2.locator('text=完整字典').first().click();
  await page.waitForTimeout(1000);
  const itemRows2 = dictPanel2.locator('[role="button"]').filter({ hasNotText: '直接选用' });
  const dictRowCount = await itemRows2.count();
  ok('完整字典档列出字典项', dictRowCount > 0, `rows=${dictRowCount}`);
  if (dictRowCount > 0) {
    ok('完整字典行内「改/删」常驻',
      (await dictPanel2.locator('[aria-label^="改名"]').first().isVisible().catch(() => false)) &&
      (await dictPanel2.locator('[aria-label^="删除"]').first().isVisible().catch(() => false)));
    await page.screenshot({ path: `${SHOTS}/23-dict-persistent-actions.png` });

    // ⑥ 行内「删」→ 单条 confirm（取消）
    await itemRows2.first().hover();
    await page.waitForTimeout(200);
    await dictPanel2.locator('[aria-label^="删除"]').first().click();
    await page.waitForTimeout(600);
    const confirmText = ((await page.locator('.ant-modal-confirm:visible').last().textContent().catch(() => '')) ?? '');
    ok('行内「删」弹单条确认（历史值保留说明）', /删除/.test(confirmText) && /字符串保留/.test(confirmText));
    await page.screenshot({ path: `${SHOTS}/24-delete-confirm.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 关闭确认层（不落库）
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
