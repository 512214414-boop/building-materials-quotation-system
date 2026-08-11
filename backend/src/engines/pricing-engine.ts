// v2.0 算价引擎（纯函数，前后端共用）
// 算价公式：
//   单行售价小计 = qty × unit_price - discount
//   成本小计 = unit_cost × cost_qty + freight
//   毛利 = 售价 - 成本
//
// v3.3 变更：删除 rounding_rule 引用（products 表已无该字段）

/** 四舍五入保留两位小数 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ============================================================
// v2.0 算价 API
// ============================================================

/**
 * 单行算价：小计 = 数量 × 单价 - 折扣
 * @param qty 数量
 * @param unitPrice 单价
 * @param discount 折扣金额（直减，非百分比）
 */
export function calcLineAmount(qty: number, unitPrice: number, discount: number = 0): number {
  const amount = Number(qty) * Number(unitPrice) - Number(discount);
  return round2(Math.max(0, amount));
}

/** quote_line 输入（用于整单算价） */
export interface QuoteLineForCalc {
  qty: number;
  unit_price: number;
  discount: number;
}

/**
 * 整单算价：汇总所有报价行
 * @returns totalAmount 总金额（折前合计）
 *         totalDiscount 总折扣
 *         payableAmount 应付金额（折后合计）
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

/**
 * 成本重算：成本小计 = 单位成本 × 成本数量 + 运费
 */
export function calcCostLine(unitCost: number, freight: number, qty: number): number {
  const amount = Number(unitCost) * Number(qty) + Number(freight);
  return round2(Math.max(0, amount));
}

/**
 * 毛利计算
 * @param lineAmount 行金额（售价）
 * @param costAmount 成本金额
 * @returns marginAmount 毛利额 = 售价 - 成本
 *         marginRate 毛利率(%) = 毛利额 / 售价 × 100
 */
export function calcMargin(lineAmount: number, costAmount: number) {
  const marginAmount = round2(Number(lineAmount) - Number(costAmount));
  const marginRate = lineAmount > 0 ? round2((marginAmount / Number(lineAmount)) * 100) : 0;
  return { marginAmount, marginRate };
}

// ============================================================
// v2.6 点位定价 + 整单算价（含税/不含税 + 整单优惠/抹零 + 开票开关）
// ============================================================

/**
 * v2.6 点位正算：售价 = 基准进价 × 点位
 */
export function calcUnitPriceFromPoint(basePrice: number, pricePoint: number): number {
  return round2(Number(basePrice) * Number(pricePoint));
}

/**
 * v2.6 点位反算：点位 = 售价 / 基准进价（basePrice 为 0 时返回 1）
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
 * v2.6 整单算价（前后端镜像，与前端 calcDocumentTotalV21 对齐）。
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

// ============================================================
// v1.7.0 库存加权平均进价（配货·成本推演方案 SSOT）
// 设计依据（《配货与成本核算推演方案.md》11.4）：
//   新加权平均进价 = (旧库存量 × 旧加权平均进价 + 本次入库量 × 本次入库采购单价) / (旧库存量 + 本次入库量)
//   结果保留两位小数（round2）；旧库存量为 0 时直接取本次入库采购单价。
//   内部出库不改变加权平均进价（出库单价 = 当前加权平均，快照写入流水）。
// 单一实现：后端 engines/pricing-engine.ts + 前端 shared/engines/pricing-engine.ts 双端一致。
// ============================================================

/**
 * v1.7.0 加权平均进价重算
 * @param oldQty 旧库存量
 * @param oldAvgCost 旧加权平均进价
 * @param inQty 本次入库量
 * @param inUnitCost 本次入库采购单价
 * @returns 新加权平均进价（round2；旧库存量为 0 时直接取本次入库采购单价）
 */
export function calcWeightedAvgCost(
  oldQty: number,
  oldAvgCost: number,
  inQty: number,
  inUnitCost: number,
): number {
  const oq = Number(oldQty);
  const oc = Number(oldAvgCost);
  const iq = Number(inQty);
  const ic = Number(inUnitCost);
  if (iq <= 0) return round2(oc);
  if (oq <= 0) return round2(ic);
  return round2((oq * oc + iq * ic) / (oq + iq));
}
