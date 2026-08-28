// v2.0 请求体验证 schemas + 分页/排序解析

import { z } from 'zod';

// ============================================================
// 分页与排序（保留 v1.0 通用函数）
// ============================================================

/**
 * 从查询参数解析分页信息。
 * 默认 page=1, pageSize=20, 最大 100。
 */
export function parsePagination(query: Record<string, unknown>) {
  const rawPage = Number(query.page);
  const rawSize = Number(query.pageSize ?? query.size);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  let pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 20;
  if (pageSize > 100) pageSize = 100;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

/**
 * 解析排序字段。
 * defaultSort 为必填：调用方必须按目标 Prisma 模型的字段命名风格显式传入
 * （v5.0 product_* / brands 等模型用 camelCase；documents / document_lines 等遗留模型用 snake_case）。
 */
export function parseSort(
  query: Record<string, unknown>,
  allowed: string[],
  defaultSort: { field: string; order: 'asc' | 'desc' },
) {
  const field = typeof query.sortBy === 'string' ? query.sortBy : defaultSort.field;
  const orderRaw = typeof query.sortOrder === 'string' ? query.sortOrder.toLowerCase() : '';
  const order: 'asc' | 'desc' =
    orderRaw === 'asc' ? 'asc' : orderRaw === 'desc' ? 'desc' : defaultSort.order;
  if (!allowed.includes(field)) {
    return { [defaultSort.field]: defaultSort.order } as Record<string, 'asc' | 'desc'>;
  }
  return { [field]: order } as Record<string, 'asc' | 'desc'>;
}

/** 解析 URL 参数中的 BigInt ID */
export function parseBigIntParam(v: string | undefined, field = 'id'): bigint {
  if (!v) throw new Error(`${field} 不能为空`);
  const n = BigInt(v);
  if (n <= 0n) throw new Error(`${field} 必须为正整数`);
  return n;
}

// ============================================================
// 枚举（与 Prisma schema 同步）
// ============================================================

export const documentStatusEnumSchema = z.enum([
  'demand_pending',
  'quote_confirmed',
  'payment_settled',
  'allocation_in_progress',
  'delivery_completed',
  'cost_verified',
  'after_sales',
  'archived',
]);

export const quoteStatusSchema = z.enum(['pending', 'quoted', 'locked']);

export const paymentTypeSchema = z.enum(['deposit', 'final', 'balance']);

export const reconcileStatusSchema = z.enum(['pending', 'reconciled']);

export const deliveryMethodSchema = z.enum([
  'self_pickup',
  'haulage',
  'special_van',
  'logistics',
  'site_delivery',
]);

export const deliveryStatusSchema = z.enum(['pending', 'shipped', 'signed']);

export const costChannelTypeSchema = z.enum(['warehouse', 'supplier']);

export const refundTypeSchema = z.enum(['refund', 'exchange']);

export const supplierTypeSchema = z.enum(['external', 'warehouse']);

export const allocationPendingStatusSchema = z.enum(['allocated', 'pending']);

export const productStatusSchema = z.enum(['active', 'inactive', 'archived']);

export const supplierStatusSchema = z.enum(['active', 'inactive']);

// v3.3：roundingRule 枚举已删除（products 表不再有 rounding_rule 字段）

// ============================================================
// 准入（公开接口）
// ============================================================

export const gateVerifySchema = z.object({
  authCode: z.string().min(1, '授权码不能为空'),
  phone: z.string().min(1).max(200).regex(/^[A-Za-z0-9_+\-.]+$/, '登录账号只能是电话或微信字符'),
  customerName: z.string().min(1).max(100).optional(),
});

export const accessRequestSchema = z.object({
  phone: z.string().min(1).max(200).regex(/^[A-Za-z0-9_+\-.]+$/, '登录账号只能是电话或微信字符'),
  customerName: z.string().min(1).max(100),
  note: z.string().max(500).optional(),
});

// ============================================================
// 单据主表与物料行
// ============================================================

// v10.35：标题可选（单据编号自动生成 YY-MM-DD-序号，作为唯一标识）
// 客户可选、备注可选，均可后续补充
export const documentCreateSchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  title: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  customerContactMethod: z.string().max(50).optional(),
  customerPhone: z.string().max(200).optional(),
  // 初始物料行（可选，也可后续单独添加）
  lines: z
    .array(
      z.object({
        // v14.0：规格变体 ID（物理 NOT NULL，缺失后端兜底 0=未关联规格）
        // 与 productId 同为 BigInt 字段：bigint 转换防精度丢失 + nonnegative 允许兜底 0 + nullable 允许清空
        specId: z.coerce.bigint().nonnegative().nullable().optional(),
        // snowflake 大数：必须 bigint 转换防精度丢失（同 documentLineCreateSchema）
        productId: z.coerce.bigint().positive().optional(),
        productRef: z.string().min(1).max(500),
        spec: z.string().max(500).optional(),
        unit: z.string().min(1).max(50),
        qty: z.coerce.number().positive(),
        remark: z.string().max(500).optional(),
      }),
    )
    .optional(),
});

