/**
 * 画布舞台 + 叠加层验收：50/100/150% 下走选品、确认层、弹窗、滑动不关、点空白关。
 * 运行：node e2e_browser/verify_canvas_stage.js
 */
const { chromium, webkit } = require('playwright');
const path = require('path');
const fs = require('fs');

const FE = process.env.BASE_URL || 'http://127.0.0.1:8081';
const API = process.env.API_BASE || 'http://127.0.0.1:3000';
const SHOT = path.join(__dirname, 'screenshots', 'canvas_stage');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API}${pathname}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${pathname}: ${JSON.stringify(data)}`);
  return data.data;
}

async function uiLogin(page) {
  await page.goto(`${FE}/login?role=staff`, { waitUntil: 'networkidle' });
  await sleep(400);
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登/ }).click();
  await page.waitForURL(/\/staff\//, { timeout: 20000 });
  await page.waitForSelector('.ds-canvas-stage', { state: 'attached', timeout: 20000 });
}

  async function setZoomViaUi(page, label) {
  const want = parseInt(label, 10) / 100;
  let guard = 0;
  while (guard < 24) {
    const now = parseFloat((await page.locator('.ds-canvas-stage').getAttribute('data-shell-zoom')) || '1');
    if (Math.abs(now - want) < 0.01) break;
    const zoomOut = now > want;
    await page.evaluate((out) => {
      window.dispatchEvent(new WheelEvent('wheel', {
        deltaY: out ? 120 : -120,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    }, zoomOut);
    await page.waitForFunction(
      (prev) => Number(document.querySelector('.ds-canvas-stage')?.getAttribute('data-shell-zoom')) !== prev,
      now,
      { timeout: 800 },
    ).catch(() => {});
    guard += 1;
  }
}

function snapshotStage() {
  const stage = document.querySelector('.ds-canvas-stage');
  const shell = document.querySelector('.ds-app-shell');
  const overlay = document.querySelector('.ds-overlay-root');
  const floatL = document.querySelector('[data-overlay-layer="float"]');
  const modalL = document.querySelector('[data-overlay-layer="modal"]');
  const controls = document.querySelector('.ds-zoom-controls');
  const panel = document.querySelector('.float-panel');
  const modal = document.querySelector('.ant-modal');
  const z = stage && stage.offsetWidth ? stage.getBoundingClientRect().width / stage.offsetWidth : 1;
  const stageR = stage ? stage.getBoundingClientRect() : null;
  const panelR = panel ? panel.getBoundingClientRect() : null;
  const modalR = modal ? modal.getBoundingClientRect() : null;
  const ctrlR = controls ? controls.getBoundingClientRect() : null;
  return {
    hasStage: !!stage,
    hasOverlay: !!overlay,
    overlayInStage: !!(stage && overlay && stage.contains(overlay)),
    shellInStage: !!(stage && shell && stage.contains(shell)),
    controlsOut: !!(controls && stage && !stage.contains(controls)),
    stageZoomCss: stage ? String(getComputedStyle(stage).zoom) : null,
    shellZoomCss: shell ? String(getComputedStyle(shell).zoom) : null,
    panelZoomCss: panel ? String(getComputedStyle(panel).zoom) : null,
    modalZoomCss: modal ? String(getComputedStyle(modal).zoom) : null,
    z,
    stageW: stageR ? Math.round(stageR.width) : 0,
    stageLeft: stageR ? Math.round(stageR.left) : 0,
    stageRight: stageR ? Math.round(stageR.right) : 0,
    panelOpen: !!panel,
    panelInFloat: !!(floatL && panel && floatL.contains(panel)),
    panelCount: document.querySelectorAll('.float-panel').length,
    panelW: panelR ? Math.round(panelR.width) : 0,
    panelLeft: panelR ? Math.round(panelR.left) : 0,
    panelRight: panelR ? Math.round(panelR.right) : 0,
    layoutLeft: panel ? parseFloat(panel.style.left) : null,
    ctrlH: ctrlR ? Math.round(ctrlR.height) : 0,
    modalOpen: !!modal,
    modalInLayer: !!(modalL && modal && modalL.contains(modal)),
    modalDx:
      modalR && stageR
        ? Math.round(Math.abs(modalR.left + modalR.width / 2 - (stageR.left + stageR.width / 2)))
        : null,
    modalDy:
      modalR && stageR
        ? Math.round(Math.abs(modalR.top + modalR.height / 2 - (stageR.top + stageR.height / 2)))
        : null,
    dropdownInOverlay: !!document.querySelector(
      '.ds-overlay-root .ant-select-dropdown, .ds-overlay-root .ant-popover, .ds-overlay-root .ds-suggest-dropdown',
    ),
  };
}

async function runOn(browserType, name) {
  console.log(`\n=== ${name} ===`);
  const token = (
    await apiJson('/api/auth/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
    })
  ).token;
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const created = await apiJson('/api/staff/documents', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ title: '舞台叠加层验收单' }),
  });
  const docId = created.id;

  const browser = await browserType.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })).newPage();
  page.on('pageerror', (e) => console.log('  [页面错误]', e.message));

  await uiLogin(page);
  const prefix = `${name}:`;

  let s = await page.evaluate(snapshotStage);
  record(`${prefix}舞台/叠加层 DOM`, s.hasStage && s.hasOverlay && s.overlayInStage && s.shellInStage, JSON.stringify({
    hasStage: s.hasStage, overlayInStage: s.overlayInStage, shellInStage: s.shellInStage,
  }));
  const shellNotZoomed = s.shellZoomCss === '1' || s.shellZoomCss === 'normal';
  record(`${prefix}zoom 只打舞台`, (s.stageZoomCss === '1' || s.stageZoomCss === 'normal') && shellNotZoomed,
    `stage=${s.stageZoomCss} shell=${s.shellZoomCss}`);
  record(`${prefix}缩放控件在舞台外`, s.controlsOut, '');
  const ctrlH100 = s.ctrlH;

  await page.goto(`${FE}/staff/workbench/${docId}?view=PurchaseQuote`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ds-canvas-stage', { timeout: 20000 });
  await sleep(1500);
  const pq = page.locator('button:has-text("采购报价")');
  if (await pq.count()) {
    await pq.first().click();
    await sleep(600);
  }

  const arrow = page.locator('.ant-table-tbody button[title="展开选择"]').first();
  const hasArrow = await arrow.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!hasArrow) {
    await page.screenshot({ path: path.join(SHOT, `${name}_workbench_miss.png`) });
  }
  record(`${prefix}找到开单选品下拉`, hasArrow, '');
  if (hasArrow) {
    await arrow.click();
    await sleep(400);
    const cellInput = page.locator('.ant-table-tbody textarea').first();
    if (await cellInput.count()) {
      await cellInput.fill('ppr');
      await sleep(900);
    }
    await page.screenshot({ path: path.join(SHOT, `${name}_picker.png`) });
    s = await page.evaluate(snapshotStage);
    record(`${prefix}选品挂 float 层`, s.panelInFloat, `count=${s.panelCount} zoom=${s.panelZoomCss}`);
    record(`${prefix}浮层自己不再 zoom`, !s.panelOpen || s.panelZoomCss === '1' || s.panelZoomCss === 'normal', `panelZoom=${s.panelZoomCss}`);
    const w100 = s.panelW;
    const layoutOk = s.layoutLeft != null && s.layoutLeft >= -1 && s.layoutLeft <= 1200;
    record(`${prefix}定位用布局像素`, layoutOk, `left=${s.layoutLeft}`);
    record(`${prefix}贴右边仍在 1200 内`, s.panelLeft >= s.stageLeft - 2 && s.panelRight <= s.stageRight + 4,
      `panel ${s.panelLeft}-${s.panelRight} stage ${s.stageLeft}-${s.stageRight}`);

    const beforeScroll = s.panelCount;
    await page.evaluate(() => window.scrollBy(0, 80));
    await sleep(300);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}滑动画布不关`, s.panelCount >= beforeScroll && s.panelInFloat, `count=${s.panelCount}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);

    await setZoomViaUi(page, '50%');
    await sleep(350);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}50% 舞台约 600`, Math.abs(s.stageW - 600) < 16 || Math.abs(s.z - 0.5) < 0.06, `stageW=${s.stageW} z=${s.z}`);
    record(`${prefix}50% 浮层仍开且跟缩`, s.panelInFloat && w100 > 0 && s.panelW < w100 * 0.75,
      `w100=${w100} w50=${s.panelW}`);
    record(`${prefix}50% 控件不缩`, Math.abs(s.ctrlH - ctrlH100) <= 2, `h100=${ctrlH100} h50=${s.ctrlH}`);
    await page.locator('.ds-zoom-btn[aria-label="放大"]').click();
    await sleep(250);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}点缩放按钮不关浮层`, s.panelInFloat, `count=${s.panelCount}`);
    await setZoomViaUi(page, '50%');
    await sleep(150);

    await setZoomViaUi(page, '150%');
    await sleep(350);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}150% 舞台约 1800`, Math.abs(s.stageW - 1800) < 16 || Math.abs(s.z - 1.5) < 0.06, `stageW=${s.stageW} z=${s.z}`);
    record(`${prefix}150% 浮层仍开且放大`, s.panelInFloat && w100 > 0 && s.panelW > w100 * 1.2,
      `w100=${w100} w150=${s.panelW}`);

    await setZoomViaUi(page, '100%');
    await sleep(200);

    const childBefore = s.panelCount;
    const confirmCell = page.locator('.float-panel .ds-picker-edit-trigger').first();
    const hasConfirm = await confirmCell.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    if (hasConfirm) {
      await confirmCell.click({ timeout: 5000 });
      await sleep(800);
    }
    s = await page.evaluate(snapshotStage);
    record(`${prefix}确认层父不关`, hasConfirm && (s.panelCount > childBefore || s.panelCount >= 2),
      `panels=${s.panelCount} confirm=${hasConfirm}`);

    await page.setViewportSize({ width: 1440, height: 420 });
    await sleep(300);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}矮视口浮层仍开`, s.panelInFloat, `h=${s.panelW}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(200);

    await page.mouse.click(20, 80);
    await sleep(400);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}点空白关闭浮层`, !s.panelOpen, `count=${s.panelCount}`);
  }

  await page.goto(`${FE}/staff/basic/products`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ds-canvas-stage', { timeout: 20000 });
  await sleep(1200);
  const createBtn = page.getByRole('button', { name: '新建产品' });
  if (await createBtn.count()) {
    await createBtn.click();
    await sleep(1000);
  } else {
    const nameLink = page.locator('.ant-table-tbody tr').nth(1).locator('a').first();
    if (await nameLink.count()) await nameLink.click();
    await sleep(1000);
  }
  await page.waitForSelector('.ant-modal', { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOT, `${name}_modal.png`) });
  s = await page.evaluate(snapshotStage);
  record(`${prefix}编辑弹窗挂 modal 层`, s.modalInLayer, JSON.stringify({ open: s.modalOpen, in: s.modalInLayer }));
  record(`${prefix}弹窗中心跟画布中心`, !!s.modalOpen && s.modalDx != null && s.modalDx < 28 && s.modalDy < 80,
    `dx=${s.modalDx} dy=${s.modalDy}`);
  record(`${prefix}弹窗自己不再 zoom`, !s.modalOpen || s.modalZoomCss === '1' || s.modalZoomCss === 'normal',
    `modalZoom=${s.modalZoomCss}`);

  const combo = page.locator('.ant-modal .ant-select, .ant-modal .ds-suggest-input').first();
  if (await combo.count()) {
    await combo.click();
    await sleep(600);
    s = await page.evaluate(snapshotStage);
    record(`${prefix}弹窗内下拉在叠加层`, s.dropdownInOverlay, '');
  } else {
    record(`${prefix}弹窗内下拉在叠加层`, false, '未找到下拉触发点');
  }

  await browser.close();
}

(async () => {
  console.log('=== 画布舞台 + 叠加层验收 ===');
  await runOn(chromium, 'chromium');
  let webkitOk = true;
  try {
    await runOn(webkit, 'webkit');
  } catch (e) {
    webkitOk = false;
    record('webkit 启动', false, String(e.message || e).slice(0, 180));
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n通过 ${results.length - failed.length}/${results.length}${webkitOk ? '' : '（webkit 未跑完）'}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
