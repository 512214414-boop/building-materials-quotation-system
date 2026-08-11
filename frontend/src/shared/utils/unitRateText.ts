// unitRateText — 单位换算排序与逐级换算文本（共享工具，SSOT）
//
// 设计依据：表格设计理念「条目列表排序抽象」——所有枚举/多记录条目列表的排序
//   统一抽象为 sortable/sortBy/按字段值类型自动启用 sortMode + 逻辑锚点恒首位。
//   单位列表是典型落地：按换算率升序排列（基准单位换算率=1 恒排第一），
//   与录入先后顺序无关；换算显示按换算率大小逐级推导（一根多少米、一捆多少根）。
//
// 统一原则：单位列表排序与换算口语化文本全系统单点实现（本文件），
//   UnitDropdown / UnitManagePanel / UnitPriceExpandPanel 统一引用，禁止各组件本地重写排序/文本逻辑。

/** 按换算率升序排序（逻辑锚点恒首位：基准单位换算率=1 恒排第一，与录入顺序无关）
 *  无换算率（null/NaN）的单位恒定排最后（新增未录换算率的单位可见）
 */
export function sortUnitsByRate<T>(
  units: T[],
  getRate: (unit: T) => number | null,
): T[] {
  return [...units].sort((a, b) => {
    const ra = getRate(a);
    const rb = getRate(b);
    const aIsBase = ra != null && ra === 1;
    const bIsBase = rb != null && rb === 1;
    if (aIsBase && bIsBase) return 0;
    if (aIsBase) return -1; // 基准恒首
    if (bIsBase) return 1;
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1; // 无换算率排后
    if (rb == null) return -1;
    return ra - rb;
  });
}

/**
 * 逐级换算文本：每个单位相对「前一档较小换算率单位」描述（整除时），实现：
 *   米(×1)  → 一米            （基准单位）
 *   根(×3)  → 3米每根          （3÷1，相对基准）
 *   捆(×75) → 25根每捆         （75÷3，相对前一级「根」）
 * 与录入先后顺序无关，按换算率升序逐级推导（用户「按换算率大小逐级」指令）。
 * 返回 null 表示该单位无换算率（不显示）。
 */
export function buildRateChainText<T>(
  units: T[],
  getRate: (unit: T) => number | null,
  getUnitName: (unit: T) => string,
  target: T,
): string | null {
  const rate = getRate(target);
  if (rate == null) return null;
  const name = getUnitName(target);
  if (rate === 1) return `一${name}`;

  const rated = units
    .map((u) => ({ u, r: getRate(u) }))
    .filter((x): x is { u: T; r: number } => x.r != null && Number.isFinite(x.r))
    .sort((a, b) => a.r - b.r);

  // 前一级：比当前换算率小且最接近的单位（逐级上级）
  const prev = rated.findLast((x) => x.r < rate);
  if (prev && rate % prev.r === 0) {
    return `${rate / prev.r}${getUnitName(prev.u)}每${name}`;
  }
  // 不整除 → 相对基准单位描述
  const base = rated.find((x) => x.r === 1);
  if (base) return `${rate}${getUnitName(base.u)}每${name}`;
  return `${rate}每${name}`;
}