/**
 * 快速新建客户：手机号+姓名必填，其余可选。
 * v2.9 增加建材行业档案字段（customerType/discountRate/invoiceInfo），
 *      v1.7.1 移除分级 customer_level（价格灵活，分级无业务决策价值）。
 *      快速新建场景默认留空，档案页可后续完善。
 */
export const customerQuickAddSchema = z.object({
  // v2.10 phone 改为可选（可空+有值唯一），phone/name 至少填一个
  phone: z.string().max(20).optional(),
  name: z.string().max(100).optional(),
  wechat: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  note: z.string().optional(),
  // v25 客户类型字典名称
  customerType: z.string().max(50).optional(),
  discountRate: z.coerce.number().min(0).max(100).optional(),
  invoiceInfo: z.record(z.string(), z.unknown()).optional(),
  contacts: z.array(z.object({
    name: z.string().max(100).optional(),
    method: z.string().max(50).optional(),
    value: z.string().max(200).regex(/^[A-Za-z0-9_+\-.]*$/, '联系方式只能是电话或微信字符').optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
  invoices: z.array(z.object({
    invoiceTitle: z.string().max(200).optional(),
    taxNumber: z.string().max(50).optional(),
    bankName: z.string().max(100).optional(),
    bankAccount: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    phone: z.string().max(30).optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
}).refine(
  (data) =>
    (data.phone && data.phone.trim()) ||
    (data.name && data.name.trim()) ||
    (Array.isArray(data.contacts) && data.contacts.some((c) => (c.value && c.value.trim()) || (c.name && c.name.trim()))),
  { message: '姓名与联系方式至少填一个（避免空档案）' },
);

/**
 * v2.9 更新客户档案 schema：支持全字段更新，包括 phone（变动五联动核心）。
 * v2.10 phone 可选可空；phone 变更时由 service 层校验 unique；customerCode 不可变，不接受此字段。
 * v1.7.1 移除分级 customer_level。
 */
export const customerUpdateSchema = z.object({
  // v2.10 phone 可选，允许传空字符串清空（service 层处理 null 与空字符串）
  phone: z.string().max(20).optional(),
  name: z.string().max(100).optional(),
  wechat: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  note: z.string().optional(),
  status: z.enum(['active', 'disabled']).optional(),
  customerType: z.string().max(50).optional(),
  discountRate: z.coerce.number().min(0).max(100).optional(),
  invoiceInfo: z.record(z.string(), z.unknown()).optional(),
  contacts: z.array(z.object({
    name: z.string().max(100).optional(),
    method: z.string().max(50).optional(),
    value: z.string().max(200).regex(/^[A-Za-z0-9_+\-.]*$/, '联系方式只能是电话或微信字符').optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
  invoices: z.array(z.object({
    invoiceTitle: z.string().max(200).optional(),
    taxNumber: z.string().max(50).optional(),
    bankName: z.string().max(100).optional(),
    bankAccount: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    phone: z.string().max(30).optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
});

export const documentUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  /** 单据日期（展示为抬头「日期」，写入 created_at 的日期部分，时分秒保留原值或中午） */
  createdAt: z.string().max(50).optional(),
  lockVersion: z.coerce.number().int().min(0).optional(),
});

/**
 * v2.1 单据业务字段更新 schema。
 * 用于 PATCH /api/staff/documents/:id/business
 * 更新销售员/地址/税率/整单优惠/抹零等业务打印字段，与 updateDocument（标题/备注）分离。
 */
export const documentBusinessUpdateSchema = z.object({
  // v2.6：允许后续补/改客户（传 0 或 null 清空客户）
  customerId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  customerContactMethod: z.string().max(50).optional().nullable(),
  customerPhone: z.string().max(200).optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  salespersonId: z.coerce.number().int().positive().optional(),
  deliveryAddress: z.string().max(500).optional(),
  contactPhone: z.string().max(50).optional(),
  expectedDeliveryDate: z.string().max(50).optional(),
  validUntil: z.string().max(50).optional(),
  paymentTerms: z.string().max(200).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  taxInclusive: z.boolean().optional(),
  orderDiscountAmount: z.coerce.number().min(0).optional(),
  roundOffAmount: z.coerce.number().min(0).optional(),
  orderDiscountRemark: z.string().max(500).optional(),
  needInvoice: z.boolean().optional(),
});

export const documentStatusTransitionSchema = z.object({
  status: documentStatusEnumSchema,
  lockVersion: z.coerce.number().int().min(0).optional(),
  reason: z.string().max(500).optional(),
});

/**
 * v3.3 单据行创建 schema。
 * 关联产品（productId）、单位（unitId，无FK快照）。
 * 冗余快照字段（specModel/categoryId/thumbnailUrl/imageUrls）由前端选品时透传，
 * 打印/展示不依赖档案当前状态。
 */
export const documentLineCreateSchema = z.object({
  // v14.0：规格变体 ID（物理 NOT NULL，缺失后端兜底 0=未关联规格）
  // 与 productId 同为 BigInt 字段：bigint 转换防精度丢失 + nonnegative 允许兜底 0 + nullable 允许清空
  specId: z.coerce.bigint().nonnegative().nullable().optional(),
  // v8.0：brandId（关联品牌 brand）
  brandId: z.coerce.number().int().positive().optional(),
  // v8.0：productId（关联 SPU product，用于获取 categoryId）
  // 注意：product.id 为 19 位 snowflake 大数（> Number.MAX_SAFE_INTEGER），
  // 必须 bigint 转换防精度丢失（z.coerce.number 会截断导致 FK 查不到 500）
  productId: z.coerce.bigint().positive().nullable().optional(),
  // v8.0：unitId（FK → unit.id，可空）
  unitId: z.coerce.number().int().positive().optional(),
  // 允许空串：「下方插入」落一条待填空行；页底空行仍由前端拦住不提交
  productRef: z.string().max(500),
  productName: z.string().max(200).nullable().optional(),
  brandName: z.string().max(100).nullable().optional(),
  // v8.0：规格型号快照（前端选品时透传，下单时锁定，来自 SPU.specModel）
  spec: z.string().max(500).optional(),
  unit: z.string().min(1).max(50),
  categoryId: z.coerce.number().int().positive().optional(),
  thumbnailUrl: z.string().max(500).optional(),
  imageUrls: z.array(z.string()).optional(),
  qty: z.coerce.number().positive(),
  /** 员工可写售价；客户端控制器会剥离此字段 */
  unitPrice: z.coerce.number().min(0).optional(),
  lineDiscount: z.coerce.number().min(0).optional(),
  remark: z.string().max(500).optional(),
  rawDescription: z.string().max(500).optional(),
  rawUnit: z.string().max(50).optional(),
  isStandardized: z.boolean().optional(),
  /** 插入位置（1-based seq）；省略则追加末尾 */
  insertSeq: z.coerce.number().int().positive().optional(),
});

export const documentLineUpdateSchema = z.object({
  // v14.0：规格变体 ID（物理 NOT NULL，缺失后端兜底 0=未关联规格）
  // 与 productId 同为 BigInt 字段：bigint 转换防精度丢失 + nonnegative 允许兜底 0 + nullable 允许清空
  specId: z.coerce.bigint().nonnegative().nullable().optional(),
  // v8.0：brandId（关联品牌 brand）
  brandId: z.coerce.number().int().positive().nullable().optional(),
  // v8.0：productId（关联 SPU product）
  // snowflake 大数：必须 bigint 转换防精度丢失（同 documentLineCreateSchema）
  productId: z.coerce.bigint().positive().nullable().optional(),
  // v8.0：unitId（FK → unit.id，可空；null=清空）
  unitId: z.coerce.number().int().positive().nullable().optional(),
  productRef: z.string().min(1).max(500).optional(),
  productName: z.string().max(200).nullable().optional(),
  brandName: z.string().max(100).nullable().optional(),
  // v8.0：规格型号快照可更新（来自 SPU.specModel）
  spec: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(50).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  thumbnailUrl: z.string().max(500).nullable().optional(),
  imageUrls: z.array(z.string()).nullable().optional(),
  qty: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  lineDiscount: z.coerce.number().min(0).optional(),
  remark: z.string().max(500).optional(),
  lineVersion: z.coerce.number().int().min(0).optional(),
  rawDescription: z.string().max(500).optional(),
  rawUnit: z.string().max(50).optional(),
  isStandardized: z.boolean().optional(),
});

export const recognizeOrderSchema = z.object({
  text: z.string().max(8000).optional(),
  imageBase64: z.string().max(8_000_000).optional(),
  mimeType: z.string().max(100).optional(),
});

// ============================================================
// 购销报价（purchase_quote）
// ============================================================

export const purchaseQuotePriceItemSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
  lineDiscount: z.coerce.number().min(0).default(0).optional(),
});

export const purchaseQuotePriceBatchSchema = z.object({
  lines: z.array(purchaseQuotePriceItemSchema).min(1, '至少一条报价行'),
});

export const purchaseQuoteStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'voided']),
  lockVersion: z.coerce.number().int().min(0).optional(),
});

// ============================================================
// 收款对账视图
// ============================================================

export const paymentCreateSchema = z.object({
  paymentType: paymentTypeSchema,
  method: z.string().min(1).max(50),
  amount: z.coerce.number().positive(),
  paidAt: z.string().datetime().optional(),
  invoiceInfo: z.record(z.unknown()).optional(),
});

export const paymentUpdateSchema = z.object({
  paymentType: paymentTypeSchema.optional(),
  method: z.string().min(1).max(50).optional(),
  amount: z.coerce.number().positive().optional(),
  paidAt: z.string().datetime().optional(),
  invoiceInfo: z.record(z.unknown()).optional(),
  reconcileStatus: reconcileStatusSchema.optional(),
});

// ============================================================
// 配货视图（V4+V5 合并：仓库出库 + 外部调货统一表）
// ============================================================

/** upsert 配货行（Excel式失焦即保存，单行提交） */
export const allocationLineUpsertSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  sourceId: z.coerce.number().int().positive(),
  sourceType: supplierTypeSchema,
  allocQty: z.coerce.number().min(0),
  pendingStatus: allocationPendingStatusSchema.optional(),
  batchNo: z.string().max(100).optional(),
  unitCost: z.coerce.number().nonnegative().optional(),
  freightShare: z.coerce.number().nonnegative().optional(),
  note: z.string().max(500).optional(),
});

/** 更新单条配货行（PATCH 单字段更新） */
export const allocationLineUpdateSchema = z.object({
  allocQty: z.coerce.number().min(0).optional(),
  pendingStatus: allocationPendingStatusSchema.optional(),
  batchNo: z.string().max(100).optional(),
  unitCost: z.coerce.number().nonnegative().optional(),
  freightShare: z.coerce.number().nonnegative().optional(),
  note: z.string().max(500).optional(),
});

// ============================================================
// 交付履约视图
// ============================================================

export const deliveryCreateSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
  trackingNo: z.string().max(100).optional(),
  receiver: z.string().max(100).optional(),
  receiverPhone: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
  attachmentUrls: z.array(z.string()).optional(),
  freight: z.coerce.number().min(0).optional(),
});

