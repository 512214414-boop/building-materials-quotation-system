/**
 * 范式检索灰度验证（SKU_RECALL_NORMALIZED=1 已开启）：
 *   产品管理列表 / 关键词搜索 / 编辑弹窗展示字段（单位·价格） 三处截图核对。
 * 用法：node e2e_browser/verify_normalized_recall.js
 * 产物：/tmp/normalized-verify/*.png
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const OUT = '/tmp/normalized-verify';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  // 登录
  await page.goto(BASE + '/staff/login', { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2200);

  // 产品管理
  await page.goto(BASE + '/staff/basic/products', { waitUntil: 'networkidle' });
  await sleep(3000);
  await page.screenshot({ path: `${OUT}/01-list-default.png` });

  const rowCount = await page.locator('.ds-table-shell .ant-table-tbody tr').count();
  console.log('[列表 tr 数(含表头)]', rowCount);

  // 找搜索框
  const candidates = [
    'input[placeholder="关键词搜索"]',
    'input[placeholder*="搜索"]',
    'input[placeholder*="检索"]',
  ];
  let searchBox = null;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.count()) { searchBox = loc; console.log('[搜索框命中]', sel); break; }
  }
  if (!searchBox) {
    const any = page.locator('input[type="text"], input:not([type])').first();
    if (await any.count()) { searchBox = any; console.log('[搜索框兜底] 第一个文本 input'); }
  }

  if (searchBox) {
    // 中文长词
    await searchBox.fill('给水管');
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/02-search-chinese.png` });
    const firstRow = await page.locator('.ds-table-shell .ant-table-tbody tr').nth(1).innerText().catch(() => '');
    console.log('[搜索 给水管] 首行:', firstRow.replace(/\s+/g, ' ').slice(0, 120));

    // 短词（走 LIKE 降级）
    await searchBox.fill('ppr');
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/03-search-short.png` });
    console.log('[搜索 ppr] 完成');

    // 品牌名
    await searchBox.fill('伟星');
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/04-search-brand.png` });
    console.log('[搜索 伟星] 完成');
  } else {
    console.log('[未找到搜索框]');
  }

  // 打开编辑弹窗（点第一行产品名链接）验证展示字段
  const rows = page.locator('.ds-table-shell .ant-table-tbody tr');
  const total = await rows.count();
  if (total >= 2) {
    const row = rows.nth(1);
    const tdCount = await row.locator('td').count();
    let opened = false;
    for (let i = 0; i < Math.min(tdCount, 8); i++) {
      const a = row.locator('td').nth(i).locator('a').first();
      if (await a.count()) {
        try { await a.click(); } catch {}
        await sleep(2200);
        if (await page.locator('.ant-modal').count()) { opened = true; console.log('[编辑弹窗在 td' + i + ' 打开]'); break; }
      }
    }
    if (opened) {
      await page.locator('.ant-modal').last().screenshot({ path: `${OUT}/05-edit-dialog.png` });
      const unitText = await page.locator('.ant-modal').last().innerText().catch(() => '');
      console.log('[弹窗文本片段]', unitText.replace(/\s+/g, ' ').slice(0, 200));
    } else {
      console.log('[编辑弹窗未打开]');
    }
  }

  await browser.close();
  console.log('产物:', fs.readdirSync(OUT).join(', '));
})();
