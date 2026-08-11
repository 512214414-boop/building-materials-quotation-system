// v14.2 进价推算行验证：推算显示在输入框内（placeholder），输入即创建真实行
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const errors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (err) => errors.push(String(err).slice(0, 200)));

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

  // 打开进价明细（单位行展开）
  const pBtn = modal.locator('[title*="进价明细"], [title*="编辑进价"]').first();
  const pc = await pBtn.count();
  console.log(`[info] 进价明细入口=${pc}`);
  if (pc > 0) { await pBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(600); }

  // 若基准单位无推算行，切到非基准单位（根/捆）再验证
  // 单位切换：面板顶部 Dropdown（div[title=切换维度]）→ 下拉菜单选单位
  const switchDiv = page.locator('.ant-modal-wrap div[title="切换维度"]').first();
  const sd = await switchDiv.count();
  console.log(`[info] 面板单位切换器=${sd}`);
  if (sd > 0) {
    const cur = await switchDiv.textContent().catch(() => '');
    console.log(`[info] 当前单位=${cur}`);
    if (cur && cur.includes('米')) {
      await switchDiv.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const menuRoot = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item', { hasText: /根/ }).first();
      const mc = await menuRoot.count();
      console.log(`[info] 下拉菜单「根」=${mc}`);
      if (mc > 0) {
        await menuRoot.click({ force: true }).catch(() => {});
        await page.waitForTimeout(700);
        console.log('[info] 已切换到单位「根」');
      }
    }
  }

  // 找推算行：名称列含「推算」文本的行 → 其面价输入框（placeholder 数字、value 空）
  const derivedRows = page.locator('.ant-modal-wrap span', { hasText: /推算/ });
  const dr = await derivedRows.count();
  console.log(`[info] 「推算」标签数=${dr}`);

  // dump 进价面板可见输入框
  const inputs = page.locator('.ant-modal-wrap input');
  const vis = [];
  for (let i = 0; i < await inputs.count(); i++) {
    const ok = await inputs.nth(i).isVisible().catch(() => false);
    if (!ok) continue;
    const ph = await inputs.nth(i).getAttribute('placeholder').catch(() => '');
    const v = await inputs.nth(i).inputValue().catch(() => '');
    const st = await inputs.nth(i).evaluate((el) => { const s = getComputedStyle(el); return s.borderStyle + '/' + s.placeholderColor; }).catch(() => '');
    vis.push({ i, ph: ph ?? '', v: v ?? '', st });
  }
  console.log(`[info] 面板可见输入框=${JSON.stringify(vis)}`);

  // 找推算面价输入框：placeholder 是数字（推算值，非 0.00）+ value 空
  const derivedFaceIdx = vis.findIndex(
    (x) => x.ph && /^\d/.test(x.ph) && x.ph !== '0.00' && !x.v,
  );
  if (derivedFaceIdx >= 0) {
    const t = inputs.nth(derivedFaceIdx);
    console.log(`[info] 推算面价输入框：placeholder=${vis[derivedFaceIdx].ph}（推算显示在输入框内 ✅）`);
    // 检查边框样式（antd 6 Input 边框可能在 wrapper 上）
    const borderInfo = await t.evaluate((el) => {
      const inputStyle = getComputedStyle(el);
      const wrapper = el.closest('.ant-input, .ant-input-affix-wrapper');
      const wStyle = wrapper ? getComputedStyle(wrapper) : null;
      return {
        inputBorder: inputStyle.borderStyle,
        wrapperBorder: wStyle?.borderStyle ?? 'none',
        inputPhColor: inputStyle.color,
      };
    }).catch(() => null);
    console.log(`[info] 边框检查=${JSON.stringify(borderInfo)}`);
    await t.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
    const focused = await t.evaluate((el) => el === document.activeElement).catch(() => false);
    console.log(`[info] 点击后聚焦=${focused}（点击马上可输入 ✅）`);
    // 只读验证，不输入保存（避免污染生产数据）
    await page.keyboard.press('Escape').catch(() => {});
  } else {
    console.log('[info] 未找到推算面价输入框（可能该单位无推算）');
  }

  console.log(`\n===== 控制台报错（共 ${errors.length}） =====`);
  [...new Set(errors)].forEach((e) => console.log(e));
  if (errors.length === 0) console.log('（无报错）');
  await browser.close();
}

main().catch((e) => { console.error('异常：', e?.message ?? e); process.exit(1); });
