// 截取「产品编辑弹窗」当前真实 UI（8080 生产包）：
//   编辑完整视图 + 快速新增视图 → 覆盖 文档可视化/screenshots/product-edit-dialog/
// 登录 admin / Admin@123；路由 /staff/basic/products
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const OUT_DIR = '文档可视化/screenshots/product-edit-dialog';
const DIALOG = '.ant-modal';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(BASE + '/staff/login', { waitUntil: 'networkidle' });
  await sleep(600);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(2200);

  await page.goto(BASE + '/staff/basic/products', { waitUntil: 'networkidle' });
  await sleep(3000);

  // 数据行 = tr.nth(1) 起（nth(0) 是表头行）
  const rows = page.locator('.ds-table-shell .ant-table-tbody tr');
  const total = await rows.count();
  console.log('[tr 总数(含表头)]', total);
  if (total < 2) {
    console.log('[无数据行]');
    await browser.close();
    return;
  }
  const row = rows.nth(1);
  const tdCount = await row.locator('td').count();
  console.log('[数据行 td 数]', tdCount);
  for (let i = 0; i < Math.min(tdCount, 10); i++) {
    let t = '';
    try { t = ((await row.locator('td').nth(i).innerText()) || '').trim().slice(0, 20); } catch { t = '?'; }
    const a = await row.locator('td').nth(i).locator('a').count().catch(() => 0);
    console.log(`[td${i}] "${t}" a=${a}`);
  }

  // 点第一个含 <a> 的 td（NameLinkCell = 产品名）
  let nameLink = null;
  for (let i = 0; i < tdCount; i++) {
    const a = row.locator('td').nth(i).locator('a').first();
    if (await a.count()) { nameLink = a; console.log('[产品名链接在 td' + i + ']'); break; }
  }
  if (!nameLink) {
    console.log('[未找到产品名链接，整页截图存 debug]');
    await page.screenshot({ path: '/tmp/product-list-debug.png' });
    await browser.close();
    return;
  }
  try { await nameLink.scrollIntoViewIfNeeded(); } catch {}
  try { await nameLink.click({ force: true }); } catch (e) { console.log('[点击失败]', e.message); }
  await sleep(2500);

  const modalCount = await page.locator(DIALOG).count();
  const bodyTxt = await page.locator('body').innerText();
  console.log('[ant-modal]', modalCount, '[含编辑产品]', bodyTxt.includes('编辑产品'));
  if (modalCount === 0) {
    console.log('[未打开编辑弹窗]');
    await page.screenshot({ path: '/tmp/product-edit-fail.png' });
    await browser.close();
    return;
  }

  // 编辑完整视图
  try {
    await page.locator(DIALOG).last().screenshot({ path: OUT_DIR + '/edit-current.png' });
  } catch {
    await page.screenshot({ path: OUT_DIR + '/edit-current.png' });
  }
  console.log('[截图] edit-current.png');

  // 重新加载页面（最稳的关弹窗方式），再走快速新增
  await page.goto(BASE + '/staff/basic/products', { waitUntil: 'networkidle' });
  await sleep(2500);

  // 新建产品（快速新增视图）
  const addBtn = page.locator('button:has-text("新建产品")').first();
  if (await addBtn.count()) {
    await addBtn.click();
    await sleep(2200);
    const mc = await page.locator(DIALOG).count();
    if (mc > 0) {
      try {
        await page.locator(DIALOG).last().screenshot({ path: OUT_DIR + '/quick-add.png' });
      } catch {
        await page.screenshot({ path: OUT_DIR + '/quick-add.png' });
      }
      console.log('[截图] quick-add.png');
    } else {
      console.log('[新建产品弹窗未出现]');
    }
  } else {
    console.log('[未找到 新建产品 按钮]');
  }

  await browser.close();
  console.log('完成:', fs.existsSync(OUT_DIR + '/edit-current.png') ? 'edit-current ✓' : 'edit-current ✗',
    fs.existsSync(OUT_DIR + '/quick-add.png') ? 'quick-add ✓' : 'quick-add ✗');
})();
