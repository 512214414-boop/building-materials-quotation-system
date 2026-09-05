// v1.5.6 搜索打分纯函数单元测试（node:test + tsx 运行）
//
// 运行：npm test（backend/package.json scripts.test = "tsx --test tests/*.test.ts"）
// 覆盖边界情况：
//   - tokenizeKeyword：空白噪声、点号保留（规格匹配）、粘连数字
//   - segmentizeKeyword：乱序碎片、跨字段组合、分隔符、点号斜杠数字段
//   - scoreSkuByCustomWeights：完整关键词级 / 语义段级 / 2-gram 级 三层权重
//     规格点号匹配、乱序匹配、完全无关 → 0 分
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
  containedEitherWay,
  entryFieldMatches,
  entryAnyFieldMatches,
  searchNeedlesOrRaw,
  keywordContainsFullName,
  skuMatchesProductQuery,
  groupSkuRowsToProducts,
  type ScoreRow,
} from '../src/services/search-scoring.js';

// ============================================================
// helper：按真实 searchProducts 调用口径组装 tokens/segments 后打分
// ============================================================

function score(kw: string, row: Partial<ScoreRow>): number {
  const full: ScoreRow = {
    productName: row.productName ?? '',
    specModel: row.specModel ?? '',
    brandName: row.brandName ?? '',
    remark: row.remark ?? '',
    categoryName: row.categoryName ?? '给水管材',
  };
  return scoreSkuByCustomWeights(
    full,
    tokenizeKeyword(kw),
    segmentizeKeyword(kw),
    kw,
  );
}

// 常用测试产品（对应真实宽表行）
const DN25_GIVE_35 = { productName: 'ppr DN25给水管', specModel: 'en3.5', brandName: '日丰双层', remark: '' };
const DN25_GIVE_42 = { productName: 'ppr DN25给水管', specModel: 'en4.2', brandName: '日丰双层', remark: '' };
const DN25_GIVE_28 = { productName: 'ppr DN25给水管', specModel: 'en2.8', brandName: '伟星', remark: '' };
const DN25_WANT = { productName: 'ppr DN25×90度弯头', specModel: '通用', brandName: '日丰', remark: '' };
const DN25_NEISI = { productName: 'ppr DN25内丝弯头', specModel: '1/2丝（4分）', brandName: '伟星', remark: '' };
const DN25_UXING = { productName: 'ppr DN25U型内丝弯头', specModel: '1/2丝（4分）', brandName: '日丰', remark: '' };
const CI_XIN_25 = { productName: 'ppr DN25给水管', specModel: 'en4.2', brandName: '日丰瓷芯', remark: '' };

// ============================================================
// v2.0 产品级分组聚合（groupSkuRowsToProducts，纯函数，无 DB）
// ============================================================

function skuRow(over: Record<string, unknown>): any {
  return {
    type: 'sku',
    id: BigInt(1),
    productId: BigInt(1),
    productName: 'p',
    specId: BigInt(1),
    specModel: 's',
    categoryId: BigInt(1),
    categoryName: 'c',
    specBrandId: BigInt(1),
    brandId: BigInt(1),
    brandName: 'b',
    remark: '',
    productRemark: '',
    hitSupplierId: null,
    hitSupplierName: null,
    hitChannelTier: null,
    defaultUnitId: null,
    defaultUnitName: null,
    retailPrice: null,
    purchasePriceDefault: null,
    mainImageUrl: null,
    mainImageThumbUrl: null,
    status: 1,
    updateTime: new Date('2026-01-01'),
    ...over,
  };
}

test('groupSkuRowsToProducts：同 productId 多 SKU → 一行带 skuCount / brandCount', () => {
  const rows = [
    skuRow({ id: BigInt(1), productId: BigInt(100), brandId: BigInt(1) }),
    skuRow({ id: BigInt(2), productId: BigInt(100), brandId: BigInt(1) }),
    skuRow({ id: BigInt(3), productId: BigInt(100), brandId: BigInt(2) }),
  ];
  const products = groupSkuRowsToProducts(rows);
  assert.equal(products.length, 1);
  assert.equal(products[0].productId, BigInt(100));
  assert.equal(products[0].skuCount, 3);
  assert.equal(products[0].brandCount, 2);
});

