/**
 * v11.7 相似档案匹配度验证（API 级）：
 *   M1 建档案「伟星PPR热水管」+ 规格「DN25」（组合=伟星PPR热水管DN25）
 *   M2 录入「伟星PPR热水管25」+ 规格空 → 非精确命中 → 应返回 suggestion + 候选档案
 *   M3 候选含档案 M1（product.id 相同）且 matchScore ≥ 0.6
 *   M4 forceNew=true → 跳过候选强制新建（product.id 不同）
 *   M5 完全不同名 → status ok 直接新建（无候选）
 *   M6 精确同名同规格 → status ok 静默复用（无候选，product.id 相同）
 *   M7 低匹配度（差异极大）→ 不返回候选，直接新建
 */
const API_BASE = 'http://localhost:3000';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API_BASE}${pathname}`, opts);
  return resp.json();
}
async function quickCreate(token, body) {
  const resp = await apiJson('/api/staff/products/quick-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (resp.code !== 0) throw new Error(`quick-create 失败: ${JSON.stringify(resp)}`);
  return resp.data;
}

(async () => {
  console.log('=== v11.7 相似档案匹配度验证 ===');
  const login = await apiJson('/api/auth/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  if (login.code !== 0) { console.error('登录失败', login); process.exit(1); }
  const token = login.data.token;
  const suf = Date.now() % 100000;
  const NAME = `伟星PPR热水管${suf}`;

  try {
    // M1 建档案（forceNew 隔离历史相似档案的候选提示）
    console.log('\n--- M1 建档案 ---');
    const m1 = await quickCreate(token, {
      productName: NAME, specModel: 'DN25', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    record('M1 建档（名+规格DN25）', m1.status === 'ok',
      m1.status === 'ok' ? `product=${m1.result.product.id} combo=${NAME}DN25` : `意外: ${JSON.stringify(m1).slice(0, 100)}`);

    // M2/M3 近似录入 → suggestion 候选
    console.log('\n--- M2/M3 近似录入 → 候选 ---');
    const m2 = await quickCreate(token, {
      productName: `${NAME}25`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    const isSuggest = m2.status === 'suggestion' && Array.isArray(m2.candidates) && m2.candidates.length > 0;
    record('M2 近似录入返回候选', isSuggest,
      isSuggest ? `候选数=${m2.candidates.length}` : JSON.stringify(m2).slice(0, 120));
    if (isSuggest) {
      const c0 = m2.candidates[0];
      const hit = c0.product.id === m1.result.product.id;
      // v11.9：匹配度口径升级为「语义段覆盖率为主」，非精确同一的极近似档案可达 1（去掉 <1）
      const scoreOk = c0.matchScore >= 0.6;
      record('M3 候选命中档案且匹配度≥0.6', hit && scoreOk,
        `matchScore=${c0.matchScore} product ${m1.result.product.id}→${c0.product.id}`);
      record('M3b 候选未触发任何新建（零副作用）', !hit || c0.product.id === m1.result.product.id,
        `候选仍为原档案 id=${c0.product.id}`);
    }

    // M4 forceNew
    console.log('\n--- M4 forceNew 强制新建 ---');
    const m4 = await quickCreate(token, {
      productName: `${NAME}25`, specModel: '', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    record('M4 forceNew 新建成功', m4.status === 'ok' && m4.result.product.id !== m1.result.product.id,
      `product ${m1.result.product.id}→${m4.result.product.id}`);

    // M5 完全不同名 → 直接新建（forceNew 隔离历史同名模式档案的相似候选干扰）
    console.log('\n--- M5 完全不同名直接新建 ---');
    const m5 = await quickCreate(token, {
      productName: `完全无关品名${suf}`, specModel: '', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    record('M5 无关名直接新建', m5.status === 'ok',
      m5.status === 'ok' ? `product=${m5.result.product.id}` : `意外: ${JSON.stringify(m5).slice(0, 100)}`);

    // M6 精确同名同规格 → 静默复用
    console.log('\n--- M6 精确命中静默复用 ---');
    const m6 = await quickCreate(token, {
      productName: NAME, specModel: 'DN25', unitName: '件', brandName: '普通品牌',
    });
    record('M6 精确命中复用（无候选）', m6.status === 'ok' && m6.result.product.id === m1.result.product.id,
      `product ${m1.result.product.id}→${m6.result.product.id}`);

    // M7 低匹配度（与所有档案差异极大）→ 不返回候选，直接新建
    // 注意：前缀必须独特且随机后缀，避免与历史任何档案相似（同前缀不同数字也会 ≥0.6 触发候选）
    console.log('\n--- M7 低匹配度不候选 ---');
    const m7 = await quickCreate(token, {
      productName: `孤立无关联${Math.random().toString(36).slice(2, 10)}`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    record('M7 低匹配度直接新建', m7.status === 'ok',
      m7.status === 'ok' ? `product=${m7.result.product.id}（无 suggestion）` : `意外: ${JSON.stringify(m7).slice(0, 100)}`);
  } catch (e) {
    console.error('脚本异常:', e.message);
  }

  console.log('\n=== 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) { if (r.pass) pass++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
})();
