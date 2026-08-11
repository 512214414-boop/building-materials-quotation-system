// v1.5.6 搜索打分纯函数模块（零依赖，可独立单元测试）
//
// 设计依据（唯一逻辑轴心：产品管理.md「品牌关键词优先排序规则」章节）：
//   搜索打分分三层，完整级 > 语义段级 > 2-gram 级：
//   1. 完整关键词级（v1.5.5）：用户输入的完整关键词与某字段 顺序一致/完全包含 → 权重最高
//   2. 语义段级（v1.5.6）：输入按字符类型切成语义段（中文/字母/数字），任一段在 keywords
//      全串包含即加分（段长 × 权重）——覆盖用户"想输哪个输哪个、不管字段不管顺序"的松输入
//   3. 2-gram token 级：跨字段碎片（如「伟星6分」）的命中累加，按字段 Tier 加权
//
// 本模块不依赖 prisma/数据库，scoreSkuByCustomWeights 接收已召回的宽表行数据，
// 召回（FULLTEXT / LIKE）与排序由 productService.searchProducts 负责。

// ============================================================
// 打分权重常量（业务自定义，非通用 BM25）
//   权重数值设计：
//     - 完整关键词级（v1.5.5 新增）：用户输入与字段顺序一致 / 完整包含时权重最高
//       （修复「精确命中/顺序一致却排在后面」问题——原实现仅按 ngram token 累加，
//        token 多不一定代表更匹配，如「ppr dn25弯头」vs「ppr dn25给水管」）
//     - token 级：跨字段查询（如「伟星6分」）的碎片命中累加
//     - Tier 间拉开数量级（8000 / 5000 / 4000 / 1500），同 Tier 内 exact > contains
//   完整级 > 段级 > 2-gram：完整包含优先，段级兜底乱序/跨字段碎片
// ============================================================

export const SCORE_FULL_BRAND_EXACT = 8000;           // Tier 1：品牌完整精确
export const SCORE_FULL_BRAND_CONTAINS = 5000;        // Tier 1：品牌完整包含（顺序保留）
export const SCORE_FULL_PRODUCT_NAME_EXACT = 7000;    // Tier 2：产品名完整精确
export const SCORE_FULL_PRODUCT_NAME_CONTAINS = 4000; // Tier 2：产品名完整包含（顺序保留）
export const SCORE_FULL_SPEC_EXACT = 6500;            // Tier 2：规格型号完整精确
export const SCORE_FULL_SPEC_CONTAINS = 3800;         // Tier 2：规格型号完整包含（顺序保留）
export const SCORE_FULL_REMARK_EXACT = 3000;          // Tier 3：备注完整精确
export const SCORE_FULL_REMARK_CONTAINS = 2000;       // Tier 3：备注完整包含（顺序保留）
export const SCORE_FULL_CATEGORY_EXACT = 2500;        // Tier 3：分类完整精确
export const SCORE_FULL_CATEGORY_CONTAINS = 1500;     // Tier 3：分类完整包含（顺序保留）

export const SCORE_BRAND_EXACT = 1000;          // Tier 1：品牌名完全匹配 token
export const SCORE_BRAND_CONTAINS = 500;        // Tier 1：品牌名包含 token
export const SCORE_PRODUCT_NAME_EXACT = 600;    // Tier 2：产品名完全匹配 token
export const SCORE_PRODUCT_NAME_CONTAINS = 300; // Tier 2：产品名包含 token
export const SCORE_SPEC_EXACT = 400;            // Tier 2：规格型号完全匹配 token
export const SCORE_SPEC_CONTAINS = 200;         // Tier 2：规格型号包含 token
export const SCORE_REMARK_EXACT = 200;          // Tier 3：备注完全匹配 token
export const SCORE_REMARK_CONTAINS = 100;       // Tier 3：备注包含 token
export const SCORE_CATEGORY_CONTAINS = 50;      // Tier 3：分类名包含 token

// v1.5.6：语义段级权重（用户自由输入任意字段/顺序/碎片）
//   每命中 1 个字符 +150（段长加权，长段信号更强）：
//   - "弯25" → 弯头(弯150+25 300) > 给水管(25 300)
export const SCORE_SEGMENT_PER_CHAR = 150;

/**
 * 拆分用户输入为 tokens（ngram 2字符滑窗 + 去重）
 * 设计依据：用户输入"伟星6分"无需空格，ngram 自动按 2 字符滑窗分词
 *   - "伟星6分" → ["伟星", "星6", "6分"]
 *   - "6分PPR" → ["6分", "分P", "PP", "PR"]
 *   - 单字符或短查询（长度≤2）直接作为单个 token
 * v1.5.5：先去除空白再分词，避免 "r " / " d" 这类空白噪声 token 污染打分
 * v1.5.5.1：保留点号——"3.5" 的点号是规格（en3.5）关键字符，不能按标点替换
 */
