/**
 * 档案列表：级联筛选布局 / 表头与条件词同步 / 标准下拉只一条 / 确认层字典 ▾
 * 运行：node e2e_browser/verify_archive_filter.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FE = 'http://localhost:8081';
const SHOT = path.join(__dirname, 'screenshots', 'archive_filter');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const fails = [];
function check(name, ok, detail) {
  log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
}

async function dumpCells(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.ant-table-tbody tr.ant-table-row');
    if (!row) return { row: null };
    return {
      cells: [...row.querySelectorAll('td')].map((td, i) => ({
        i,
        text: (td.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        hasTrigger: !!td.querySelector('.ds-picker-edit-trigger'),
      })),
      filtersInThead: document.querySelectorAll('.ant-table-thead .ds-col-filter').length,
    };
  });
}

async function typeHeader(page, filter, text) {
  const box = filter.locator('textarea, input').first();
  await box.click();
  await sleep(150);
  await box.fill(text);
  await sleep(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${FE}/login?role=staff`, { waitUntil: 'networkidle' });
  await sleep(600);
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForURL(/\/staff\//, { timeout: 15000 });

  await page.goto(`${FE}/staff/basic/products`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ant-table-tbody tr.ant-table-row', { timeout: 15000 });
  await sleep(800);
  await page.screenshot({ path: path.join(SHOT, '01-products.png'), fullPage: true });

  const skuRow = page.locator('.ant-table-tbody tr.ant-table-row').filter({
    has: page.locator('.ds-picker-edit-trigger'),
  }).first();
  await skuRow.waitFor({ timeout: 10000 });
  const dump = await skuRow.evaluate((row) => ({
    cells: [...row.querySelectorAll('td')].map((td, i) => ({
      i,
      text: (td.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      hasTrigger: !!td.querySelector('.ds-picker-edit-trigger'),
    })),
    filtersInThead: document.querySelectorAll('.ant-table-thead .ds-col-filter').length,
  }));
  log('DUMP', JSON.stringify(dump));

  const hostCount = await page.locator('.ds-filter-host').count();
  check('没有把条件塞进检索框(.ds-filter-host)', hostCount === 0, `host=${hostCount}`);

  const kw = page.getByPlaceholder('关键词搜索').first();
  check('关键词搜索独立存在', (await kw.count()) > 0);
  const kwBox = await kw.evaluate((el) => ({
    insideSelect: !!el.closest('.ant-select'),
    w: Math.round(el.getBoundingClientRect().width),
  }));
  check('关键词不包状态下拉', !kwBox.insideSelect, JSON.stringify(kwBox));

  const statusSelect = page.locator('.ds-shell-row .ant-select').first();
  check('状态下拉独立存在', (await statusSelect.count()) > 0);
  const st = await statusSelect.evaluate((el) => ({
    text: (el.innerText || '').trim(),
    insideKeyword: !!el.closest('.ant-input-affix-wrapper'),
    w: Math.round(el.getBoundingClientRect().width),
  }));
  check('状态下拉不在关键词输入框内', !st.insideKeyword, JSON.stringify(st));
  check('状态下拉是启用/全部/停用', /启用|全部|停用/.test(st.text), st.text);
  check('初始没有条件词', (await page.locator('.ds-filter-chip').count()) === 0);

  const productFilter = page.locator('.ant-table-thead .ds-col-filter').nth(0);
  check('产品名表头筛选在 thead', await productFilter.count() > 0);

  const prodCell = skuRow.locator('td').nth(4);
  const firstName = ((await prodCell.innerText()) || '').replace(/\s+/g, ' ').trim();
  const typed = (firstName.match(/[A-Za-z0-9\u4e00-\u9fa5]+/) || ['ppr'])[0].slice(0, 3);
  log('表头将输入', typed, '来自行', firstName.slice(0, 30));

  await typeHeader(page, productFilter, typed);
  const opts = page.locator('.float-panel [role="button"]');
  await opts.first().waitFor({ timeout: 5000 }).catch(() => {});
  const optN = await opts.count();
  check('产品下拉有候选', optN > 0, `n=${optN}`);

  let picked = '';
  for (let i = 0; i < optN; i++) {
    const t = ((await opts.nth(i).innerText()) || '').replace(/\s+/g, ' ').trim();
    if (!t || t.includes('新建') || t.includes('无匹配') || t.includes('加载')) continue;
    picked = t.replace(/已有|标准/g, '').trim();
    await opts.nth(i).click();
    break;
  }
  check('点选了一条产品', !!picked, picked);
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOT, '02-picked.png'), fullPage: true });

  const chips = page.locator('.ds-filter-chip');
  check('上面出现条件词', (await chips.count()) > 0, `n=${await chips.count()}`);
  const chipText = ((await chips.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  check('条件词带产品名标签', chipText.includes('产品名'), chipText);
  check('条件词是点选的档案名', !picked || chipText.includes(picked), `picked=${picked} chip=${chipText}`);

  const headerVal = (await productFilter.locator('textarea, input').first().inputValue()) || '';
  check('表头仍留着当前值', headerVal.trim().length > 0, `header="${headerVal}" chip="${chipText}"`);
  check(
    '表头值就是点选的那条',
    !picked || headerVal.trim() === picked || headerVal.includes(picked) || picked.includes(headerVal.trim()),
    `header=${headerVal} picked=${picked}`,
  );

  await productFilter.locator('button').last().click();
  await sleep(500);
  const dropN = await page.locator('.float-panel [role="button"]').count();
  check('标准选中后下拉仍是检索列表', dropN >= 1, `n=${dropN}`);
  await page.screenshot({ path: path.join(SHOT, '03-dropdown.png') });
  await page.keyboard.press('Escape');
  await sleep(250);

  const colInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')];
    const skuRows = rows.filter((r) => !(r.innerText || '').includes('创建新产品'));
    const names = skuRows.map((r) => {
      const td = r.querySelectorAll('td')[4];
      return (td?.innerText || '').replace(/\s+/g, ' ').trim();
    });
    return {
      n: names.length,
      filled: names.filter(Boolean).length,
      first: names[0] || '',
      restEmpty: names.slice(1).every((t) => !t),
    };
  });
  check(
    '标准条件产品名只在第一条显示',
    colInfo.n <= 1 ? colInfo.filled === 1 : colInfo.filled === 1 && colInfo.restEmpty,
    JSON.stringify(colInfo),
  );

  if (await chips.count()) {
    await chips.first().hover();
    await chips.first().locator('[aria-label="清除"]').click({ force: true });
    await sleep(800);
  }
  const headerAfterChipClear = (await productFilter.locator('textarea, input').first().inputValue()) || '';
  check(
    '擦条件词后表头一起清',
    !headerAfterChipClear.trim() && (await chips.count()) === 0,
    `header="${headerAfterChipClear}" chips=${await chips.count()}`,
  );

  await typeHeader(page, productFilter, typed);
  await page.locator('.float-panel [role="button"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  if (await page.locator('.float-panel [role="button"]').count()) {
    await page.locator('.float-panel [role="button"]').first().click();
    await sleep(1000);
  }
  check('再次点选后条件词回来', (await chips.count()) > 0);

  await productFilter.hover();
  await sleep(200);
  const headerClear = productFilter.locator('[aria-label="清除"]');
  if (await headerClear.count()) {
    await headerClear.click({ force: true });
  } else {
    await typeHeader(page, productFilter, '');
    await productFilter.locator('textarea, input').first().press('Tab');
  }
  await sleep(800);
  check('表头清除后条件词也没', (await chips.count()) === 0, `chips=${await chips.count()}`);

  const catTrigger = skuRow.locator('td').nth(2).locator('.ds-picker-edit-trigger');
  check('分类格子可点', (await catTrigger.count()) > 0);
  await catTrigger.click({ force: true });
  await sleep(700);
  const confirmPanel = page.locator('.float-panel').filter({ hasText: '修改分类' }).first();
  check('分类确认层打开', (await confirmPanel.count()) > 0);
  const dictBtn = confirmPanel.locator('.ds-addon-btn');
  check('分类确认层输入旁有 ▾', (await dictBtn.count()) > 0);
  await page.screenshot({ path: path.join(SHOT, '04-category-gate.png') });
  if (await dictBtn.count()) {
    await dictBtn.click();
    await sleep(900);
    const managePanel = page.locator('.float-panel').filter({ hasText: '管理分类' });
    const manageText = await page.locator('body').innerText();
    check(
      '打开分类字典管理',
      (await managePanel.count()) > 0 || manageText.includes('分类名称') || manageText.includes('产品数'),
      (await managePanel.count()) > 0 ? '子槽浮层' : '未见表头',
    );
    await page.screenshot({ path: path.join(SHOT, '05-category-dict.png') });
  }
  await page.keyboard.press('Escape');
  await sleep(350);
  await page.keyboard.press('Escape');
  await sleep(250);

  const specTrigger = skuRow.locator('td').nth(6).locator('.ds-picker-edit-trigger');
  if (await specTrigger.count()) {
    await specTrigger.click({ force: true });
    await sleep(700);
    const specPanel = page.locator('.float-panel').filter({ hasText: '修改规格' }).first();
    const specAddon = specPanel.locator('.ds-addon-btn');
    check('规格确认层没有 ▾', (await specAddon.count()) === 0, `addon=${await specAddon.count()}`);
    await page.screenshot({ path: path.join(SHOT, '06-spec-gate.png') });
    await page.keyboard.press('Escape');
  } else {
    check('规格确认层没有 ▾', false, '没点到规格格子');
  }

  if (errors.length) {
    log('PAGE ERRORS', errors.slice(0, 8));
    fails.push(...errors.slice(0, 3));
  }

  await browser.close();
  if (fails.length) {
    log('\nFAILED', fails);
    process.exit(1);
  }
  log('\narchive filter ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
