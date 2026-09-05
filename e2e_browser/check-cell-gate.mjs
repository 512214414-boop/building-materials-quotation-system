// 逐格确认层能力检查（可反复跑的回归脚本，只读不造数据）
//
// 用途：验证「同一个字段在列表 / 编辑弹窗 / 价格面板里的确认层行为是否一致」。
//   每个格子判定三件事：
//     ① 两档切换条（检索结果 / 完整字典）
//     ② 行内「改」「删」
//     ③ 「改全局」按钮
//   三者全有 = 完整链路；缺任一 = 能力残缺（判定依据见 PickerEditGate 实现：
//   两档条仅在 isDictEntryField(req.dictField) 时渲染，故缺它 = 没接上字典链路）。
//
// 用法：node e2e_browser/check-cell-gate.mjs
// 退出码：0 = 全部完整；1 = 存在能力残缺的格子（判定依据，不看控制台文字）

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = path.join(process.cwd(), 'e2e_browser', process.env.SHOT_DIR || 'shots-cell-gate');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 产品管理列表列索引（由 entityCellSpecs 派生，探索模式实测确认）
const COL = { seq: 1, category: 2, image: 3, productName: 4, brand: 5, spec: 6, unit: 10 };

fs.mkdirSync(OUT, { recursive: true });