export function tokenizeKeyword(kw: string): string[] {
  const clean = kw.replace(/\s+/g, '');
  if (clean.length <= 2) return clean ? [clean] : [];
  const tokens = new Set<string>();
  for (let i = 0; i + 2 <= clean.length; i++) {
    tokens.add(clean.substring(i, i + 2));
  }
  return Array.from(tokens);
}

/**
 * v1.5.6：按字符类型切分语义段（用户不区分产品名/规格/品牌，想到哪输哪）
 *   - 连续中文、连续字母、连续数字（含点号/斜杠，如 3.5、1/2）各自成段，其他字符（×、- 等）作分隔
 *   - "弯25" → ["弯","25"]；"ppr25给水3.5" → ["ppr","25","给水","3.5"]；"1/2丝" → ["1/2","丝"]
 *   - "dn25-3.5" → ["dn","25","3.5"]（- 作分隔）；"253.5" → ["253.5"]（纯数字段，靠 2-gram 兜底）
 * 用途：段级松匹配——任一段在 keywords 全串包含即加分（段越长权重越高），
 *   覆盖"乱序碎片"（弯25 → 弯头）、"跨字段组合"（25瓷芯 → 日丰瓷芯 DN25）等自由输入
 */
export function segmentizeKeyword(kw: string): string[] {
  const clean = kw.replace(/\s+/g, '');
  const segments: string[] = [];
  let buf = '';
  let lastType = '';
  for (const ch of clean) {
    let t = '';
    if (/[\u4e00-\u9fa5]/.test(ch)) t = 'han';
    else if (/[a-zA-Z]/.test(ch)) t = 'alpha';
    else if (/[0-9./]/.test(ch)) t = 'digit';
    // 其他字符（×、- 等）仅作分隔符，不累积
    if (t !== lastType && buf) {
      segments.push(buf);
      buf = '';
    }
    if (t) {
      buf += ch;
      lastType = t;
    } else {
      lastType = '';
    }
  }
  if (buf) segments.push(buf);
  return segments;
}

/** v1.5.5：字段/关键词归一化（小写 + 去空白），用于完整关键词级匹配与 token 匹配 */
export function normText(s: string): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, '');
}

/** 宽表行中参与打分的字段（searchProducts 召回行 / 测试构造行） */
export interface ScoreRow {
  productName: string;
  specModel: string;
  brandName: string;
  remark: string;
  categoryName: string;
}

/**
 * 计算单个 SKU 的自定义打分
 * 业务规则：
 *   1. 完整关键词级（v1.5.5）：用户输入的完整关键词与某字段 顺序一致/完全包含 → 权重最高
 *      - field === kw → 完整精确；field.includes(kw) → 完整包含（顺序保留）
 *   2. 语义段级（v1.5.6）：输入按字符类型切成语义段（中文/字母/数字），任一段在 keywords
 *      全串包含即加分（段长 × 权重）——覆盖用户"想输哪个输哪个、不管字段不管顺序"的松输入
 *   3. 多 token 命中累加（"伟星6分"两个 token 都命中 > 单 token 命中）
 *   4. Tier 1 品牌命中权重最高（采购最关心品牌）
 *   5. Tier 2 产品名+规格型号组合匹配次之
 *   6. Tier 3 其他字段匹配累加较低权重
 *   7. 同分按 updateTime DESC（在排序时处理）
 */