test('groupSkuRowsToProducts：不同 productId → 多行', () => {
  const rows = [
    skuRow({ productId: BigInt(100) }),
    skuRow({ productId: BigInt(200) }),
  ];
  const products = groupSkuRowsToProducts(rows);
  assert.equal(products.length, 2);
});

test('groupSkuRowsToProducts：brandCount 只计不同 brandId', () => {
  const rows = [
    skuRow({ productId: BigInt(100), brandId: BigInt(1) }),
    skuRow({ productId: BigInt(100), brandId: BigInt(1) }),
    skuRow({ productId: BigInt(100), brandId: BigInt(5) }),
  ];
  const products = groupSkuRowsToProducts(rows);
  assert.equal(products[0].skuCount, 3);
  assert.equal(products[0].brandCount, 2);
});

test('groupSkuRowsToProducts：按 updateTime 降序', () => {
  const rows = [
    skuRow({ productId: BigInt(100), updateTime: new Date('2026-01-01') }),
    skuRow({ productId: BigInt(200), updateTime: new Date('2026-03-01') }),
    skuRow({ productId: BigInt(300), updateTime: new Date('2026-02-01') }),
  ];
  const products = groupSkuRowsToProducts(rows);
  assert.deepEqual(products.map((p) => Number(p.productId)), [200, 300, 100]);
});

// ============================================================
// tokenizeKeyword（ngram 2字符滑窗）
// ============================================================

test('tokenizeKeyword：空/纯空白输入返回空数组', () => {
  assert.deepEqual(tokenizeKeyword(''), []);
  assert.deepEqual(tokenizeKeyword('   '), []);
});

test('tokenizeKeyword：短查询（长度≤2）整体作为单个 token', () => {
  assert.deepEqual(tokenizeKeyword('弯'), ['弯']);
  assert.deepEqual(tokenizeKeyword('25'), ['25']);
});

test('tokenizeKeyword：中文+数字混合 ngram（伟星6分 → 3 个 token）', () => {
  assert.deepEqual(tokenizeKeyword('伟星6分'), ['伟星', '星6', '6分']);
});

test('tokenizeKeyword：v1.5.5 去空白——不产生 "r " / " d" 噪声 token', () => {
  const tokens = tokenizeKeyword('ppr dn25弯头');
  assert.ok(!tokens.includes('r '), '不应包含空白噪声 token "r "');
  assert.ok(!tokens.includes(' d'), '不应包含空白噪声 token " d"');
  assert.ok(tokens.includes('弯头'));
});

test('tokenizeKeyword：v1.5.5.1 保留点号——"3.5" 拆出 "3." 与 ".5"（规格关键字符）', () => {
  assert.deepEqual(tokenizeKeyword('3.5'), ['3.', '.5']);
});

test('tokenizeKeyword：粘连数字 "253.5"（DN25+3.5 省略写法）拆出有效 2-gram', () => {
  const tokens = tokenizeKeyword('253.5');
  assert.ok(tokens.includes('25'));
  assert.ok(tokens.includes('3.'));
  assert.ok(tokens.includes('.5'));
});

// ============================================================
// segmentizeKeyword（字符类型语义段切分）
// ============================================================

test('segmentizeKeyword：空输入返回空数组', () => {
  assert.deepEqual(segmentizeKeyword(''), []);
  assert.deepEqual(segmentizeKeyword('   '), []);
});

test('segmentizeKeyword：乱序碎片 "弯25" 切成中文+数字两段', () => {
  assert.deepEqual(segmentizeKeyword('弯25'), ['弯', '25']);
});