/** 取当前所有可见浮层（确认层由 PickerEditGate 渲染为「检索面板 + 影响面板」两个浮层）合并文本与按钮 */
async function readPanel(page) {
  return page.evaluate(() => {
    const sels = ['[class*="float-panel"]', '[class*="ds-panel"]', '.ant-popover', '[role="dialog"]'];
    const panels = [];
    for (const s of sels) {
      panels.push(
        ...Array.from(document.querySelectorAll(s)).filter((e) => {
          const cs = getComputedStyle(e);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().height > 0;
        }),
      );
    }
    const uniq = [...new Set(panels)];
    const texts = uniq.map((el) => (el.innerText || '').trim());
    const buttons = uniq
      .flatMap((el) =>
        Array.from(el.querySelectorAll('button, [role="button"]')).map((b) => ({
          text: (b.innerText || '').trim(),
          aria: b.getAttribute('aria-label') || '',
        })),
      )
      .filter((b) => b.text || b.aria);
    // 按钮去重（同一浮层嵌套会重复收集）
    const seen = new Set();
    const dedup = buttons.filter((b) => {
      const k = `${b.text}|${b.aria}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const allText = texts.join('\n');
    return {
      text: allText,
      buttons: dedup,
      bodyHasDict: /完整字典/.test(document.body.innerText || ''),
      preview: allText.slice(0, 700),
    };
  });
}

/** 判定确认层能力 */
async function probeGate(page, shotName) {
  const first = await readPanel(page);
  const twoPane = /完整字典/.test(first.text) || first.bodyHasDict;
  await page.screenshot({ path: path.join(OUT, `${shotName}.png`) });

  // 行内「改」「删」只在「完整字典」档渲染，故先切档再判定
  if (twoPane) {
    const dictTab = page.locator('button:has-text("完整字典"), [role="button"]:has-text("完整字典")').first();
    if (await dictTab.count().catch(() => 0)) {
      await dictTab.click({ timeout: 3000 }).catch(() => {});
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, `${shotName}-dict-pane.png`) });
    }
  }

  const after = await readPanel(page);
  const buttons = after.buttons;
  return {
    twoPane,
    rowEdit: buttons.some((b) => b.aria.includes('改名') || b.text === '改'),
    rowDelete: buttons.some((b) => b.aria.includes('删除') || b.text === '删'),
    globalRename: /改全局/.test(after.text) || buttons.some((b) => b.text === '改全局'),
    buttons: buttons.map((b) => b.text || b.aria).slice(0, 12),
    preview: after.preview,
  };
}

async function closeGate(page) {
  await page.keyboard.press('Escape');
  await sleep(400);
  const cancel = page.locator('button:has-text("取消")').last();
  if (await cancel.count().catch(() => 0)) {
    await cancel.click({ timeout: 800 }).catch(() => {});
    await sleep(300);
  }
}

const results = [];
function record(site, field, r) {
  const ok = r.twoPane && r.rowEdit && r.rowDelete && r.globalRename;
  results.push({ site, field, ok, ...r });
  const mark = ok ? '✅ 完整链路' : '❌ 能力残缺';
  console.log(
    `${mark} | ${site} · ${field}\n` +
      `     两档条=${r.twoPane} 行内改=${r.rowEdit} 行内删=${r.rowDelete} 改全局=${r.globalRename}\n` +
      `     按钮: ${JSON.stringify(r.buttons)}\n` +
      `     确认层文本: ${(r.preview || '').slice(0, 240)}`,
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1040 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(400);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2600);

  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'networkidle' });
  await sleep(2600);
  await page.screenshot({ path: path.join(OUT, '00-list.png') });

  const row = page.locator('table tbody tr').nth(1); // 第 1 条数据（nth(0) 是 sticky 表头行）
  const cellAt = (i) => row.locator('td').nth(i).locator('.ds-picker-edit-trigger').first();

  // ---- ① 列表 · 分类 ----
  await cellAt(COL.category).click();
  await sleep(900);
  record('产品列表', '分类', await probeGate(page, '01-list-category-gate'));
  await closeGate(page);

  // ---- ② 列表 · 品牌 ----
  await cellAt(COL.brand).click();
  await sleep(900);
  record('产品列表', '品牌', await probeGate(page, '02-list-brand-gate'));
  await closeGate(page);

  // ---- ③ 列表 · 单位/售价/进价（展开价格面板）----
  // 这三列走 skuPrice 槽位（createSkuPriceColumns），可能不是 DisplayCell，故容错跳过
  const unitTd = row.locator('td').nth(COL.unit);
  const unitCell = unitTd.locator('.ds-picker-edit-trigger').first();
  if (await unitCell.count().catch(() => 0)) {
    await unitCell.click().catch((e) => console.log(`⚠ 单位格点击失败: ${e.message}`));
    await sleep(1400);
    await page.screenshot({ path: path.join(OUT, '03-list-unit-panel.png') });
    const panelTitles = await page
      .locator('.ds-picker-edit-trigger')
      .evaluateAll((els) => els.slice(0, 24).map((e) => e.getAttribute('title')))
      .catch(() => []);
    console.log(`\n[价格面板] 可点格子 title: ${JSON.stringify(panelTitles)}`);
    await closeGate(page);
  } else {
    console.log(`\n[价格面板] 单位列（td#${COL.unit}）内无 .ds-picker-edit-trigger，跳过（该列走 skuPrice 槽位）`);
    const tdHtml = await unitTd.innerHTML().catch(() => '');
    console.log(`[价格面板] 单位列 HTML 片段: ${tdHtml.slice(0, 300)}`);
  }

  // ---- ④ 编辑弹窗 · 分类 / 品牌 ----
  const openDlg = async () => {
    const nameCell = row.locator('td').nth(COL.productName);
    const link = nameCell.locator('.ds-picker-edit-trigger, a, [role="button"]').first();
    if (await link.count().catch(() => 0)) await link.click({ timeout: 8000 });
    else await nameCell.click({ timeout: 8000 });
    await sleep(2400);
  };

  const dlg = page.locator('[role="dialog"], .ant-modal, [class*="ds-dialog"]').last();
  await openDlg().catch((e) => console.log(`⚠ 打开编辑弹窗失败: ${e.message}`));
  await page.screenshot({ path: path.join(OUT, '04-edit-dialog.png') });

  // 弹窗容器定位不可靠，直接取全页可点格子并标注其归属容器，便于看清弹窗内有哪些格
  const allTitles = await page
    .locator('.ds-picker-edit-trigger')
    .evaluateAll((els) =>
      els.map((e) => ({
        t: e.getAttribute('title'),
        inDialog: !!e.closest('[role="dialog"], .ant-modal, [class*="ds-dialog"], [class*="modal"]'),
      })),
    )
    .catch(() => []);
  const dlgTitles = allTitles.filter((x) => x.inDialog).map((x) => x.t);
  console.log(`\n[全页] .ds-picker-edit-trigger 共 ${allTitles.length} 个`);
  console.log(`[编辑弹窗] 弹窗内格子 title: ${JSON.stringify(dlgTitles)}`);

  const catVal = (await row.locator('td').nth(COL.category).innerText().catch(() => '')).trim();
  const brandVal = (await row.locator('td').nth(COL.brand).innerText().catch(() => '')).trim();
  console.log(`[编辑弹窗] 目标：分类="${catVal}" 品牌="${brandVal}"`);

  const findAndProbe = async (label, value, shot) => {
    if (!value) return console.log(`⚠ 跳过 ${label}（值为空）`);
    // 弹窗内可能有与列表同值的格子，限定 .ant-modal 作用域并 force 点击，避免被遮罩拦截
    const target = page.locator(`.ant-modal .ds-picker-edit-trigger[title="${value}"]`).first();
    if (!(await target.count().catch(() => 0)))
      return console.log(`⚠ 未找到 ${label} 格（.ant-modal 内 title="${value}"）`);
    // 弹窗内格子被 ant-modal-wrap 遮挡，Playwright 的 click 落点被遮罩吞掉；
    // 直接派发 mousedown（DisplayCell 正是靠 onMouseDown 开确认层），绕过遮挡。
    await target
      .evaluate((el) => {
        el.scrollIntoView({ block: 'center' });
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      })
      .catch((e) => console.log(`⚠ ${label} 格派发失败: ${e.message}`));
    await sleep(1500);
    const panelCount = await page.evaluate(
      () => document.querySelectorAll('[class*="float-panel"], [class*="ds-panel"]').length,
    );
    console.log(`   [调试] ${label} 派发后浮层数=${panelCount}`);
    record('编辑弹窗', label, await probeGate(page, shot));
    await closeGate(page);
  };

  await findAndProbe('分类', catVal, '05-dialog-category-gate');
  await findAndProbe('品牌', brandVal, '06-dialog-brand-gate');

  await browser.close();

  // ---- 汇总 ----
  const bad = results.filter((r) => !r.ok);
  console.log('\n================ 汇总 ================');
  console.log(`检查 ${results.length} 格，完整 ${results.length - bad.length}，残缺 ${bad.length}`);
  if (bad.length) {
    bad.forEach((r) => console.log(`  ❌ ${r.site} · ${r.field}（两档条=${r.twoPane} 改=${r.rowEdit} 删=${r.rowDelete} 改全局=${r.globalRename}）`));
  }
  if (errors.length) {
    console.log(`\n页面错误 ${errors.length} 条:`);
    errors.slice(0, 5).forEach((e) => console.log('  ', e));
  }
  return bad.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('脚本异常:', e);
    process.exit(1);
  });