export function scoreSkuByCustomWeights(
  row: ScoreRow,
  tokens: string[],
  segments: string[],
  rawKw: string,
): number {
  let score = 0;
  const brandLower = normText(row.brandName);
  const nameLower = normText(row.productName);
  const specLower = normText(row.specModel);
  const remarkLower = normText(row.remark);
  const catLower = normText(row.categoryName);
  // v1.5.6：keywords 全串（名称+规格+品牌+备注+分类），段级松匹配不区分字段
  const fullKeywords = normText(
    [row.productName, row.specModel, row.brandName, row.remark, row.categoryName].join(' '),
  );

  // v1.5.5：完整关键词级匹配（顺序一致/完全包含 → 最高权重）
  //   归一化（小写 + 去空白）后比较，兼容 "dn25 弯头" vs "dn25弯头" 等书写差异
  const kw = normText(rawKw);
  if (kw) {
    if (brandLower === kw) score += SCORE_FULL_BRAND_EXACT;
    else if (brandLower.includes(kw)) score += SCORE_FULL_BRAND_CONTAINS;

    if (nameLower === kw) score += SCORE_FULL_PRODUCT_NAME_EXACT;
    else if (nameLower.includes(kw)) score += SCORE_FULL_PRODUCT_NAME_CONTAINS;

    if (specLower === kw) score += SCORE_FULL_SPEC_EXACT;
    else if (specLower.includes(kw)) score += SCORE_FULL_SPEC_CONTAINS;

    if (remarkLower === kw) score += SCORE_FULL_REMARK_EXACT;
    else if (remarkLower.includes(kw)) score += SCORE_FULL_REMARK_CONTAINS;

    if (catLower === kw) score += SCORE_FULL_CATEGORY_EXACT;
    else if (catLower.includes(kw)) score += SCORE_FULL_CATEGORY_CONTAINS;
  }

  // v1.5.6：语义段级松匹配（用户"想输哪个输哪个、不管字段不管顺序"）
  //   每个语义段（中文/字母/数字段）在 keywords 全串包含即加分，段长 × 权重
  //   覆盖：乱序碎片（"弯25"→弯头）、跨字段组合（"25瓷芯"→日丰瓷芯DN25）、
  //         省略中间文字（"253.5"→"25"+"3.5" 靠段+2-gram 兜底）
  for (const seg of segments) {
    const segLower = seg.toLowerCase();
    if (segLower && fullKeywords.includes(segLower)) {
      score += seg.length * SCORE_SEGMENT_PER_CHAR;
    }
  }

  for (const token of tokens) {
    const tokLower = token.toLowerCase();
    // Tier 1：品牌命中（采购最关心品牌，权重最高）
    if (brandLower === tokLower) score += SCORE_BRAND_EXACT;
    else if (brandLower.includes(tokLower)) score += SCORE_BRAND_CONTAINS;

    // Tier 2：产品名+规格型号组合匹配
    if (nameLower === tokLower) score += SCORE_PRODUCT_NAME_EXACT;
    else if (nameLower.includes(tokLower)) score += SCORE_PRODUCT_NAME_CONTAINS;

    if (specLower === tokLower) score += SCORE_SPEC_EXACT;
    else if (specLower.includes(tokLower)) score += SCORE_SPEC_CONTAINS;

    // Tier 3：备注俗称（如「6分管」是用户记忆习惯）
    if (remarkLower === tokLower) score += SCORE_REMARK_EXACT;
    else if (remarkLower.includes(tokLower)) score += SCORE_REMARK_CONTAINS;

    // Tier 3：分类名
    if (catLower.includes(tokLower)) score += SCORE_CATEGORY_CONTAINS;
  }
  return score;
}

// ============================================================
// v1.7.0 名称检索打分（配货来源：内部仓库 / 外部供应商 共用）
// 设计依据（《配货与成本核算推演方案.md》6.1）：配货来源输入框共用全局检索打分逻辑，
//   完全匹配 ＞ 前缀 ＞ 词组包含 ＞ 零散关键词，与产品检索（scoreSkuByCustomWeights）
//   同一套打分精神、同一套基础函数（tokenizeKeyword / segmentizeKeyword / normText）。
// 双端 SSOT：backend/src/services/search-scoring.ts + frontend/src/shared/utils/search-scoring.ts，
//   修改必须双端同步。
// ============================================================

/** v1.7.0 名称完整关键词级权重 */
export const SCORE_NAME_FULL_EXACT = 8000;    // 完整精确
export const SCORE_NAME_FULL_PREFIX = 5200;   // 完整前缀（顺序一致的开头命中）
export const SCORE_NAME_FULL_CONTAINS = 4000; // 完整包含（词组包含，顺序保留）
/** v1.7.0 名称 token 级权重 */
export const SCORE_NAME_TOKEN_EXACT = 1000;   // token 完全匹配
export const SCORE_NAME_TOKEN_PREFIX = 600;   // token 前缀
export const SCORE_NAME_TOKEN_CONTAINS = 300; // token 包含

/**
 * v1.7.0 名称打分（配货来源检索）
 * 业务规则（与 scoreSkuByCustomWeights 同构）：
 *   1. 完整关键词级：name === kw → 完整精确；name.startsWith(kw) → 完整前缀；
 *      name.includes(kw) → 完整包含（顺序保留）
 *   2. 语义段级：任一段在名称全串包含即加分（段长 × SCORE_SEGMENT_PER_CHAR）
 *   3. 2-gram token 级：token 完全匹配 > 前缀 > 包含
 */
