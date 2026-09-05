// 用范式实现整体替换 recallSkuRowsByKeyword（按函数边界精确匹配，避免误伤）
import fs from 'node:fs';

const FILE = 'backend/src/services/product/search.ts';
const src = fs.readFileSync(FILE, 'utf8');

const sig = 'export async function recallSkuRowsByKeyword(';
const start = src.indexOf(sig);
if (start === -1) {
  console.error('未找到函数签名');
  process.exit(1);
}
// 签名后第一个 { 开始函数体，做括号匹配找结束
let i = src.indexOf('{', src.indexOf(')', start));
if (i === -1) {
  console.error('未找到函数体起始');
  process.exit(1);
}
let depth = 0;
let j = i;
for (; j < src.length; j++) {
  if (src[j] === '{') depth += 1;
  else if (src[j] === '}') {
    depth -= 1;
    if (depth === 0) {
      j += 1;
      break;
    }
  }
}

const newFn = `export async function recallSkuRowsByKeyword(
  keyword: string,
  filterClause = '',
  filterParams: any[] = [],
  recallLimit = 500,
  _mergeLike = false,
): Promise<SkuRecallResult> {
  // 去宽表改造：范式召回
  //   —— 各表各列自建 FULLTEXT ngram 索引、多路召回后合并候选 specId，
  //      展示字段由 buildSkuRows 读时批量组装（详见 searchNormalized.ts）。
  //   原宽表实现（keywords 单列 FULLTEXT + LIKE 回退 + 逐行同步重建）
  //      已随 product_sku_search 宽表一并删除：宽表会陈旧、留孤儿行，
  //      且改一次品牌名需遍历该品牌全部 spec 重建（几十万行不可行）。
  //   filterClause 仅支持「空 / 仅 status 过滤」；其余过滤条件由调用方改用范式参数。
  const clause = filterClause.trim();
  const isStatusFilter = /^AND\\s+status\\s*=\\s*\\?$/i.test(clause);
  const statusOnly = isStatusFilter ? Number(filterParams[0]) === 1 : false;
  return recallSpecRowsNormalized(keyword, { statusOnly, recallLimit });
}`;

const out = src.slice(0, start) + newFn + src.slice(j);
fs.writeFileSync(FILE, out, 'utf8');
console.log('已替换 recallSkuRowsByKeyword：', j - start, '字符 →', newFn.length, '字符');
