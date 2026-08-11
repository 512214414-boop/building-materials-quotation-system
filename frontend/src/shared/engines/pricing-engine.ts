// v2.0 算价引擎（前端镜像，与后端 backend/src/engines/pricing-engine.ts 保持一致）

export type RoundingRule = 'ceil' | 'round' | 'floor';

/** 四舍五入保留两位小数 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 按取整规则对单价取整（建材按元取整） */
export function roundPrice(price: number, rule: RoundingRule): number {
  if (rule === 'ceil') return Math.ceil(price);
  if (rule === 'floor') return Math.floor(price);
  return Math.round(price);
}

/**
 * 基准价 + 利润点位 => 实际单价。
 */
export function applyMargin(basePrice: number, marginPoint: number, rule: RoundingRule): number {
  const raw = Number(basePrice) * (1 + Number(marginPoint) / 100);
  return roundPrice(raw, rule);
}

/**
 * 单行算价：小计 = 数量 × 单价 - 折扣
 */
export function calcLineAmount(qty: number, unitPrice: number, discount: number = 0): number {
  const amount = Number(qty) * Number(unitPrice) - Number(discount);
  return round2(Math.max(0, amount));
}

export interface QuoteLineForCalc {
  qty: number;
  unit_price: number;
  discount: number;
}

/**
 * 整单算价：汇总所有报价行
 */
export function calcDocumentTotal(quoteLines: QuoteLineForCalc[]) {
  let totalAmount = 0;
  let totalDiscount = 0;
  for (const line of quoteLines) {
    totalAmount += round2(Number(line.qty) * Number(line.unit_price));
    totalDiscount += Number(line.discount);
  }
  totalAmount = round2(totalAmount);
  totalDiscount = round2(totalDiscount);
  const payableAmount = round2(Math.max(0, totalAmount - totalDiscount));
  return { totalAmount, totalDiscount, payableAmount };
}

// ============================================================
// v2.1 点位定价 + 整单算价（含税/不含税 + 整单优惠/抹零）
// ============================================================

/**
 * v2.1 点位正算：售价 = 基准进价 × 点位
 */
export function calcUnitPriceFromPoint(basePrice: number, pricePoint: number): number {
  return round2(Number(basePrice) * Number(pricePoint));
}

/**
 * v2.1 点位反算：点位 = 售价 / 基准进价（basePrice 为 0 时返回 1）
 */
export function calcPricePointFromUnit(basePrice: number, unitPrice: number): number {
  if (Number(basePrice) <= 0) return 1;
  return Math.round((Number(unitPrice) / Number(basePrice) + Number.EPSILON) * 10000) / 10000;
}

export interface QuoteLineForCalcV21 {
  qty: number;
  unitPrice: number;
  discount: number;
}

/**
 * v2.6 整单算价（与后端 pricing-engine.calcDocumentTotalV21 对齐）。
 *
 * 算价链路：
 *  - subtotal = Σ(qty * unit_price - discount)
 *  - 计税基数 = subtotal - orderDiscount - roundOff
 *  - 不开票(needInvoice=false)：taxAmount = 0，total = 计税基数（正常订单金额）
 *  - 不含税：taxAmount = 计税基数 * tax_rate / 100，total = 计税基数 + taxAmount
 *  - 含税：taxAmount = 计税基数 * tax_rate / (100 + tax_rate)，total = 计税基数
 */
export function calcDocumentTotalV21(
  quoteLines: QuoteLineForCalcV21[],
  options: {
    orderDiscount: number;
    roundOff: number;
    taxRate: number;
    taxInclusive: boolean;
    needInvoice: boolean;
  },
) {
  let subtotal = 0;
  for (const line of quoteLines) {
    subtotal += calcLineAmount(Number(line.qty), Number(line.unitPrice), Number(line.discount));
  }
  subtotal = round2(subtotal);

  const orderDiscount = Number(options.orderDiscount);
  const roundOff = Number(options.roundOff);
  const taxRate = Number(options.taxRate);

  const taxableBase = round2(Math.max(0, subtotal - orderDiscount - roundOff));

  let taxAmount = 0;
  let total = 0;
  // v2.6：不开票不算税
  if (!options.needInvoice) {
    taxAmount = 0;
    total = taxableBase;
  } else if (options.taxInclusive) {
    taxAmount = round2((taxableBase * taxRate) / (100 + taxRate));
    total = taxableBase;
  } else {
    taxAmount = round2((taxableBase * taxRate) / 100);
    total = round2(taxableBase + taxAmount);
  }

  return {
    subtotal,
    orderDiscount,
    roundOff,
    taxAmount,
    total,
    payable: total,
  };
}

