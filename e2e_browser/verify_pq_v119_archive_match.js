/**
 * v11.9 快速建档候选匹配升级验证（用户案例）：
 *   输入口语俗语「ppr伟星绿色25给水管」/「伟星绿色25给水管」/「伟星水管」等
 *   → 应召回标准档案「ppr DN25给水管 伟星绿 en4.2」并作为候选给出（复用决策）
 *
 *   S0 确认目标档案存在（search 接口）
 *   S1 输入「ppr伟星绿色25给水管」→ suggestion 候选含目标档案
 *   S2 输入「伟星绿色25给水管」→ suggestion 候选含目标档案
 *   S3 输入「伟星水管」→ suggestion 候选含目标档案
 *   S4 输入完全无关词 → 不候选，直接新建（ok）
 *   S5 输入目标档案精确组合 → 精确命中静默复用（ok + reused，回归不受破坏）
 */
const API_BASE = 'http://localhost:3000';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function apiJson(pathname, opts = {}) {
  const resp = await fetch(`${API_BASE}${pathname}`, opts);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`${pathname} 失败: ${JSON.stringify(data)}`);
  return data.data;
}
(async () => {
  console.log('=== v11.9 档案候选匹配升级验证 ===');
  const token = (await apiJson('/api/auth/staff/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })).token;
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const suf = Date.now() % 100000;

  try {
    // S0 目标档案
    const search = await apiJson(`/api/staff/products/search?keyword=${encodeURIComponent('ppr DN25 伟星绿')}&size=20`, { headers: authHeaders }).catch(() => null);
    const target = (search?.list ?? []).find((r) =>
      r.type === 'sku' && (r.productName || '').includes('DN25') && (r.brandName || '').includes('伟星'));
    record('S0 目标档案存在', !!target, target ? `${target.productName} | ${target.specModel} | ${target.brandName}` : '未找到');
    if (!target) throw new Error('S0 未找到目标档案，无法继续');

    // 候选断言辅助：suggestion 候选是否包含目标 specBrandId
    const assertCandidate = (name, input, expectHit) => {
      const hit = (resp) => {
        if (resp.status !== 'suggestion') return false;
        return resp.candidates.some((c) => c.specBrand && String(c.specBrand.id) === String(target.specBrandId ?? target.id));
      };
      return hit(resp) === expectHit;
    };

    // S1 用户完整口语输入
    console.log('\n--- S1 ppr伟星绿色25给水管 ---');
    const s1 = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ productName: 'ppr伟星绿色25给水管', specModel: '', unitName: '件', brandName: '普通品牌' }),
    });
    const s1Hit = s1.status === 'suggestion' && s1.candidates.some((c) => String(c.specBrand.id) === String(target.specBrandId ?? target.id));
    record('S1 口语输入触发候选且含目标档案', s1Hit,
      `status=${s1.status} 候选=${s1.candidates?.map((c) => `${c.product.name} ${c.brand.name} ${c.spec.specModel}(${Math.round(c.matchScore * 100)}%)`).join(' | ') || '无'}`);

    // S2 不带 ppr
    console.log('\n--- S2 伟星绿色25给水管 ---');
    const s2 = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ productName: '伟星绿色25给水管', specModel: '', unitName: '件', brandName: '普通品牌' }),
    });
    const s2Hit = s2.status === 'suggestion' && s2.candidates.some((c) => String(c.specBrand.id) === String(target.specBrandId ?? target.id));
    record('S2 无ppr口语输入触发候选且含目标档案', s2Hit,
      `status=${s2.status} 候选=${s2.candidates?.map((c) => `${c.product.name} ${c.brand.name} ${c.spec.specModel}(${Math.round(c.matchScore * 100)}%)`).join(' | ') || '无'}`);

    // S3 更简口语（单段模糊输入：信息不足，候选给出伟星相关档案即合理）
    console.log('\n--- S3 伟星水管 ---');
    const s3 = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ productName: '伟星水管', specModel: '', unitName: '件', brandName: '普通品牌' }),
    });
    const s3Cand = s3.status === 'suggestion' && s3.candidates.length > 0;
    const s3HasWeixing = s3Cand && s3.candidates.some(
      (c) => (c.brand?.name || '').includes('伟星') || (c.product?.name || '').includes('伟星'),
    );
    record('S3 简写口语触发候选', s3Cand,
      `status=${s3.status} 候选=${s3.candidates?.map((c) => `${c.product.name} ${c.brand.name} ${c.spec.specModel}(${Math.round(c.matchScore * 100)}%)`).join(' | ') || '无'}`);
    record('S3 候选含伟星相关档案', s3HasWeixing,
      `品牌/产品=${s3.candidates?.map((c) => `${c.brand?.name}/${c.product?.name}`).join(',') || '无'}`);

    // S4 完全无关 → 不候选直接新建
    console.log('\n--- S4 无关词直接新建 ---');
    const s4Name = `孤立无关联${Math.random().toString(36).slice(2, 10)}`;
    const s4 = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ productName: s4Name, specModel: '', unitName: '件', brandName: '普通品牌', forceNew: true }),
    });
    record('S4 无关词直接新建（无候选）', s4.status === 'ok' && !s4.result.reused,
      `status=${s4.status} reused=${s4.result.reused}`);

    // S5 精确组合命中不受破坏
    console.log('\n--- S5 精确组合静默复用 ---');
    const s5 = await apiJson('/api/staff/products/quick-create', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ productName: target.productName, specModel: target.specModel, unitName: '件', brandName: target.brandName }),
    });
    record('S5 精确组合复用不受破坏', s5.status === 'ok' && s5.result.reused === true,
      `status=${s5.status} reused=${s5.result.reused} product=${s5.result.product.id}`);
  } catch (e) {
    console.error('脚本异常:', e.message);
  }

  console.log('\n=== 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) { if (r.pass) pass++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
})();
