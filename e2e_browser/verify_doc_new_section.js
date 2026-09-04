/**
 * 文档可视化 · 新章节渲染验证（登记表填写口径）
 * 用法：node e2e_browser/verify_doc_new_section.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8899';
const OUT = '/tmp/doc-new-section';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await sleep(1500);

  // 侧栏找「登记表填写口径」
  const entry = page.locator('text=登记表填写口径').first();
  const found = await entry.count();
  console.log('[侧栏入口]', found ? '已找到' : '未找到');
  if (found) {
    await entry.click();
    await sleep(1800);
    await page.screenshot({ path: `${OUT}/meta-schema-section.png`, fullPage: false });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log('[标题]', body.slice(0, 90));
    console.log('[含三段填空表]', /三段填空/.test(body) ? '✓' : '✗');
    console.log('[含踩过的坑表]', /踩过的坑/.test(body) ? '✓' : '✗');
    console.log('[含 businessScope 坑说明]', /businessScope/.test(body) ? '✓' : '✗');
    console.log('[含自检规则]', /check-docs\.mjs/.test(body) ? '✓' : '✗');
  }

  console.log('[JS 错误]', errors.length ? errors.slice(0, 3).join(' | ') : '无');
  await browser.close();
})();