test('segmentizeKeyword：混合输入按字符类型切段', () => {
  assert.deepEqual(segmentizeKeyword('ppr25给水3.5'), ['ppr', '25', '给水', '3.5']);
});

test('segmentizeKeyword：丝口 "1/2丝" 斜杠归数字段', () => {
  assert.deepEqual(segmentizeKeyword('1/2丝'), ['1/2', '丝']);
});

test('segmentizeKeyword："-" 作分隔符，规格 "dn25-3.5" 拆三段', () => {
  assert.deepEqual(segmentizeKeyword('dn25-3.5'), ['dn', '25', '3.5']);
});

test('segmentizeKeyword："×" 作分隔符，弯头全名拆四段', () => {
  assert.deepEqual(segmentizeKeyword('DN25×90度弯头'), ['DN', '25', '90', '度弯头']);
});

test('segmentizeKeyword：纯数字点号段 "253.5" 保持一段（靠 2-gram 兜底）', () => {
  assert.deepEqual(segmentizeKeyword('253.5'), ['253.5']);
});

test('segmentizeKeyword：品牌+规格 "伟星6分" 按字符类型切段（数字与中文分离，2-gram "6分" 兜底）', () => {
  assert.deepEqual(segmentizeKeyword('伟星6分'), ['伟星', '6', '分']);
});

// ============================================================
// scoreSkuByCustomWeights —— 完整关键词级（v1.5.5）
// ============================================================

test('完整级：关键词完全等于产品名 → 最高分，高于仅"被包含"', () => {
  const exact = score('ppr DN25给水管', DN25_GIVE_35);
  const contained = score('DN25给水管', DN25_GIVE_35);
  assert.ok(exact > contained, `精确(${exact}) 应高于包含(${contained})`);
});

test('完整级：关键词被产品名顺序包含 → 高于仅碎片 2-gram 命中', () => {
  const contained = score('DN25给水管', DN25_GIVE_35);
  const fragmented = score('弯头', DN25_WANT); // 仅 2-gram 命中，无完整包含
  // 注：此断言验证"完整包含的产品"与"仅碎片产品"的相对关系在各自查询中合理——
  // 更直接：同一查询下，被完整包含的产品高于未被完整包含的产品
  const withFull = score('dn25内丝弯头', DN25_NEISI);
  const withoutFull = score('dn25内丝弯头', DN25_UXING); // U型在中间，顺序被破坏
  assert.ok(withFull > withoutFull, `裸内丝弯头(${withFull}) 应高于 U型(${withoutFull})`);
  void contained;
  void fragmented;
});

test('完整级：品牌完全匹配关键词（伟星）→ 品牌产品优先', () => {
  const brandHit = score('伟星', DN25_GIVE_28); // 伟星 品牌
  const brandMiss = score('伟星', DN25_GIVE_35); // 日丰双层
  assert.ok(brandHit > brandMiss, `品牌命中(${brandHit}) 应高于未命中(${brandMiss})`);
});

// ============================================================
// scoreSkuByCustomWeights —— 规格点号匹配（v1.5.5.1）
// ============================================================

test('规格点号：搜 "25给水3.5" → en3.5 规格产品高于 en4.2', () => {
  const spec35 = score('25给水3.5', DN25_GIVE_35);
  const spec42 = score('25给水3.5', DN25_GIVE_42);
  assert.ok(spec35 > spec42, `en3.5(${spec35}) 应高于 en4.2(${spec42})`);
});

test('规格点号：搜 "en3.5" → en3.5 精确匹配远高于 en3.6/en4.2', () => {
  const spec35 = score('en3.5', DN25_GIVE_35);
  const spec42 = score('en3.5', DN25_GIVE_42);
  assert.ok(spec35 > spec42, `en3.5(${spec35}) 应高于 en4.2(${spec42})`);
});

test('规格点号：纯规格 "3.5" → en3.5 高于 en2.8', () => {
  const spec35 = score('3.5', DN25_GIVE_35);
  const spec28 = score('3.5', DN25_GIVE_28);
  assert.ok(spec35 > spec28, `en3.5(${spec35}) 应高于 en2.8(${spec28})`);
});

