/** 进货管货 3 页新章节渲染验证：node e2e_browser/verify_doc_inbound.js */
const { chromium } = require('playwright');
const fs = require('fs');
// 文档站已并入工具台：8124/doc/ 就是原来的文档站根目录（原 8899/8123 两个端口都退役了）
const BASE = process.env.DOC_BASE ?? 'http://localhost:8124/doc';
const OUT = '/tmp/doc-inbound';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await sleep(1500);

  for (const [name, must] of [
    ['授权码', ['生命周期', '创建者留快照', 'decouple', '一次一码']],
    ['访问申请', ['状态三种', '驳回记原因', '审核人留快照', 'approved']],
    ['用户管理', ['档案字段', '状态机', '配置子表跟随', '被引用是外散的']],
  ]) {
    const entry = page.locator(`text=${name}`).first();
    if (!(await entry.count())) { console.log(`[${name}] ✗ 侧栏未找到`); continue; }
    await entry.click();
    await sleep(1500);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const hits = must.filter((k) => body.includes(k));
    console.log(`[${name}] 渲染 ${hits.length}/${must.length} 关键块 ${hits.length === must.length ? '✓' : '✗ 缺:' + must.filter((k) => !body.includes(k)).join('、')}`);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log('[JS 错误]', errors.length ? errors.slice(0, 3).join(' | ') : '无');
  await browser.close();
})();
