// 弹窗内进价面板供应商输入框测试
import { chromium } from 'playwright';

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:8080';
const errors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });

  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  // 打开编辑弹窗
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  const modal = page.locator('.ant-modal');

  // 单位区：找"进价明细"展开入口（单位行内有 售价/进价 按钮）
  const purchaseBtn = modal.locator('[title*="进价明细"], [title*="编辑进价"]').first();
  const pbCount = await purchaseBtn.count();
  console.log(`[info] 弹窗内进价明细入口=${pbCount}`);
  if (pbCount > 0) {
    await purchaseBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
  } else {
    // 可能单位行需要先展开
    const unitRow = modal.locator('.unit-row, .unit-section-row').first();
    await unitRow.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const purchaseBtn2 = modal.locator('[title*="进价明细"]').first();
    if (await purchaseBtn2.count()) {
      await purchaseBtn2.click({ force: true }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }

  // dump 可见 input
  const allInputs = page.locator('.ant-modal-wrap input');
  const vis = [];
  const n = await allInputs.count();
  for (let i = 0; i < n; i++) {
    const ok = await allInputs.nth(i).isVisible().catch(() => false);
    if (!ok) continue;
    const ph = await allInputs.nth(i).getAttribute('placeholder').catch(() => '');
    const v = await allInputs.nth(i).inputValue().catch(() => '');
    vis.push({ i, ph: ph ?? '', v: v ?? '' });
  }
  console.log(`[info] 弹窗内可见 input=${JSON.stringify(vis.slice(0, 15))}`);

  // 测供应商输入框（value 非空且非价格/单位的）
  let targetIdx = -1;
  for (let i = 0; i < vis.length; i++) {
    const it = vis[i];
    if (it.v && it.v !== '0.00' && it.ph !== '0.00' && it.ph !== '输入单位名' && !it.ph.includes('搜索') && !it.ph.includes('备注')) {
      targetIdx = it.i;
      break;
    }
  }
  if (targetIdx >= 0) {
    const t = allInputs.nth(targetIdx);
    await t.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const focused = await t.evaluate((el) => el === document.activeElement).catch(() => false);
    console.log(`[info] 弹窗供应商输入框点击聚焦=${focused}`);
    if (focused) {
      await t.fill('临时测试名').catch(() => {});
      await page.waitForTimeout(300);
      const v2 = await t.inputValue().catch(() => '');
      console.log(`[info] 输入后值=${v2}`);
      // 还原
      await t.fill('面价渠道').catch(() => {});
    } else {
      console.log('[info] 点击未聚焦！');
    }
  } else {
    console.log('[info] 弹窗内未找到供应商输入框');
  }

  console.log(`\n===== 控制台报错（共 ${errors.length}） =====`);
  [...new Set(errors)].forEach((e) => console.log(e));
  if (errors.length === 0) console.log('（无报错）');
  await browser.close();
}

main().catch((e) => {
  console.error('异常：', e?.message ?? e);
  process.exit(1);
});