// ============================================================
// scoreSkuByCustomWeights —— 语义段级松匹配（v1.5.6）
// ============================================================

test('段级：乱序 "弯25" → 弯头高于给水管（用户不按字段顺序输入）', () => {
  const want = score('弯25', DN25_WANT);
  const give = score('弯25', DN25_GIVE_35);
  assert.ok(want > give, `弯头(${want}) 应高于给水管(${give})`);
});

test('段级：粘连碎片 "253.5"（省略中间文字）→ DN25+en3.5 高于 DN25+en4.2', () => {
  const spec35 = score('253.5', DN25_GIVE_35);
  const spec42 = score('253.5', DN25_GIVE_42);
  assert.ok(spec35 > spec42, `en3.5(${spec35}) 应高于 en4.2(${spec42})`);
});

test('段级：跨字段组合 "25瓷芯" → 日丰瓷芯 DN25 高于日丰双层 DN25', () => {
  const cixin = score('25瓷芯', CI_XIN_25);
  const shuangceng = score('25瓷芯', DN25_GIVE_42); // 日丰双层
  assert.ok(cixin > shuangceng, `瓷芯(${cixin}) 应高于双层(${shuangceng})`);
});

test('段级：品牌+口径 "伟星25" → 伟星 DN25 高于日丰 DN25', () => {
  const wx = score('伟星25', DN25_GIVE_28);
  const rf = score('伟星25', DN25_GIVE_42);
  assert.ok(wx > rf, `伟星(${wx}) 应高于日丰(${rf})`);
});

test('段级：乱序 "内丝25" → 内丝弯头高于普通弯头（U型含内丝同样命中）', () => {
  const neisi = score('内丝25', DN25_NEISI);
  const plain = score('内丝25', DN25_WANT); // 无内丝
  assert.ok(neisi > plain, `内丝(${neisi}) 应高于普通弯头(${plain})`);
});

// ============================================================
// scoreSkuByCustomWeights —— 2-gram token 级跨字段（v1.5.5 保留）
// ============================================================

test('token 级：跨字段 "伟星6分"（品牌+俗称）→ 命中两项高于仅品牌', () => {
  const both = score('伟星6分', { ...DN25_GIVE_28, remark: '含6分' });
  const brandOnly = score('伟星6分', DN25_GIVE_28); // 无6分
  assert.ok(both > brandOnly, `两项命中(${both}) 应高于仅品牌(${brandOnly})`);
});

test('名称视图：俗称「6分管」命中，执行标准原文不在俗称字段则 0 分', () => {
  const alias = score('6分管', { ...DN25_GIVE_35, remark: '6分管' });
  const noAlias = score('6分管', DN25_GIVE_35);
  assert.ok(alias > 0, `俗称应命中(${alias})`);
  assert.equal(noAlias, 0);
  assert.equal(score('国标', DN25_GIVE_35), 0);
});

// ============================================================
// 完全不匹配 → 0 分（searchProducts 会过滤 score<=0 的行）
// ============================================================

test('无关输入 → 0 分（不会进入结果）', () => {
  assert.equal(score('电线电缆', DN25_GIVE_35), 0);
  assert.equal(score('xzyz', DN25_WANT), 0);
});

// ============================================================
// 包含与被包含（切档不改字）
// ============================================================

test('containedEitherWay：词比字段长也中', () => {
  assert.equal(containedEitherWay('伟星', '伟星ppr25国标'), true);
  assert.equal(containedEitherWay('伟星', '伟星'), true);
  assert.equal(containedEitherWay('日丰双层', '日丰'), true);
  assert.equal(containedEitherWay('金牛', '伟星ppr25国标'), false);
});

