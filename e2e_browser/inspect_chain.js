/**
 * 全链条 e2e 巡检：复现并验证三类运行时 bug
 * 运行：node e2e_browser/inspect_chain.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const API_BASE = 'http://localhost:3000';
const FE = 'http://localhost:8081';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const log = (...a) => console.log(...a);
const SHOT = path.join(__dirname, 'screenshots', 'chain_inspect');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

async function apiJson(p, o = {}) {
  const r = await fetch(API_BASE + p, o);
  const j = await r.json();
  if (j.code !== 0) throw new Error(`${p} -> ${j.message}`);
  return j.data;
}
function boxOk(box, vw, vh, margin = 2) {
  if (!box) return { ok: false, issues: ['no box'] };
  const issues = [];
  if (box.top < -margin) issues.push(`top=${box.top.toFixed(0)}<0`);
  if (box.bottom > vh + margin) issues.push(`bottom=${box.bottom.toFixed(0)}>${vh}`);
  if (box.left < -margin) issues.push(`left=${box.left.toFixed(0)}<0`);
  if (box.right > vw + margin) issues.push(`right=${box.right.toFixed(0)}>${vw}`);
  return { ok: issues.length === 0, issues };
}

(async () => {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const auth = { Authorization: 'Bearer ' + token };

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('  [console.error]', m.text().slice(0, 220)); });
  page.on('pageerror', (e) => log('  [pageerror]', e.message.slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 500) log(`  [server ${r.status()}]`, r.url().slice(0, 120)); });

  await page.goto(`${FE}/staff/login`, { waitUntil: 'networkidle' }); await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")'); await sleep(1800);
  log('已登录');

  const vw = 1440, vh = 900;
  const results = { modalCenter: null, productEditFloats: [], purchaseInput: null };

  // ============ A. 产品编辑弹窗（产品管理 → 点击产品名） ============
  log('\n===== A. 产品管理 / 产品编辑弹窗 =====');
  await page.goto(`${FE}/staff/basic/products`, { waitUntil: 'networkidle' }); await sleep(2500);
  await page.screenshot({ path: path.join(SHOT, 'A0_list.png') });

  const rowCount = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  log(`产品列表行数: ${rowCount}`);
  const rowIdx = Math.min(1, Math.max(0, rowCount - 1));
  const row = page.locator('.ds-table-shell .ant-table-tbody tr').nth(rowIdx);
  // 列：0 操作, 1 #, 2 分类, 3 图, 4 产品全名
  const nameCell = row.locator('td').nth(4);
  const nameLink = nameCell.locator('a').first();
  log(`row${rowIdx} 产品名: ${await nameCell.textContent().catch(() => 'ERR')}`);
  if (await nameLink.count() > 0) await nameLink.click();
  else await nameCell.click();
  await sleep(3000);

  const modal = page.locator('.ant-modal').first();
  if (await modal.count() > 0) {
    const box = await modal.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const hCenter = Math.abs(cx - vw / 2) < 10;
    const vCenter = Math.abs(cy - vh / 2) < 80; // 允许一定偏移，重点不是"飘出下方"
    results.modalCenter = { x: box.x, y: box.y, w: box.width, h: box.height, cx, cy, hCenter, vCenter };
    log(`产品编辑弹窗: x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)} | 水平居中=${hCenter} 垂直居中=${vCenter}`);
    await page.screenshot({ path: path.join(SHOT, 'A1_dialog.png') });

    // ---- A2 售价展开面板（当前是 antd Popover + UnitPriceExpandPanel） ----
    const priceCell = modal.locator('.price-cell').first();
    if (await priceCell.count() > 0) {
      await priceCell.click({ force: true });
      await sleep(1200);
      await page.screenshot({ path: path.join(SHOT, 'A2_price_popover.png') });
      const popover = page.locator('.ant-popover').last();
      let info = { tag: 'price_popover', found: false };
      if (await popover.count() > 0) {
        const rect = await popover.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
        const vp = boxOk(rect, vw, vh);
        info = { tag: 'price_popover', found: true, visible: await popover.isVisible(), rect, withinViewport: vp };
        log(`  售价展开面板(Popover): visible=${info.visible} rect=${JSON.stringify(rect)} | 视口内=${vp.ok} ${vp.issues.join(';')}`);
      } else {
        log('  售价展开面板未找到');
      }
      results.productEditFloats.push(info);

      // ---- A3 展开面板内价格类型（DictRefField / FloatPanel） ----
      const ptDump = await popover.evaluate((el) => {
        const inputs = Array.from(el.querySelectorAll('input')).map((i) => ({ ph: i.placeholder, cls: i.className, type: i.type }));
        const dict = Array.from(el.querySelectorAll('[class*="dict"], [class*="DictRef"]')).map((d) => d.className.slice(0, 80));
        return { inputs, dict };
      });
      log('  popover 输入框 dump:', JSON.stringify(ptDump));
      const ptSelectors = [
        'input[placeholder*="价格类型"]',
        'input[placeholder*="请选择"]',
        '.dict-ref-field',
        '[class*="dict-ref"]',
        'text=请选择价格类型',
      ];
      let priceTypeTrigger = null;
      for (const sel of ptSelectors) {
        const el = popover.locator(sel).first();
        if (await el.count() > 0) { priceTypeTrigger = el; log(`  选中价格类型选择器: ${sel}`); break; }
      }
      if (priceTypeTrigger) {
        await priceTypeTrigger.click();
        await priceTypeTrigger.evaluate((el) => el.focus());
        await sleep(1200);
        await page.screenshot({ path: path.join(SHOT, 'A3_pricetype_float.png') });
        const fp = page.locator('[class*="float-panel"], [class*="picker-main"], .ant-select-dropdown').last();
        let info2 = { tag: 'priceType_float', found: false };
        if (await fp.count() > 0) {
          const rect = await fp.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
          const vp = boxOk(rect, vw, vh);
          info2 = { tag: 'priceType_float', found: true, visible: await fp.isVisible(), rect, withinViewport: vp };
          log(`  价格类型浮层: visible=${info2.visible} rect=${JSON.stringify(rect)} | 视口内=${vp.ok} ${vp.issues.join(';')}`);
        } else {
          log('  价格类型浮层未找到');
        }
        results.productEditFloats.push(info2);
      }
      await page.mouse.click(5, 5); await sleep(400);
    }

    // ---- A4 产品编辑弹窗内单位列（如果有直接展示的单位下拉） ----
    const unitCell = modal.locator('td').filter({ hasText: /^件$|^个$|^米$/ }).first();
    if (await unitCell.count() > 0) {
      await unitCell.click({ force: true });
      await sleep(1000);
      await page.screenshot({ path: path.join(SHOT, 'A4_unit_float.png') });
      const fp = page.locator('[class*="float-panel"], [class*="picker-main"]').last();
      if (await fp.count() > 0) {
        const rect = await fp.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
        const vp = boxOk(rect, vw, vh);
        results.productEditFloats.push({ tag: 'unit_float', found: true, visible: await fp.isVisible(), rect, withinViewport: vp });
        log(`  单位浮层: visible=${await fp.isVisible()} rect=${JSON.stringify(rect)} | 视口内=${vp.ok}`);
      }
      await page.mouse.click(5, 5); await sleep(400);
    }

    await page.locator('.ant-modal-close').first().click({ force: true, timeout: 5000 }).catch(() => {
      page.keyboard.press('Escape');
    });
    await sleep(800);
  } else {
    log('产品编辑弹窗未打开');
  }

  // ============ B. 采购报价 单元格下拉 ============
  log('\n===== B. 采购报价 单元格下拉 =====');
  const docs = await apiJson('/api/staff/documents?pageSize=20', { headers: auth });
  const list = docs.list || docs || [];
  let docId = Array.isArray(list) && list.length ? list[0].id : null;
  if (!docId) {
    const d = await apiJson('/api/staff/documents', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ title: '巡检单' }) });
    docId = d.id;
  }
  await page.goto(`${FE}/staff/workbench/${docId}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const pqTab = page.locator('nav button:has-text("采购报价"), [role="tab"]:has-text("采购报价")').first();
  if (await pqTab.count() > 0) { await pqTab.click(); await sleep(2500); }
  await page.waitForSelector('.ds-table-shell .ant-table-tbody tr', { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOT, 'B1_purchase.png') });
  const rowCountB = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  log(`采购报价表格行数: ${rowCountB}`);

  const pr = page.locator('.ds-table-shell .ant-table-tbody tr').nth(0);
  if (await pr.count() > 0) {
    // 产品名称/规格列（col0）→ 产品检索面板，应有搜索输入
    const prodCell = pr.locator('td').nth(0);
    // 直接点单元格里的输入框/触发器，不要点整个 td（会触发行右键菜单）
    const inp0 = prodCell.locator('input').first();
    const down0 = prodCell.locator('.anticon-down, [class*="dropdown"], .ant-select-arrow').first();
    if (await inp0.count() > 0) {
      await inp0.click();
      await inp0.evaluate((el) => el.focus());
    } else if (await down0.count() > 0) {
      await down0.click();
    } else {
      await prodCell.click();
    }
    await sleep(1200);
    await page.screenshot({ path: path.join(SHOT, 'B2_product_picker.png') });
    const fp = page.locator('[class*="float-panel"], [class*="picker-main"]').last();
    if (await fp.count() > 0) {
      const rect = await fp.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
      const vp = boxOk(rect, vw, vh);
      // 搜索输入可能在单元格里，也可能在面板里
      const cellInput = prodCell.locator('input').first();
      const panelInput = fp.locator('input').first();
      let canInput = 'no-input', inputEl = null;
      if (await cellInput.count() > 0) { inputEl = cellInput; }
      else if (await panelInput.count() > 0) { inputEl = panelInput; }
      if (inputEl) {
        try { await inputEl.click({ force: true }); await inputEl.fill('采购测试'); canInput = (await inputEl.inputValue()).includes('采购测试'); } catch (e) { canInput = false; }
      }
      results.purchaseInput = { col: 0, visible: await fp.isVisible(), rect, withinViewport: vp, canInput };
      log(`采购报价 产品列: visible=${await fp.isVisible()} rect=${JSON.stringify(rect)} | 视口内=${vp.ok} 可输入=${canInput}`);
      await page.mouse.click(5, 5); await sleep(400);
    }
  }

  await browser.close();
  log('\n===== 巡检结果汇总 =====');
  log(JSON.stringify(results, null, 2));
  const pass = results.modalCenter && results.modalCenter.hCenter && results.modalCenter.vCenter
    && results.productEditFloats.every((f) => f.found && f.visible && f.withinViewport.ok)
    && results.purchaseInput && results.purchaseInput.visible && results.purchaseInput.withinViewport.ok && results.purchaseInput.canInput !== false;
  log('\n全链条判定:', pass ? 'PASS ✅' : 'FAIL ❌');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
