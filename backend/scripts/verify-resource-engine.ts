/**
 * 资源引擎验证（元模型运行时 · 阶段 F）
 *
 * 验证「yml 登记一段 resources 声明 → 后端接口自动可用」，不需要手写 handler。
 * 用法：cd backend && npx tsx scripts/verify-resource-engine.ts
 *
 * 覆盖：资源清单 → 列表 → 快建 → 详情 → 改 → 引用计数 → 删（软删）
 *      → 未登记资源应 404（防止绕过登记表开接口）
 */
import { prisma } from '../src/config/prisma.js';

const BASE = 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const { data } = (await loginRes.json()) as { data: { token: string } };
  const H = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' };

  console.log('=== 资源引擎验证（配置驱动，零手写 handler）===\n');

  // 1) 已登记资源清单
  const listRes = await fetch(`${BASE}/api/staff/r`, { headers: H });
  const listJson = (await listRes.json()) as any;
  const resources = listJson?.data ?? [];
  check('资源清单接口可用', listRes.status === 200, `${resources.length} 个已登记`);
  check(
    '供应商档案已登记且带权限叶子',
    resources.some((r: any) => r.key === 'supplier' && r.permission === 'supplier_manage'),
    JSON.stringify(resources.find((r: any) => r.key === 'supplier') ?? {}),
  );

  // 2) 列表
  const pageRes = await fetch(`${BASE}/api/staff/r/supplier?page=1&pageSize=5`, { headers: H });
  const pageJson = (await pageRes.json()) as any;
  check(
    '列表接口可用（分页）',
    pageRes.status === 200 && Array.isArray(pageJson?.data?.list),
    `条数=${pageJson?.data?.list?.length ?? 0} 总数=${pageJson?.data?.pagination?.total ?? 0}`,
  );

  // 3) 快建（registry.quickAdd：名称唯一，有则复用）
  const name = `元模型验证_${Date.now()}`;
  const qaRes = await fetch(`${BASE}/api/staff/r/supplier/quick-add`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name }),
  });
  const qaJson = (await qaRes.json()) as any;
  const createdId = qaJson?.data?.id;
  check('快建接口可用', qaRes.status === 201 && !!createdId, `id=${createdId}`);

  // 3.1) 同名快建应复用（不重复建档）
  const qa2 = await fetch(`${BASE}/api/staff/r/supplier/quick-add`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name }),
  });
  const qa2Json = (await qa2.json()) as any;
  check('同名快建复用同一条（全局唯一）', String(qa2Json?.data?.id) === String(createdId), `id=${qa2Json?.data?.id}`);

  // 4) 详情
  const getRes = await fetch(`${BASE}/api/staff/r/supplier/${createdId}`, { headers: H });
  const getJson = (await getRes.json()) as any;
  check('详情接口可用', getRes.status === 200 && getJson?.data?.name === name, `名称=${getJson?.data?.name}`);

  // 5) 改（白名单内字段）
  const upRes = await fetch(`${BASE}/api/staff/r/supplier/${createdId}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ remark: '资源引擎写入' }),
  });
  const upJson = (await upRes.json()) as any;
  check('改接口可用（白名单字段）', upRes.status === 200 && upJson?.data?.remark === '资源引擎写入');

  // 6) 引用计数
  const rcRes = await fetch(`${BASE}/api/staff/r/supplier/${createdId}/ref-counts`, { headers: H });
  const rcJson = (await rcRes.json()) as any;
  check(
    '引用计数接口可用（按 refTargets 声明统计）',
    rcRes.status === 200 && Array.isArray(rcJson?.data?.refCounts),
    JSON.stringify(rcJson?.data?.refCounts ?? []),
  );

  // 7) 删（softDelete 声明 → status=0，非物理删除）
  const delRes = await fetch(`${BASE}/api/staff/r/supplier/${createdId}`, { method: 'DELETE', headers: H });
  const delJson = (await delRes.json()) as any;
  check('删接口可用', delRes.status === 200, JSON.stringify(delJson?.data?.refCounts ?? []));
  const after = await prisma.supplier.findUnique({ where: { id: BigInt(String(createdId)) } });
  check('软删生效（status=0，行仍在）', after?.status === 0, `status=${after?.status}`);

  // 8) 未登记资源 → 404（登记是唯一入口）
  const unk = await fetch(`${BASE}/api/staff/r/not_registered_entity`, { headers: H });
  check('未登记资源返回 404（不能绕过登记表）', unk.status === 404, `status=${unk.status}`);

  // ===== 第二批实证：引擎泛化到非 supplier 的全局字典 =====
  const catName = `元模型验证分类_${Date.now()}`;
  const catList = await fetch(`${BASE}/api/staff/r/category?page=1&pageSize=5`, { headers: H });
  const catListJson = (await catList.json()) as any;
  check('分类列表接口可用', catList.status === 200 && Array.isArray(catListJson?.data?.list), `条数=${catListJson?.data?.list?.length ?? 0} 总数=${catListJson?.data?.pagination?.total ?? 0}`);
  const catQa = await fetch(`${BASE}/api/staff/r/category/quick-add`, { method: 'POST', headers: H, body: JSON.stringify({ name: catName }) });
  const catQaJson = (await catQa.json()) as any;
  const catId = catQaJson?.data?.id;
  check('分类快建接口可用', catQa.status === 201 && !!catId, `id=${catId}`);
  const catGet = await fetch(`${BASE}/api/staff/r/category/${catId}`, { headers: H });
  const catGetJson = (await catGet.json()) as any;
  check('分类详情接口可用', catGet.status === 200 && catGetJson?.data?.name === catName);
  const catUp = await fetch(`${BASE}/api/staff/r/category/${catId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ sortOrder: 5 }) });
  const catUpJson = (await catUp.json()) as any;
  check('分类改接口可用（白名单字段）', catUp.status === 200 && catUpJson?.data?.sortOrder === 5);
  const catRc = await fetch(`${BASE}/api/staff/r/category/${catId}/ref-counts`, { headers: H });
  const catRcJson = (await catRc.json()) as any;
  check('分类引用计数接口可用', catRc.status === 200 && Array.isArray(catRcJson?.data?.refCounts), JSON.stringify(catRcJson?.data?.refCounts ?? []));
  await fetch(`${BASE}/api/staff/r/category/${catId}`, { method: 'DELETE', headers: H });

  // 单位：名称列是 unitName（验证引擎泛化到非 name 字段）
  const unitName = `元模型验证单位_${Date.now()}`;
  const unitQa = await fetch(`${BASE}/api/staff/r/unit/quick-add`, { method: 'POST', headers: H, body: JSON.stringify({ unitName }) });
  const unitQaJson = (await unitQa.json()) as any;
  const unitId = unitQaJson?.data?.id;
  check('单位快建接口可用（unitName 名称列）', unitQa.status === 201 && !!unitId, `id=${unitId} name=${unitQaJson?.data?.name}`);
  const unitList = await fetch(`${BASE}/api/staff/r/unit?keyword=${encodeURIComponent(unitName)}`, { headers: H });
  const unitListJson = (await unitList.json()) as any;
  const unitHit = (unitListJson?.data?.list ?? []).some((r: any) => String(r.id) === String(unitId));
  check('单位按 unitName 检索可用（引擎泛化）', unitList.status === 200 && unitHit);
  await fetch(`${BASE}/api/staff/r/unit/${unitId}`, { method: 'DELETE', headers: H });

  // 清理测试数据（物理删除，避免污染）
  await prisma.supplier.delete({ where: { id: BigInt(String(createdId)) } });
  await prisma.category.delete({ where: { id: Number(catId) } }).catch(() => {});
  await prisma.unit.delete({ where: { id: BigInt(String(unitId)) } }).catch(() => {});
  console.log('\n已清理测试数据');

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('验证异常:', e);
  await prisma.$disconnect();
  process.exit(1);
});
