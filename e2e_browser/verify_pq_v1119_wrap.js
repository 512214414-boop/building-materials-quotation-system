// 验证 v11.19：采购报价产品列「固定宽度 + 内容超出自动换行」
const { chromium } = require('playwright');
const API = 'http://localhost:3000';
const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const r = await fetch(`${API}/api/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  return (await r.json()).data.token;
}
async function findDoc(token) {
  const r = await fetch(`${API}/api/staff/documents?page=1&pageSize=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = (await r.json()).data.list || [];
  return list.find((d) => d.title === '生产冒烟验证') || list[0];
}

const CELL0 = '.ds-table-shell [data-cell-row="0"][data-cell-col="0"]';
const longName = '伟星PPR热水管DN25管材管件给水管道配件白色加厚冷热通用家装建材批发';
const result = {};

(async () => {
  const token = await login();
  const doc = await findDoc(token);
  console.log('文档:', doc ? `${doc.title} (${doc.id})` : '未找到');
  if (!doc) return;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));
  try {
    await page.goto(`${BASE}/staff/login`, { waitUntil: 'networkidle' });
    await sleep(700);
    await page.fill('input[placeholder="请输入用户名"]', 'admin');
    await page.fill('input[placeholder="请输入密码"]', 'Admin@123');
    await page.click('button:has-text("登 录")');
    await sleep(1800);
    await page.goto(`${BASE}/staff/workbench/${doc.id}`, { waitUntil: 'networkidle' });
    await sleep(2200);
    for (let i = 0; i < 20; i++) {
      if ((await page.locator(CELL0).count()) > 0) break;
      await sleep(400);
    }

    // 注入超长产品名 → 测量换行/列宽/行高
    const m = await page.locator(CELL0).first().evaluate((el, ln) => {
      const td = el.closest('td');
      const tr = td.parentElement;
      const span = el.querySelector('span');
      const original = span.textContent;
      const origRowH = tr.getBoundingClientRect().height;
      const origTdW = td.getBoundingClientRect().width;
      const origSpanScrollW = span.scrollWidth;
      // 注入超长文本
      span.textContent = ln;
      void td.offsetHeight;
      const cs = getComputedStyle(span);
      const rowH = tr.getBoundingClientRect().height;
      const tdW = td.getBoundingClientRect().width;
      const spanScrollW = span.scrollWidth;
      const spanClientW = span.clientWidth;
      // 是否真正换行：span 内容宽度是否被约束在 td 内且行高增高
      const wrapped = rowH > origRowH + 2 && spanScrollW <= tdW + 2;
      // 恢复
      span.textContent = original;
      return {
        colW_locked: Number(tdW.toFixed(1)),
        origColW: Number(origTdW.toFixed(1)),
        whiteSpace: cs.whiteSpace,
        wordBreak: cs.wordBreak,
        rowH_before: Number(origRowH.toFixed(1)),
        rowH_after_long: Number(rowH.toFixed(1)),
        spanContentW: spanScrollW,
        cellW: spanClientW,
        wrapped: wrapped,
        textFullyVisible: wrapped,
      };
    }, longName);
    console.log('== 产品列超长内容行为 ==');
    console.log(JSON.stringify(m, null, 2));

    // 编辑态：列宽是否仍锁定 + input 铺满
    await page.locator(`${CELL0} span:visible`).first().click();
    await sleep(700);
    const edit = await page.locator(CELL0).first().evaluate((el) => {
      const td = el.closest('td');
      const input = el.querySelector('input');
      return {
        tdW: Number(td.getBoundingClientRect().width.toFixed(1)),
        inputW: input ? Number(input.getBoundingClientRect().width.toFixed(1)) : null,
      };
    });
    console.log('== 编辑态 ==', JSON.stringify(edit));

    const ok = m.wrapped && m.colW_locked === m.origColW && edit.tdW === m.origColW;
    console.log(`\n${ok ? '✓ 通过' : '✗ 未通过'}：列宽锁定 ${m.origColW}px、超长${longName.length}字自动换行、行高 ${m.rowH_before}→${m.rowH_after_long}px、编辑态列宽 ${edit.tdW}px input ${edit.inputW}px`);
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('异常:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
