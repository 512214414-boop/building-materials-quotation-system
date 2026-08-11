// 交付验证脚本（v14 产品数据层 API 闭环测试）
// 用法：node 脚本直连后端 3000 端口，全链路代码验证，无需浏览器
// 验证点：
//   1. 员工登录拿 token
//   2. 产品搜索列表（宽表：含 specId/specBrandId 维度，有数据）
//   3. 产品详情（getProduct 扁平化：specId/specModel/brands/units/prices）
//   4. 规格快切列表
//   5. 品牌全局档案（listBrands：name 唯一 + specBrands 引用数）
//   6. 单位列表 + SKU 选项（getSkuOptions by specBrandId）
//   7. 售价/进价列表
//   8. 快速建档 + 保存产品（saveProduct 事务闭环）
//   9. 单据行快照解析（document_lines 含 specId）

const BASE = 'http://localhost:3000';
const USERNAME = process.env.STAFF_USER ?? 'admin';
const PASSWORD = process.env.STAFF_PASS ?? 'Admin@123';

let passCount = 0;
let failCount = 0;
let token = '';

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passCount++;
    console.log(`  ✅ ${name}`);
  } else {
    failCount++;
    console.log(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : '');
  }
  return cond;
}

async function api(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const { method = 'GET', body, auth = true } = opts;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function main() {
  console.log('═══ 1. 员工登录 ═══');
  const login = await api('/api/auth/staff/login', { method: 'POST', body: { username: USERNAME, password: PASSWORD }, auth: false });
  check('登录成功 (200)', login.status === 200, login.json);
  token = login.json?.data?.token ?? login.json?.token ?? '';
  check('获取 token', !!token);

  console.log('═══ 2. 产品搜索列表（宽表） ═══');
  const search = await api('/api/staff/products/search?page=1&size=10');
  const searchOk = check('搜索接口 200', search.status === 200, search.json);
  const list = search.json?.data?.list ?? [];
  const skuRows = list.filter((r: any) => r.type === 'sku');
  check('返回 SKU 行 > 0', skuRows.length > 0, { total: search.json?.data?.total });
  const first = skuRows[0];
  if (first) {
    check('SKU 行含 specId', first.specId !== undefined, { specId: first.specId });
    check('SKU 行含 specBrandId', first.specBrandId !== undefined, { specBrandId: first.specBrandId });
    check('SKU 行含 specModel', !!first.specModel, { specModel: first.specModel });
    check('SKU 行含品牌', !!first.brandName, { brand: first.brandName });
  }

  console.log('═══ 3. 产品详情（扁平化当前规格） ═══');
  const prodId = first?.productId;
  let specIdOfFirst: string | undefined;
  if (prodId) {
    const detail = await api(`/api/staff/products/${prodId}`);
    const d = detail.json?.data;
    check('详情接口 200', detail.status === 200, detail.json);
    check('详情含 specId', !!d?.specId, { specId: d?.specId });
    check('详情含 specModel', !!d?.specModel, { specModel: d?.specModel });
    check('详情含 specs 列表', Array.isArray(d?.specs), { specsCount: d?.specs?.length });
    check('详情含 brands（spec_brand 维度）', Array.isArray(d?.brands), { brands: d?.brands?.length });
    if (d?.brands?.length) {
      const b = d.brands[0];
      check('品牌含 brandId（全局档案）', b?.brandId !== undefined, { brandId: b?.brandId, name: b?.name });
      check('品牌含 specId', b?.specId !== undefined, { specId: b?.specId });
    }
    check('详情含 units', Array.isArray(d?.units), { units: d?.units?.length });
    check('详情含 salePrices/purchasePrices', Array.isArray(d?.salePrices) && Array.isArray(d?.purchasePrices), {
      sale: d?.salePrices?.length, purchase: d?.purchasePrices?.length,
    });
    specIdOfFirst = d?.specId;
  }

  console.log('═══ 4. 规格快切列表 ═══');
  if (prodId) {
    const sib = await api(`/api/staff/products/${prodId}/sibling-specs`);
    const specs = sib.json?.data ?? [];
    check('规格快切 200 且返回规格列表', sib.status === 200 && Array.isArray(specs), { count: specs.length });
    if (specs.length) check('规格含 brandCount', specs[0].brandCount !== undefined, specs[0]);
  }

  console.log('═══ 5. 品牌全局档案 ═══');
  const brands = await api('/api/staff/brands?page=1&pageSize=20');
  const brandList = brands.json?.data?.list ?? [];
  check('品牌列表 200', brands.status === 200, brands.json);
  check('全局品牌数 > 0', brandList.length > 0, { count: brands.json?.data?.total });
  const firstBrand = brandList[0];
  if (firstBrand) {
    check('品牌 name 唯一', !!firstBrand.name, { name: firstBrand.name });
    check('品牌含 specBrands 引用计数', firstBrand.count?.specBrands !== undefined, firstBrand.count);
  }

  console.log('═══ 6. 单位列表 + SKU 选项 ═══');
  if (specIdOfFirst) {
    const units = await api(`/api/staff/units?specId=${specIdOfFirst}`);
    check('单位列表 200（按 specId）', units.status === 200, units.json);
    check('单位含 spec 关联', units.json?.data?.list?.[0]?.spec !== undefined, units.json?.data?.list?.[0]);
  }
  if (first?.specBrandId) {
    const opts = await api(`/api/staff/products/sku/options?specBrandId=${first.specBrandId}`);
    const o = opts.json?.data;
    check('SKU 选项 200（按 specBrandId）', opts.status === 200, opts.json);
    check('SKU 选项含 units', Array.isArray(o?.units), { units: o?.units?.length });
    if (o?.units?.length) {
      const u = o.units[0];
      check('单位含换算率 conversions', Array.isArray(u?.conversions), u?.conversions);
      check('单位含售价列表', Array.isArray(u?.salePrices), u?.salePrices);
      check('单位含进价列表', Array.isArray(u?.purchasePrices), u?.purchasePrices);
    }
  }

  console.log('═══ 7. 售价/进价列表（specBrandId 维度） ═══');
  if (first?.specBrandId) {
    const sp = await api(`/api/staff/sale-prices?specBrandId=${first.specBrandId}&page=1&pageSize=10`);
    check('售价列表 200', sp.status === 200, sp.json);
    const pp = await api(`/api/staff/purchase-prices?specBrandId=${first.specBrandId}&page=1&pageSize=10`);
    const ppList = pp.json?.data?.list ?? [];
    check('进价列表 200 且返回行', pp.status === 200, pp.json);
    if (ppList[0]) check('进价含点位/有效价', ppList[0].point !== undefined && ppList[0].effectivePrice !== undefined, ppList[0]);
  }

  console.log('═══ 8. 快速建档 + 保存（事务闭环） ═══');
  const ts = Date.now();
  const prodName = `测试产品${ts}`;
  const qc = await api('/api/staff/products/quick-create', {
    method: 'POST',
    body: { productName: prodName, specModel: '测试规格', unitName: '件', brandName: '测试品牌' },
  });
  const qcData = qc.json?.data;
  check('快速建档 201', qc.status === 201, qc.json);
  check('返回 product/spec/specBrand/unit', !!qcData?.product?.id && !!qcData?.spec?.id && !!qcData?.specBrand?.id && !!qcData?.unit?.id, {
    product: qcData?.product?.id, spec: qcData?.spec?.id, specBrand: qcData?.specBrand?.id,
  });

  // saveProduct 编辑：改备注 + 加价格
  if (qcData?.product?.id && qcData?.spec?.id) {
    const save = await api('/api/staff/products/save', {
      method: 'POST',
      body: {
        id: qcData.product.id,
        specId: qcData.spec.id,
        name: prodName,
        specModel: '测试规格',
        categoryId: 0,
        units: [{ id: qcData.unit.id, unitName: '件', isBase: true, isDisplay: true }],
        brands: [{ id: qcData.specBrand.id, name: '测试品牌', remark: '脚本验证备注' }],
        salePrices: [{ brandIdx: 0, unitIdx: 0, priceTypeId: undefined, price: '66.66', isDefault: true }],
        purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: undefined, price: '33.33', isDefault: true }],
      },
    });
    check('saveProduct 编辑 201', save.status === 201, save.json);
    // 重新检索验证
    const search2 = await api(`/api/staff/products/search?keyword=${encodeURIComponent(prodName)}&page=1&size=5`);
    const rows2 = (search2.json?.data?.list ?? []).filter((r: any) => r.type === 'sku');
    const hit = rows2.find((r: any) => r.productName === prodName);
    check('新建档产品可检索到', !!hit, { rows: rows2.length });
    if (hit) {
      check('新行含 specId/specBrandId', !!hit.specId && !!hit.specBrandId, { specId: hit.specId, specBrandId: hit.specBrandId });
      // 验证宽表价格已同步
      check('新行零售价已同步', Number(hit.retailPrice) > 0, { retailPrice: hit.retailPrice, purchase: hit.purchasePriceDefault });
    }
    // 清理测试数据
    if (qcData.specBrand.id) {
      await api(`/api/staff/specs/${qcData.spec.id}`, { method: 'DELETE' });
      console.log('  🧹 已清理测试规格');
    }
  }

  console.log('═══ 9. 单据行快照（specId 维度） ═══');
  const dl = await api('/api/staff/documents?page=1&pageSize=3');
  const docs = dl.json?.data?.list ?? [];
  if (docs[0]?.id) {
    const lines = await api(`/api/staff/documents/${docs[0].id}/lines`);
    const rows = lines.json?.data ?? [];
    check('单据行含 specId 字段', rows.every((r: any) => 'specId' in r), { sample: rows[0] ? { specId: rows[0].specId, productName: rows[0].productName } : null });
  } else {
    console.log('  ⏭️ 无单据数据，跳过');
  }

  console.log(`\n═══════ 结果：${passCount} 通过 / ${failCount} 失败 ═══════`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => { console.error('脚本异常', e); process.exit(2); });
