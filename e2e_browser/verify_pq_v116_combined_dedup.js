/**
 * v11.6 宽表组合去重验证（API 级）：
 *   C1 建档「测试组合甲X」+ 规格空 → 存储为规格「通用」（组合=甲X通用）
 *   C2 再建档「测试组合甲X」+ 规格空 → 补通用候选命中 C1（空规格幂等，不重复建档）
 *   C3 先建档「测试组合乙X」+ 规格「25」→ 再建档「测试组合乙X25」+ 规格空
 *      （规格值录进产品名）→ 原始组合候选命中，复用档案（字段错位去重核心）
 *   C4 真正不同组合（规格32）→ 正常新增（id 不同）
 *   C5 反向顺序：先建「测试组合丙X」+规格40，再建「测试组合丙X40」+规格空 → 命中
 *   C6 空格差异：「测试组合丁X」+规格50 vs「测试组合 丁X 50」+规格空 → 去空格命中
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
  // v11.7 响应结构：{ status: 'ok', result } / { status: 'suggestion', candidates }
  if (resp.data.status !== 'ok') throw new Error(`意外响应: ${JSON.stringify(resp.data)}`);
  return resp.data.result;
}
(async () => {
  console.log('=== v11.6 宽表组合去重验证 ===');
  const login = await apiJson('/api/auth/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  if (login.code !== 0) { console.error('登录失败', login); process.exit(1); }
  const token = login.data.token;
  const suf = Date.now() % 100000;

  try {
    // 首次建档带 forceNew（隔离 v11.7 相似候选对历史档案的提示干扰），复用验证不带
    // C1/C2 空规格幂等
    console.log('\n--- C1/C2 空规格幂等 ---');
    const a = await quickCreate(token, {
      productName: `测试组合甲${suf}`, specModel: '', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    record('C1 建档（规格空→通用）', a.spec.specModel === '通用', `spec="${a.spec.specModel}"`);
    const a2 = await quickCreate(token, {
      productName: `测试组合甲${suf}`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    record('C2 空规格重复 → 复用不新增', a2.product.id === a.product.id && a2.spec.id === a.spec.id,
      `product ${a.product.id}→${a2.product.id}`);

    // C3 字段错位：规格值录进产品名
    console.log('\n--- C3 规格值录进产品名 → 命中档案 ---');
    const b1 = await quickCreate(token, {
      productName: `测试组合乙${suf}`, specModel: '25', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    const b2 = await quickCreate(token, {
      productName: `测试组合乙${suf}25`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    record('C3 错位录入复用档案', b2.product.id === b1.product.id && b2.spec.id === b1.spec.id && b2.specBrand.id === b1.specBrand.id,
      `「乙${suf}」+25 vs 「乙${suf}25」+空 → product ${b1.product.id}→${b2.product.id} | specBrand ${b1.specBrand.id}→${b2.specBrand.id}`);

    // C4 不同组合 → 新增
    console.log('\n--- C4 不同组合正常新增 ---');
    const b3 = await quickCreate(token, {
      productName: `测试组合乙${suf}`, specModel: '32', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    record('C4 不同规格新增', b3.product.id === b1.product.id && b3.spec.id !== b1.spec.id,
      `同产品名不同规格25 vs 32 → spec ${b1.spec.id}→${b3.spec.id}`);

    // C5 反向顺序
    console.log('\n--- C5 反向顺序命中 ---');
    const c1 = await quickCreate(token, {
      productName: `测试组合丙${suf}`, specModel: '40', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    const c2 = await quickCreate(token, {
      productName: `测试组合丙${suf}40`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    record('C5 反向命中', c2.product.id === c1.product.id && c2.spec.id === c1.spec.id,
      `先建 名+40 → 再建 名40+空 → product ${c1.product.id}→${c2.product.id}`);

    // C6 空格差异
    console.log('\n--- C6 空格差异命中 ---');
    const d1 = await quickCreate(token, {
      productName: `测试组合丁${suf}`, specModel: '50', unitName: '件', brandName: '普通品牌', forceNew: true,
    });
    const d2 = await quickCreate(token, {
      productName: `测试组合 丁${suf} 50`, specModel: '', unitName: '件', brandName: '普通品牌',
    });
    record('C6 空格差异命中', d2.product.id === d1.product.id,
      `「丁${suf}」+50 vs 「组合 丁${suf} 50」+空 → product ${d1.product.id}→${d2.product.id}`);
  } catch (e) {
    console.error('脚本异常:', e.message);
  }

  console.log('\n=== 验证结果汇总 ===');
  let pass = 0;
  for (const r of results) { if (r.pass) pass++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`); }
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
})();
