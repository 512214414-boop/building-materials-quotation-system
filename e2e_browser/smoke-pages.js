/**
 * G3 冒烟 · 全页面回归（生产版 8080）
 *
 * 相对旧 verify_pages_8080.js 的三处关键改进 —— 旧版是「不会失败的门禁」：
 *   1. 路由来源：消费 tools/gen-routes.mjs 从 menu.config.ts 派生的
 *      routes.generated.json，不再硬编码 URL。
 *      （旧版 15 个 URL 全部过期 → 全部回落默认页 → 全绿但零验证。）
 *   2. 断言更强：除「无 JS/console 错误 + 非白屏」外，还断言
 *      落地 URL 未被重定向走 —— 专门防「回落默认页」式假绿。
 *   3. 真的会失败：任一页面不过即汇总并以退出码 1 结束，可被门禁 runner 判定。
 *
 * 只读：不创建、不修改任何业务数据，可安全反复运行。
 *
 * 用法：node e2e_browser/smoke-pages.js   （可设 SMOKE_BASE 换端口）
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.SMOKE_BASE || 'http://localhost:8080';
const ROUTES_FILE = path.join(__dirname, 'routes.generated.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${BASE}/staff/login`, { waitUntil: 'networkidle' });
  await sleep(400);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2500);
}

(async () => {
  if (!fs.existsSync(ROUTES_FILE)) {
    console.error('✗ 缺少 routes.generated.json，请先运行：node tools/gen-routes.mjs');
    process.exit(2);
  }
  const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e.message).slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 160)}`);
  });

  await login(page);

  /** 访问单页并判定；needRelogin 表示「被踢回登录页」（会话问题，非页面缺陷） */
  async function checkRoute(r) {
    errors = [];
    try {
      const resp = await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(1800);
      const landed = new URL(page.url()).pathname;
      const info = await page.evaluate(() => {
        const root = document.querySelector('#root');
        return {
          len: document.body ? document.body.innerText.trim().length : 0,
          mounted: !!root && !!root.firstElementChild,
        };
      });
      const status = resp ? resp.status() : 0;

      if (Math.floor(status / 100) !== 2) return { ok: false, detail: `HTTP ${status}` };
      // 会话过期会把页面踢回登录页。这是环境问题不是页面缺陷，交由调用方重新登录后重试。
      // （真失效的路由重试后依旧会红，不会被重试掩盖。）
      if (landed.startsWith('/login')) return { ok: false, detail: `被重定向到 ${landed}`, needRelogin: true };
      if (landed !== r) return { ok: false, detail: `被重定向到 ${landed}（路由可能已失效）` };
      if (!info.mounted) return { ok: false, detail: '外壳未挂载（疑似白屏）' };
      if (info.len < 100) return { ok: false, detail: `内容过少 body=${info.len}` };
      if (errors.length) return { ok: false, detail: errors.slice(0, 3).join(' | ') };
      return { ok: true, detail: `body=${info.len}` };
    } catch (e) {
      return { ok: false, detail: `异常：${String(e.message).slice(0, 140)}` };
    }
  }

  const results = [];
  console.log(`=== 全页面冒烟（${routes.length} 页，base=${BASE}）===`);
  for (const r of routes) {
    let res = await checkRoute(r);
    // 只对「会话过期被踢回登录页」重试一次；其它失败一律不重试，
    // 否则重试会变成掩盖真问题的工具（本项目已被假绿坑过多次）。
    if (!res.ok && res.needRelogin) {
      await login(page);
      res = await checkRoute(r);
    }
    results.push({ route: r, ok: res.ok, detail: res.detail });
    console.log(`${res.ok ? '✓' : '✗'} ${r}${res.detail ? ` — ${res.detail}` : ''}`);
  }
  await browser.close();

  const failed = results.filter((x) => !x.ok);
  console.log(`\n冒烟汇总：共 ${results.length} 页，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) {
    console.log('失败明细：');
    for (const f of failed) console.log(`  - ${f.route}：${f.detail}`);
    process.exit(1);
  }
  console.log('全部页面通过：无 JS/console 错误、无白屏、无路由回落');
  process.exit(0);
})();
