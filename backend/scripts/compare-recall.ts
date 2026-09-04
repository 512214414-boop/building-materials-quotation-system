/**
 * 对拍：宽表召回 vs 范式召回（去宽表改造 · 阶段 2 验证）
 *
 * 用法：cd backend && npx tsx scripts/compare-recall.ts
 *
 * 比较口径：**召回的 specId 集合**（召回层语义等价性）。
 * 若召回一致，上层组装（宽表单行读 vs 范式 join）只是数据源不同，语义等价。
 * 阶段 2 只做对拍，不切换线上路径。
 */
import { recallSkuRowsByKeyword } from '../src/services/product/search.js';
import { recallSpecRowsNormalized } from '../src/services/product/searchNormalized.js';
import { prisma } from '../src/config/prisma.js';

const RECALL_LIMIT = 500;

/** 覆盖各类输入形态（与宽表实现的路径分支一一对应） */
const KEYWORDS = [
  { kw: '给水管', note: '中文长词' },
  { kw: 'ppr热水管', note: '中英混合' },
  { kw: 'ppr', note: '短 ASCII（走 LIKE）' },
  { kw: 'dn25', note: '短字母数字（走 LIKE）' },
  { kw: '3.5', note: '纯数字标点（走 LIKE）' },
  { kw: '管', note: '单字（走 LIKE）' },
  { kw: '伟星', note: '品牌名' },
  { kw: '日丰', note: '品牌名' },
  { kw: '阀门', note: '产品名' },
  { kw: 'en3.4', note: '规格型号' },
  { kw: '伟星绿色25给水管', note: '乱序长串' },
  { kw: '未分类', note: '分类名' },
  { kw: 'zzz不存在xyz', note: '空命中' },
];

function idsOf(rows: any[], key = 'specId'): Set<string> {
  return new Set(rows.map((r) => String(r[key] ?? r.specBrandId ?? '')).filter(Boolean));
}

/** 展示字段逐行比对（宽表 vs 范式组装） */
function compareFields(wideRows: any[], normRows: any[]) {
  const normMap = new Map(normRows.map((r) => [String(r.specId), r]));
  const FIELDS = ['retailPrice', 'purchasePriceDefault', 'defaultUnitName', 'status'] as const;
  let checked = 0;
  let rowDiff = 0;
  const fieldDiffCount: Record<string, number> = {};
  const samples: string[] = [];

  for (const w of wideRows) {
    const n = normMap.get(String(w.specId));
    if (!n) continue;
    checked += 1;
    const diffs: string[] = [];
    for (const f of FIELDS) {
      const wv = f === 'retailPrice' || f === 'purchasePriceDefault'
        ? (w[f] != null ? Number(w[f]) : null)
        : w[f];
      const nv = f === 'defaultUnitName' ? n[f] : n[f] != null ? Number(n[f]) : null;
      const same = f === 'defaultUnitName'
        ? String(wv ?? '') === String(nv ?? '')
        : (wv == null && nv == null) || (wv != null && nv != null && Math.abs(Number(wv) - Number(nv)) < 0.005);
      if (!same) {
        diffs.push(`${f}: ${wv} → ${nv}`);
        fieldDiffCount[f] = (fieldDiffCount[f] ?? 0) + 1;
      }
    }
    if (diffs.length) {
      rowDiff += 1;
      if (samples.length < 3) samples.push(`specId=${w.specId} ${diffs.join(', ')}`);
    }
  }
  return { checked, rowDiff, fieldDiffCount, samples };
}

async function main() {
  console.log('=== 宽表 vs 范式 召回对拍（status=1）===\n');
  const table: Array<Record<string, string>> = [];
  let totalChecked = 0;
  let totalRowDiff = 0;
  const allFieldDiff: Record<string, number> = {};
  const allSamples: string[] = [];

  for (const { kw, note } of KEYWORDS) {
    // 宽表（现有线上路径）
    const t0 = Date.now();
    let wide: Set<string> = new Set();
    let wideErr = '';
    try {
      // filterClause 用占位符，filterParams 传值（两者数量必须匹配）
      const r = await recallSkuRowsByKeyword(kw, ' AND status = ?', [1], RECALL_LIMIT);
      wide = idsOf(r.rows);
    } catch (e) {
      wideErr = (e as Error).message.slice(0, 60);
    }
    const wideMs = Date.now() - t0;

    // 范式（新路径）
    const t1 = Date.now();
    let norm: Set<string> = new Set();
    let normErr = '';
    try {
      const r = await recallSpecRowsNormalized(kw, { statusOnly: true, recallLimit: RECALL_LIMIT });
      norm = idsOf(r.rows);
    } catch (e) {
      normErr = (e as Error).message.slice(0, 60);
    }
    const normMs = Date.now() - t1;

    // 展示字段逐行比对（同一批召回结果）
    let wideRows: any[] = [];
    let normRows: any[] = [];
    try {
      const rw = await recallSkuRowsByKeyword(kw, ' AND status = ?', [1], RECALL_LIMIT);
      wideRows = rw.rows;
    } catch { /* 上面已记录 */ }
    try {
      const rn = await recallSpecRowsNormalized(kw, { statusOnly: true, recallLimit: RECALL_LIMIT });
      normRows = rn.rows;
    } catch { /* 上面已记录 */ }
    const fc = compareFields(wideRows, normRows);
    totalChecked += fc.checked;
    totalRowDiff += fc.rowDiff;
    for (const [k, v] of Object.entries(fc.fieldDiffCount)) allFieldDiff[k] = (allFieldDiff[k] ?? 0) + v;
    allSamples.push(...fc.samples);

    const inter = [...wide].filter((x) => norm.has(x));
    const onlyWide = [...wide].filter((x) => !norm.has(x));
    const onlyNorm = [...norm].filter((x) => !wide.has(x));
    const union = new Set([...wide, ...norm]);
    const jaccard = union.size === 0 ? 1 : inter.length / union.size;
    const coverWide = wide.size === 0 ? 1 : inter.length / wide.size;

    table.push({
      关键词: kw,
      类型: note,
      宽表: String(wide.size),
      范式: String(norm.size),
      共有: String(inter.length),
      '仅宽表': String(onlyWide.length),
      '仅范式': String(onlyNorm.length),
      重合度: `${(jaccard * 100).toFixed(0)}%`,
      '宽表覆盖': `${(coverWide * 100).toFixed(0)}%`,
      '展示字段差异行': `${fc.rowDiff}/${fc.checked}`,
      耗时: `${wideMs}/${normMs}ms`,
      备注: wideErr || normErr || '',
    });
  }

  console.table(table);

  const totalJ = table.reduce((s, r) => s + parseFloat(r.重合度), 0) / table.length;
  console.log(`\n平均召回重合度：${totalJ.toFixed(1)}%`);
  console.log(
    `展示字段：比对 ${totalChecked} 行，差异 ${totalRowDiff} 行（${((totalRowDiff / Math.max(totalChecked, 1)) * 100).toFixed(1)}%）`,
  );
  if (Object.keys(allFieldDiff).length) {
    console.log('  分字段差异：', JSON.stringify(allFieldDiff));
  }
  if (allSamples.length) {
    console.log('  差异样本（前 6）：');
    allSamples.slice(0, 6).forEach((s) => console.log('    ', s));
  }
  console.log('\n口径说明：宽表过滤 status=1；范式过滤 产品+规格+品牌+product_brand 均启用');
  console.log('预期差异：宽表是写时同步的派生表，会陈旧/留孤儿行（范式实时 join 更准）');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('对拍失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});