export const deliveryUpdateSchema = z.object({
  trackingNo: z.string().max(100).optional(),
  receiver: z.string().max(100).optional(),
  receiverPhone: z.string().max(20).optional(),
  status: deliveryStatusSchema.optional(),
  note: z.string().max(500).optional(),
  attachmentUrls: z.array(z.string()).optional(),
  freight: z.coerce.number().min(0).optional(),
});

// ============================================================
// 成本核定视图
// ============================================================

export const costSegmentSchema = z.enum(['internal', 'external_agreed', 'external_excess']);

export const costLineItemSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  // v1.7.0 成本分层段（internal / external_agreed / external_excess）
  costSegment: costSegmentSchema,
  channelType: costChannelTypeSchema,
  sourceId: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0),
  freight: z.coerce.number().min(0).default(0),
  // v1.7.0 数量口径由分层段派生（external_excess→over_qty，其余→alloc_qty），可不传
  costQty: z.coerce.number().positive().optional(),
  remark: z.string().max(500).optional(),
});

export const costLineBatchSchema = z.object({
  lines: z.array(costLineItemSchema).min(1, '至少一条成本行'),
});

// ============================================================
// 退换售后视图
// ============================================================

export const refundLineCreateSchema = z.object({
  lineId: z.coerce.number().int().positive(),
  refundType: refundTypeSchema,
  refundQty: z.coerce.number().positive(),
  reason: z.string().max(500).optional(),
  restock: z.boolean().optional(),
});

