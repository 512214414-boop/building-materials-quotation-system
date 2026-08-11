// CPU Profile：定位首屏/弹窗渲染的耗时函数
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';

// 解析 CPU Profile：统计每个函数自采样数占比 → top 耗时
function analyzeProfile(profile, label) {
  const nodes = profile.nodes;
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  if (samples.length === 0) { console.log(`${label}: 无采样`); return; }
  const totalTime = deltas.reduce((s, d) => s + d, 0);
  // 每个样本归属的节点 id → 累计时间
  const nodeTime = new Map();
  samples.forEach((nodeId, i) => {
    const d = deltas[i] ?? 0;
    nodeTime.set(nodeId, (nodeTime.get(nodeId) ?? 0) + d);
  });
  // 聚合到函数（callFrame.functionName + url 短名）
  const fnTime = new Map();
  for (const [nodeId, t] of nodeTime) {
    const n = idToNode.get(nodeId);
    if (!n) continue;
    const cf = n.callFrame;
    const url = (cf.url ?? '').split('/').pop()?.slice(0, 50) ?? '';
    const key = `${cf.functionName || '(anonymous)'} @ ${url}`;
    fnTime.set(key, (fnTime.get(key) ?? 0) + t);
  }
  const sorted = [...fnTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`\n===== ${label}：总采样 ${(totalTime / 1000).toFixed(0)}ms，top 函数 =====`);
  sorted.forEach(([k, t]) => {
    console.log(`${String(Math.round(t)).padStart(6)}ms  ${(t / totalTime * 100).toFixed(1).padStart(5)}%  ${k}`);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');

  // 登录（不采样）
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 }).catch(() => {});

  // ---- 采样：产品管理页首屏 ----
  await client.send('Profiler.start');
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(800);
  const p1 = await client.send('Profiler.stop');
  analyzeProfile(p1.profile, '产品管理页首屏');

  // ---- 采样：打开产品编辑弹窗 ----
  await client.send('Profiler.start');
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const p2 = await client.send('Profiler.stop');
  analyzeProfile(p2.profile, '打开产品编辑弹窗');

  await browser.close();
}

main().catch((e) => {
  console.error('异常：', e?.message ?? e);
  process.exit(1);
});
