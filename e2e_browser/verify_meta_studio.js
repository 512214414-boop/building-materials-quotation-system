/**
 * Meta Studio 界面验证（元模型运行时 · 阶段 F）
 *   打开配置界面 → 选实体 → 确认实体/资源/页面三段渲染 + 截图
 * 用法：META_PORT=8895 node e2e_browser/verify_meta_studio.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const PORT = process.env.META_PORT ?? 8895;
const BASE = `http://localhost:${PORT}`;
const OUT = '/tmp/meta-studio-verify';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/01-loaded.png` });
  console.log('[加载完成] 标题:', await page.title());
  console.log('[状态条]', (await page.locator('#status').innerText().catch(() => '')).trim());

  // 选 supplier
  const sel = page.locator('#entSel');
  const opts = await sel.locator('option').allInnerTexts();
  console.log('[实体下拉]', opts.filter(Boolean).join(' | '));
  await sel.selectOption('supplier');
  await sleep(800);
  await page.screenshot({ path: `${OUT}/02-supplier.png` });

  console.log('[实体元信息]', (await page.locator('#entMeta').innerText().catch(() => '')).trim());
  console.log('[资源接口段]', (await page.locator('#resourceForm').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220));
  console.log('[页面装配段]', (await page.locator('#pageForm').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260));

  console.log('[JS 错误]', errors.length ? errors.slice(0, 3).join(' | ') : '无');
  await browser.close();
  console.log('产物:', fs.readdirSync(OUT).join(', '));
})();