/**
 * 成本重算：成本小计 = 单位成本 × 成本数量 + 运费
 */
export function calcCostLine(unitCost: number, freight: number, qty: number): number {
  const amount = Number(unitCost) * Number(qty) + Number(freight);
  return round2(Math.max(0, amount));
}

/**
 * 毛利计算
 */
export function calcMargin(lineAmount: number, costAmount: number) {
  const marginAmount = round2(Number(lineAmount) - Number(costAmount));
  const marginRate = lineAmount > 0 ? round2((marginAmount / Number(lineAmount)) * 100) : 0;
  return { marginAmount, marginRate };
}

// ============================================================
// v1.5.6.3 单位换算价格推算（统一实现，全链路共用）
//
// 设计依据（产品管理.md「售价/进价明细面板」章节 + 用户「不同单位的售价推算显示
// 要覆盖所有地方」指令）：产品数据最终都会被订单/协同工作台使用，用户切换单位
// 不落库，但没录的单位价格按「基准单位已录价格 × 目标单位换算率」推算是合理且
// 必要的。推算仅用于展示与带出，不写库；用户可在价格明细面板录入真实价覆盖。
//
// 统一原则：列表售价/进价列、编辑弹窗价格明细面板、订单选品带价共用本函数，
// 禁止各处在本地重写推算公式（防打补丁·单一信息源）。
// ============================================================

/**
 * 推算价：基准价 × 目标单位换算率（保留两位小数）
 * 返回 null 表示无法推算（价格非法 / 换算率非法或 ≤0）
 */
export function calcDerivedUnitPrice(basePrice: number, targetRate: number): number | null {
  const bp = Number(basePrice);
  const rate = Number(targetRate);
  if (!isFinite(bp) || bp <= 0 || !isFinite(rate) || rate <= 0) return null;
  return round2(bp * rate);
}

// ============================================================
// v1.5.6.3 单位价格显示回退链（售价/进价列共用，SSOT）
//
// 统一回退链（用户「不同单位的售价推算显示要覆盖所有地方」指令）：
//   ① 当前单位已录默认价 → 直接用
//   ② 未录 → 基准单位(换算率=1)已录默认价 × 当前单位换算率 推算（不写库）
//   ③ 均不可得 → fallback（宽表默认单位参考价）
// 推算公式统一走 calcDerivedUnitPrice（本引擎，禁止本地重写）。
//
// 产品管理列表售价/进价列、编辑弹窗单位行售价/进价显示均复用本函数，
// 差异仅通过参数注入（conversionRates / pickPrice / fallback）。
// ============================================================

export interface ResolveUnitPriceParams {
  /** 当前单位索引（在单位数组中的下标） */
  currentUnitIdx: number;
  /** 各单位换算率（索引与单位数组对齐，基准单位=1，无换算率=null） */
  conversionRates: Array<number | null>;
  /** 取某单位默认价（返回 null 表示该单位未录默认价） */
  pickPrice: (unitIdx: number) => number | null;
  /** 宽表兜底参考价（①②均不可得时返回） */
  fallback?: number | null;
}

export interface ResolveUnitPriceResult {
  /** 显示价格（null 表示无任何价格可得） */
  price: number | null;
  /** 是否为推算价（区别于已录价，UI 弱化显示） */
  derived: boolean;
}

export function resolveUnitPriceDisplay({
  currentUnitIdx,
  conversionRates,
  pickPrice,
  fallback = null,
}: ResolveUnitPriceParams): ResolveUnitPriceResult {
  if (currentUnitIdx < 0) {
    return { price: fallback, derived: false };
  }
  // ① 当前单位已录默认价
  const direct = pickPrice(currentUnitIdx);
  if (direct != null) return { price: direct, derived: false };

  // ② 推算：基准单位(换算率1)已录默认价 × 当前单位换算率
  const currentRate = conversionRates[currentUnitIdx];
  if (currentRate != null && currentRate !== 1) {
    const baseIdx = conversionRates.findIndex((r) => r === 1);
    if (baseIdx >= 0) {
      const basePrice = pickPrice(baseIdx);
      if (basePrice != null) {
        const derivedPrice = calcDerivedUnitPrice(basePrice, currentRate);
        if (derivedPrice != null) return { price: derivedPrice, derived: true };
      }
    }
  }

  // ③ 宽表兜底（默认单位参考价）
  return { price: fallback, derived: false };
}