export function scoreNameByWeights(
  name: string,
  tokens: string[],
  segments: string[],
  rawKw: string,
): number {
  let score = 0;
  const nameLower = normText(name);
  const kw = normText(rawKw);
  if (kw) {
    if (nameLower === kw) score += SCORE_NAME_FULL_EXACT;
    else if (nameLower.startsWith(kw)) score += SCORE_NAME_FULL_PREFIX;
    else if (nameLower.includes(kw)) score += SCORE_NAME_FULL_CONTAINS;
  }
  for (const seg of segments) {
    const segLower = seg.toLowerCase();
    if (segLower && nameLower.includes(segLower)) {
      score += seg.length * SCORE_SEGMENT_PER_CHAR;
    }
  }
  for (const token of tokens) {
    const tokLower = token.toLowerCase();
    if (nameLower === tokLower) score += SCORE_NAME_TOKEN_EXACT;
    else if (nameLower.startsWith(tokLower)) score += SCORE_NAME_TOKEN_PREFIX;
    else if (nameLower.includes(tokLower)) score += SCORE_NAME_TOKEN_CONTAINS;
  }
  return score;
}

// ============================================================
// v11.9 档案相似度（快速建档候选匹配，纯函数可单测）
// 设计依据（采购报价.md 4.6.4 匹配度算法 / 用户反馈）：
//   用户口语输入与标准档案全名存在「乱序 + 长短差异 + 字段混合」：
//     输入「ppr伟星绿色25给水管」（想到什么说什么，规格值混进产品名）
//     档案「ppr DN25给水管 伟星绿 en4.2」（productName+specModel+brandName 拼接）
//   纯编辑距离对乱序/长短差异不友好（该例相似度约 0.5，达不到候选阈值 0.6）→
//   以「语义段覆盖率」为主、编辑距离/完整包含兜底：
//     1. 语义段覆盖率：segmentizeKeyword 把输入按字符类型切段（中文/字母/数字），
//        段在档案全名「子序列命中（容错 1 字符）」即算中，命中段总长 / 输入段总长；
//        仅当命中段数 ≥ 2 才启用覆盖率（单段命中会候选泛滥，如「水管」命中所有水管档案）
//     2. 编辑距离相似度 / 完整包含比例兜底（连续整串信号）
// 对齐检索打分（scoreSkuByCustomWeights）的「语义段松匹配」精神，但输出归一为 0~1
//   匹配度供前端候选展示（QuickCreateConfirmDialog 匹配度着色）。
// ============================================================

/** v11.9 档案相似度（0~1）：输入俗语 vs 档案全名（productName+specModel+brandName） */
export function archiveMatchScore(input: string, fullName: string): {
  score: number;
  hitSegments: number;
} {
  const a = normText(input);
  const b = normText(fullName);
  if (a === b) return { score: 1, hitSegments: 0 };
  if (!a || !b) return { score: 0, hitSegments: 0 };

  const segs = segmentizeKeyword(a);
  const totalLen = segs.reduce((s, x) => s + x.length, 0);
  let hitLen = 0;
  let hitCount = 0;
  for (const seg of segs) {
    if (isSegmentHitLoose(seg, b)) {
      hitLen += seg.length;
      hitCount++;
    }
  }
  // 多段命中才启用段覆盖率（单段命中会候选泛滥，如「水管」命中所有水管档案）
  const segCoverage = hitCount >= 2 && totalLen > 0 ? hitLen / totalLen : 0;
  // 2-gram token 覆盖率：处理中文连写不分词（「伟星水管」被切为单段 → 段覆盖率禁用，
  // 但 [伟星,星水,水管] 中「伟星」「水管」在档案全名命中 → 碎片命中率兜底）
  const tokens = tokenizeKeyword(a);
  const tokenHits =
    tokens.length > 0
      ? tokens.filter((t) => t.length > 0 && b.includes(t)).length / tokens.length
      : 0;
  // 连续整串信号兜底：编辑距离相似度 / 完整包含比例
  const editSim = editDistanceSim(a, b);
  const containSim = a.length <= b.length && b.includes(a) ? a.length / b.length : 0;
  return { score: Math.max(segCoverage, tokenHits, editSim, containSim), hitSegments: hitCount };
}

/**
 * v11.9 段「子序列命中（容错）」：
 *   全串包含 → 命中；否则按字符顺序做 LCS（子序列）。
 *   段长 ≥ 3 容忍差 1 字符（「伟星绿色」vs 档案「伟星绿」）；
 *   段长 ≤ 2 必须全部命中（「25」不能因 dn32 里的 2 误命中）。
 */
function isSegmentHitLoose(seg: string, full: string): boolean {
  if (!seg) return false;
  if (full.includes(seg)) return true;
  if (seg.length < 3) return false;
  let i = 0;
  for (let j = 0; j < full.length && i < seg.length; j++) {
    if (seg[i] === full[j]) i++;
  }
  return i >= seg.length - 1;
}

/** 字符级编辑距离相似度 = 1 - 编辑距离 / 最长长度 */
function editDistanceSim(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return 1 - dp[b.length] / Math.max(a.length, b.length);
}
