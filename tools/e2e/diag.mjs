// 深度诊断：首屏分段耗时 + 长任务（Long Tasks）+ 请求耗时分布
import { chromium } from 'playwright';

const BASE = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 注入 PerformanceObserver 收集长任务
  await page.addInitScript(() => {
    window.__longTasks = [];
    const collect = (list) => {
      list.getEntries().forEach((e) => window.__longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }));
    };
    try {
      new PerformanceObserver(collect).observe({ entryTypes: ['longtask'] });
    } catch {}
  });

  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入用户名').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Admin@123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/staff/**', { timeout: 12000 }).catch(() => {});

  // 清空长任务（只测产品页）
  await page.evaluate(() => { window.__longTasks = []; });

  // 产品管理页
  await page.goto(`${BASE}/staff/basic/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=产品全名', { timeout: 10000 });
  await page.waitForTimeout(600);

  // 首屏性能指标
  const metrics = await page.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name.split('/').pop()?.slice(0, 40), dur: Math.round(r.duration), size: Math.round((r.transferSize || 0) / 1024) }));
    return {
      domContentLoaded: Math.round(t.domContentLoadedEventEnd),
      load: Math.round(t.loadEventEnd),
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
      resourceCount: res.length,
      slowResources: res.filter((r) => r.dur > 500).sort((a, b) => b.dur - a.dur),
      topResources: res.sort((a, b) => b.dur - a.dur).slice(0, 10),
    };
  });
  console.log('首屏指标:', JSON.stringify(metrics, null, 1));

  // 长任务
  const longTasks = await page.evaluate(() => window.__longTasks ?? []);
  const totalBlock = longTasks.reduce((s, t) => s + t.dur, 0);
  console.log(`\n长任务数=${longTasks.length} 总阻塞=${totalBlock}ms`);
  longTasks.forEach((t) => console.log(`  +${t.dur}ms @ ${t.start}ms`));

  // 打开弹窗的长任务
  await page.evaluate(() => { window.__longTasks = []; });
  const t0 = Date.now();
  const row = page.locator('tbody tr').nth(1);
  await row.locator('td').nth(4).click().catch(() => row.click());
  // 点击 → Modal 出现（骨架可见，秒开感知）
  await page.waitForSelector('.ant-modal', { timeout: 3000 });
  const modalMs = Date.now() - t0;
  // Modal 出现 → 数据加载完成（spinning 隐藏）
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  const dialogMs = Date.now() - t0;
  const dialogTasks = await page.evaluate(() => window.__longTasks ?? []);
  const dialogBlock = dialogTasks.reduce((s, t) => s + t.dur, 0);
  console.log(`\n打开弹窗：点击→Modal出现=${modalMs}ms，总耗时=${dialogMs}ms 长任务=${dialogTasks.length} 阻塞=${dialogBlock}ms`);
  dialogTasks.forEach((t) => console.log(`  +${t.dur}ms @ ${t.start}ms`));

  // 关闭 → 第二次打开（验证 css-in-js 缓存 + DOM 复用后的真实体验）
  await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click().catch(() => {});
  await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { window.__longTasks = []; });
  const t1 = Date.now();
  const row2 = page.locator('tbody tr').nth(1);
  await row2.locator('td').nth(4).click().catch(() => row2.click());
  await page.waitForSelector('.ant-modal', { timeout: 3000 });
  const modalMs2 = Date.now() - t1;
  await page.waitForSelector('.ant-modal .ant-spin-spinning', { state: 'hidden', timeout: 10000 }).catch(() => {});
  const dialogMs2 = Date.now() - t1;
  const dialogTasks2 = await page.evaluate(() => window.__longTasks ?? []);
  const dialogBlock2 = dialogTasks2.reduce((s, t) => s + t.dur, 0);
  console.log(`\n第二次打开弹窗：点击→Modal出现=${modalMs2}ms，总耗时=${dialogMs2}ms 长任务=${dialogTasks2.length} 阻塞=${dialogBlock2}ms`);
  dialogTasks2.forEach((t) => console.log(`  +${t.dur}ms @ ${t.start}ms`));

  await browser.close();
}

main().catch((e) => {
  console.error('异常：', e?.message ?? e);
  process.exit(1);
});
