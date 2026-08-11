// v14.2 品牌/供应商档案引用交互验证（Playwright）
// 验证：品牌编辑态=输入框+管理下拉按钮；管理面板=改档案名；供应商行=DictRefCell
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const errors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text().slice(0, 200)}`);
    if (msg.type() === 'warning' && /Warning/.test(msg.text())) errors.push(`[console:warning] ${msg.text().slice(0, 200)}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 200)}`));
  page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url().slice(0, 100)} ${req.failure()?.errorText ?? ''}`));

  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 });

  // 产品管理页
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(400);

  // 打开产品编辑弹窗
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);

  const modal = page.locator('.ant-modal');

  // 1. 品牌编辑态：点击编辑按钮 → 出现输入框 + 管理下拉按钮
  const editBtn = modal.locator('.brand-tag-btn-edit').first();
  const editCount = await editBtn.count();
  console.log(`[1] 品牌编辑按钮数量=${editCount}`);
  await editBtn.click();
  await page.waitForTimeout(300);

  const editInput = modal.locator('.brand-tag input, .brand-tag .ant-input').first();
  const inputVisible = await editInput.isVisible().catch(() => false);
  console.log(`[2] 编辑态输入框可见=${inputVisible}`);

  // 管理下拉按钮（编辑态内 DownOutlined）
  const manageBtn = modal.locator('.brand-tag button[title*="管理品牌档案"], .brand-tag .anticon-down').first();
  const manageCount = await manageBtn.count();
  console.log(`[3] 编辑态管理按钮数量=${manageCount}`);

  // 2. 打开品牌管理面板
  if (manageCount > 0) {
    await manageBtn.click();
    await page.waitForTimeout(600);
    // 面板经 smartPopupContainer 挂载到 .ant-modal-wrap（弹窗根容器），非 .ant-modal 内部
    const wrap = page.locator('.ant-modal-wrap');
    const panelVisible = await wrap.locator('text=品牌名称').first().isVisible().catch(() => false);
    const countHeader = await wrap.locator('text=引用数').first().isVisible().catch(() => false);
    console.log(`[4] 品牌管理面板：表头"品牌名称"=${panelVisible}，"引用数"=${countHeader}`);
    // 关闭面板（Esc）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 3. 退出编辑态（点确认按钮）
  const confirmBtn = modal.locator('.brand-tag-btn-edit[title="确认"]').first();
  if (await confirmBtn.count()) await confirmBtn.click().catch(() => {});
  await page.waitForTimeout(300);

  // 4. 打开售价明细 → 进价明细（供应商 DictRefCell）
  const priceCell = modal.locator('[title="点击编辑售价明细"]').first();
  await priceCell.scrollIntoViewIfNeeded().catch(() => {});
  await priceCell.click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  // 切到进价 Tab
  const purchaseTab = modal.getByRole('tab', { name: /进价明细/ });
  const tabCount = await purchaseTab.count();
  console.log(`[5a] 进价明细 Tab 数量=${tabCount}`);
  if (tabCount > 0) {
    await purchaseTab.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // 进价矩阵内的供应商输入（DictRefCell 渲染；nameCell 有值则 value 显示，placeholder 不覆盖）
  const supplierInputs = modal.locator('.ant-table input, .ant-modal input');
  const supplierValCount = await supplierInputs.count();
  const anySupplierInput = await modal.locator('input[placeholder="供应商A"]').count();
  console.log(`[5b] 进价面板输入框总数=${supplierValCount}，placeholder=供应商A 数量=${anySupplierInput}`);
  // 列出前几个输入框的值（确认供应商名称列存在）
  const vals = [];
  for (let i = 0; i < Math.min(supplierValCount, 5); i++) {
    const v = await supplierInputs.nth(i).inputValue().catch(() => '');
    if (v) vals.push(v);
  }
  console.log(`[5c] 前几个输入框值=${JSON.stringify(vals)}`);

  // 5. 关闭弹窗
  await modal.getByRole('button', { name: /取\s*消/ }).click().catch(() => {});
  await page.waitForTimeout(300);

  console.log(`\n===== 控制台报错（共 ${errors.length}） =====`);
  [...new Set(errors)].forEach((e) => console.log(e));
  if (errors.length === 0) console.log('（无报错）');

  await browser.close();
}

main().catch((e) => {
  console.error('脚本异常：', e?.message ?? e);
  process.exit(1);
});
