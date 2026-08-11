// 产品管理页性能诊断 + 控制台报错收集（Playwright，稳健版）
// 用法：node perf.mjs --headless
import { chromium } from 'playwright';

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:8080';
const HEADLESS = process.argv.includes('--headless');
const errors = [];
const slow = [];

const log = (label, ms) => {
  console.log(`${String(ms).padStart(7)}ms  ${label}`);
  if (ms > 1000) slow.push(`${String(ms).padStart(7)}ms  ${label}`);
};

// 每步独立执行，失败不中断整体
async function step(name, fn, timeoutMs = 15000) {
  const t0 = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    log(name, Date.now() - t0);
  } catch (e) {
    log(`${name}（失败: ${String(e?.message ?? e).slice(0, 60)}）`, Date.now() - t0);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 300)}`);
    if (msg.type() === 'warning' && /Warning/.test(msg.text())) errors.push(`[console:warning] ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 300)}`));
  page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.method()} ${req.url().slice(0, 150)} ${req.failure()?.errorText ?? ''}`));

  // ---- 1. 登录 ----
  await step('登录（打开登录页+输入+提交+跳转）', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('请输入用户名').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('Admin@123');
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/staff/**', { timeout: 12000 });
  });

  // ---- 2. 产品管理页首屏 ----
  await step('产品管理页首屏加载', async () => {
    await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=产品全名', { timeout: 10000 });
    await page.waitForTimeout(400);
  });

  // 页面结构快照（帮助定位选择器）
  const rowCount = await page.locator('tbody tr').count().catch(() => 0);
  const colCount = await page.locator('thead th').count().catch(() => 0);
  console.log(`[info] 表格行数=${rowCount} 列数=${colCount}`);

  // ---- 3. 搜索 ----
  await step('搜索输入→列表刷新', async () => {
    const box = page.getByPlaceholder(/搜索/).first();
    await box.fill('PPR');
    await page.waitForTimeout(900); // 防抖300 + 请求 + 渲染
  });

  // ---- 4. 打开产品编辑弹窗 ----
  await step('打开产品编辑弹窗（到加载完成）', async () => {
    const row = page.locator('tbody tr').nth(1);
    await row.locator('td').nth(4).click().catch(() => row.click());
    await page.waitForSelector('.ant-modal', { timeout: 8000 });
    await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(200);
  });

  // ---- 5. 弹窗内规格下拉 ----
  await step('弹窗内打开「规格」下拉', async () => {
    await page.locator('.ant-modal').getByTitle('查看全部规格').click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
  });

  // ---- 6. 弹窗内单位面板 ----
  await step('弹窗内打开「单位」面板', async () => {
    await page.locator('.ant-modal').getByTitle('单位').first().click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
  });

  // ---- 7. 弹窗内售价明细 ----
  await step('弹窗内打开「售价」明细', async () => {
    await page.locator('.ant-modal').getByTitle(/售价明细/).first().click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
  });

  // ---- 8. 编辑品牌输入框 ----
  await step('弹窗内点击「编辑品牌」', async () => {
    await page.locator('.ant-modal .brand-tag-btn-edit').first().click();
    await page.waitForTimeout(250);
  });

  // ---- 9. 关闭弹窗 ----
  await step('关闭弹窗', async () => {
    await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 });
  });

  // ---- 10. 刷新列表 ----
  await step('列表页刷新', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=产品全名', { timeout: 10000 });
    await page.waitForTimeout(400);
  });

  // ---- 输出 ----
  console.log('\n===== 超过 1 秒的交互 =====');
  slow.length ? slow.forEach((l) => console.log(l)) : console.log('（无）');

  console.log(`\n===== 控制台报错（共 ${errors.length} 条，去重后 ${new Set(errors).size}） =====`);
  [...new Set(errors)].forEach((e) => console.log(e));
  if (errors.length === 0) console.log('（无报错）');

  await browser.close();
}

main().catch((e) => {
  console.error('脚本异常：', e?.message ?? e);
  process.exit(1);
});
