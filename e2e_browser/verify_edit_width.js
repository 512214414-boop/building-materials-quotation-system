/**
 * v11.18+ 编辑态宽度量化验证（生产版 8080）：
 * 对比：文本态文字范围 / 自由编辑态 input / 激活态（点箭头）input / td 全宽
 */
const { chromium } = require('playwright');
const API_BASE = 'http://localhost:3000';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function apiJson(p, o = {}) { const r = await fetch(API_BASE + p, o); return r.json(); }
async function login(browser, viewport) {
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).data.token;
  const page = await browser.newPage({ viewport });
  await page.goto('http://localhost:8080/staff/login', { waitUntil: 'networkidle' });
  await sleep(500);
  await page.fill('input[placeholder="请输入用户名"]', 'admin');
  await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
  await page.click('button:has-text("登 录")');
  await sleep(1800);
  return { page, token };
}
async function openPurchaseQuote(page) {
  await page.locator('button:has-text("订单协同工作台")').first().click();
  await sleep(2000);
  const docLink = page.locator('a').filter({ hasText: '生产冒烟验证' }).first();
  if (await docLink.count() > 0) await docLink.click();
  await sleep(2000);
  const tabs = page.locator('nav button, [role="tab"], .ds-viewtab button');
  for (let i = 0; i < await tabs.count(); i++) {
    const t = ((await tabs.nth(i).innerText()) || '').trim();
    if (t.includes('采购报价')) { await tabs.nth(i).click(); break; }
  }
  await sleep(1800);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const { page } = await login(browser, { width: 1440, height: 900 });
  await openPurchaseQuote(page);
  const r0 = page.locator('.ds-table-shell .ant-table-tbody tr').first();
  const prodCell = r0.locator('td').nth(2);

  // 文本态：td 全宽 + 文本 span 范围
  const textState = await page.evaluate(() => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    const span = td ? td.querySelector('span') : null;
    const tdR = td ? td.getBoundingClientRect() : null;
    const sR = span ? span.getBoundingClientRect() : null;
    return {
      td: tdR ? `${Math.round(tdR.x)}~${Math.round(tdR.x + tdR.width)} (w=${Math.round(tdR.width)})` : null,
      textSpan: sR ? `${Math.round(sR.x)}~${Math.round(sR.x + sR.width)} (w=${Math.round(sR.width)})` : null,
    };
  });
  console.log('[文本态]', JSON.stringify(textState));

  // 自由编辑态
  await prodCell.click();
  await sleep(600);
  const editState = await page.evaluate(() => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    const input = td ? td.querySelector('input') : null;
    const tdR = td ? td.getBoundingClientRect() : null;
    const iR = input ? input.getBoundingClientRect() : null;
    return {
      td: tdR ? `${Math.round(tdR.x)}~${Math.round(tdR.x + tdR.width)} (w=${Math.round(tdR.width)})` : null,
      input: iR ? `${Math.round(iR.x)}~${Math.round(iR.x + iR.width)} (w=${Math.round(iR.width)})` : null,
      inputPad: input ? getComputedStyle(input).padding : null,
      inputBorder: input ? getComputedStyle(input).borderWidth : null,
    };
  });
  console.log('[自由编辑态]', JSON.stringify(editState));

  // 激活态（点箭头展开面板）
  const arrow = prodCell.locator('.anticon-down').first();
  if (await arrow.count() > 0) await arrow.click();
  await sleep(800);
  const activeState = await page.evaluate(() => {
    const td = document.querySelectorAll('.ds-table-shell .ant-table-tbody tr td')[2];
    const input = td ? td.querySelector('input') : null;
    const wrapper = td ? td.querySelector('.ant-input-affix-wrapper, .ant-input') : null;
    const tdR = td ? td.getBoundingClientRect() : null;
    const iR = input ? input.getBoundingClientRect() : null;
    const wR = wrapper ? wrapper.getBoundingClientRect() : null;
    const panel = document.querySelector('.float-panel');
    return {
      td: tdR ? `w=${Math.round(tdR.width)}` : null,
      input: iR ? `w=${Math.round(iR.width)}` : null,
      wrapper: wR ? `x=${Math.round(wR.x)} w=${Math.round(wR.width)}` : null,
      wrapperPad: wrapper ? getComputedStyle(wrapper).padding : null,
      panel: panel ? `x=${Math.round(panel.getBoundingClientRect().x)} w=${Math.round(panel.getBoundingClientRect().width)}` : null,
    };
  });
  console.log('[激活态]', JSON.stringify(activeState));

  await browser.close();
})();