export const refundLineUpdateSchema = z.object({
  refundQty: z.coerce.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

// v2.1 定档归档-退换记录（lineId 来自 URL params，body 仅含 refundType/refundQty/reason）
export const recordRefundSchema = z.object({
  refundType: refundTypeSchema,
  refundQty: z.number().positive('退换数量必须大于0'),
  reason: z.string().max(500).optional(),
});

// ============================================================
// 收货地址
// ============================================================

export const addressSchema = z.object({
  label: z.string().max(50).optional(),
  contact: z.string().min(1).max(100),
  phone: z.string().regex(/^1\d{10}$/, '手机号格式错误'),
  province: z.string().max(50).optional(),
  city: z.string().max(50).optional(),
  district: z.string().max(50).optional(),
  detail: z.string().min(1).max(500),
  isDefault: z.boolean().optional(),
});

// ============================================================
// 基础数据：产品/分类/供应商/用户
// ============================================================

/**
 * v3.3 产品创建 schema（products 表唯一主体）。
 * 仅核心字段：分类id/名称/描述/状态/排序。
 * 品牌/规格/单位/价格等下沉到子表（product_brands/product_specs/product_units 等）。
 */
export const productCreateSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  status: productStatusSchema.optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const productUpdateSchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  status: productStatusSchema.optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.coerce.number().int().positive().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const supplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: supplierTypeSchema,
  contact: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
});

export const supplierUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contact: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  status: supplierStatusSchema.optional(),
  note: z.string().max(2000).optional(),
});

export const userCreateSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(6).max(100),
  realName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  roles: z.array(z.enum(['sales', 'allocator', 'cashier', 'delivery', 'manager', 'admin'])).min(1),
});

export const userUpdateSchema = z.object({
  realName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  roles: z.array(z.enum(['sales', 'allocator', 'cashier', 'delivery', 'manager', 'admin'])).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).max(100),
});