test('entryFieldMatches：混串切品牌/规格/执行标准都能中', () => {
  const q = '伟星ppr25国标';
  assert.equal(entryFieldMatches('伟星', q), true);
  assert.equal(entryFieldMatches('dn25*3.5', q), true);
  assert.equal(entryFieldMatches('国标 GB/T 18742.2', q), true);
  assert.equal(entryFieldMatches('金牛', q), false);
  assert.equal(entryFieldMatches('企标 Q/JN 01', q), false);
});

test('entryFieldMatches：产品名里写了规格字，切规格仍中', () => {
  assert.equal(entryFieldMatches('dn25', 'PPR给水管dn25伟星'), true);
  assert.equal(entryFieldMatches('dn25*3.5', 'ppr25水管'), true);
});

test('entryFieldMatches：客户电话尾号 / 混着姓名也能中', () => {
  assert.equal(entryFieldMatches('13812345678', '5678'), true);
  assert.equal(entryFieldMatches('13812345678', '张三5678'), true);
  assert.equal(entryAnyFieldMatches(['张三', '13812345678'], '5678'), true);
  assert.equal(entryAnyFieldMatches(['张三', '13812345678'], '工地'), false);
});

test('searchNeedlesOrRaw：单字姓名能召回，单位数尾号不召回', () => {
  assert.deepEqual(searchNeedlesOrRaw('王'), ['王']);
  assert.deepEqual(searchNeedlesOrRaw('8'), []);
  assert.ok(searchNeedlesOrRaw('5678').includes('5678'));
});

test('完整级：输入包含品牌字段 → 品牌仍得分（切档不删字）', () => {
  const mixed = score('伟星ppr25国标', {
    productName: 'ppr25水管',
    specModel: 'dn25*3.5',
    brandName: '伟星',
    remark: '国标 GB/T 18742.2',
  });
  const other = score('伟星ppr25国标', {
    productName: 'PVC排水管',
    specModel: '50',
    brandName: '金牛',
    remark: '企标',
  });
  assert.ok(mixed > 0, `混串应命中(${mixed})`);
  assert.ok(mixed > other, `伟星国标(${mixed}) 应高于金牛(${other})`);
});

test('混串：短数字规格「25」不得压过品牌伟星', () => {
  const wx = score('伟星ppr25国标', {
    productName: 'ppr DN25给水管',
    specModel: 'en3.5',
    brandName: '伟星绿',
    remark: '',
  });
  const numSpec = score('伟星ppr25国标', {
    productName: '测试组合乙15253',
    specModel: '25',
    brandName: '普通品牌',
    remark: '',
  });
  const named25 = score('伟星ppr25国标', {
    productName: '25',
    specModel: '通用',
    brandName: '普通品牌',
    remark: '',
  });
  assert.ok(wx > numSpec, `伟星绿(${wx}) 应高于规格=25 的测试行(${numSpec})`);
  assert.ok(wx > named25, `伟星绿(${wx}) 应高于品名=25 的行(${named25})`);
});

test('渠道档：完整渠道名不当作品牌去展开全部渠道', () => {
  const channels = ['金牛管业', '伟星管道', '华南管业'];
  assert.equal(keywordContainsFullName('金牛管业', channels), true);
  assert.equal(keywordContainsFullName('金牛', channels), false);
  assert.equal(keywordContainsFullName('伟星', channels), false);
  const jinniuSku = {
    productName: 'ppr25水管',
    specModel: 'dn25*3.5',
    brandName: '金牛',
    categoryName: '给水管',
  };
  assert.equal(skuMatchesProductQuery(jinniuSku, '金牛', channels), true);
  assert.equal(skuMatchesProductQuery(jinniuSku, '金牛管业', channels), false);
  assert.equal(skuMatchesProductQuery(jinniuSku, 'ppr25', channels), true);
  const weixingSku = { ...jinniuSku, brandName: '伟星' };
  assert.equal(skuMatchesProductQuery(weixingSku, '伟星', channels), true);
  assert.equal(skuMatchesProductQuery(weixingSku, '伟星管道', channels), false);
});
