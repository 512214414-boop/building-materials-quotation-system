// 前端共享类型定义
// 与后端 Prisma schema + backend/src/types/index.ts 对齐
//
// 字段命名约定：
// - 后端 types/index.ts 接口统一使用 camelCase
// - 前端类型定义统一使用 camelCase（与后端 service 序列化输出 / Prisma client 返回对齐）
// - Prisma schema 中老模型字段多为 snake_case，新模型多为 camelCase；
//   前端一律按 camelCase 消费，由后端序列化层负责字段映射。
//
// 数值类型约定（JSON 序列化后的前端形态）：
// - Prisma BigInt  → string（JSON 序列化为 string，避免 JS Number 精度丢失）
// - Prisma Decimal → string（Prisma 默认序列化为 string）
// - Prisma Int     → number
// - Prisma DateTime → string（ISO 8601）
// - Prisma Json    → unknown

// ============================================================
// 枚举（与后端 Prisma schema 同步）
// ============================================================

/**
 * 单据全局状态（8 档，双向可逆）— 对应 Prisma enum document_status。
 * 价格可见性请用 StageStatus / purchaseQuoteStatus，不要用 demand_pending 判断。
 */
export type DocumentStatus =
  | 'demand_pending'
  | 'quote_confirmed'
  | 'payment_settled'
  | 'allocation_in_progress'
  | 'delivery_completed'
  | 'cost_verified'
  | 'after_sales'
  | 'archived';

/** 购销报价阶段状态 — 对应 Prisma enum stage_status */
export type StageStatus = 'pending' | 'confirmed' | 'voided';

/** 收款类型：deposit=定金 / final=尾款 / balance=赊账 — 对应 Prisma enum payment_type */
export type PaymentType = 'deposit' | 'final' | 'balance';

/** 对账状态：pending=待对账 / reconciled=已核销 — 对应 Prisma enum reconcile_status */
export type ReconcileStatus = 'pending' | 'reconciled';

/** 交付方式：self_pickup=自提 / haulage=货拉拉 / special_van=专车 / logistics=物流 / site_delivery=工地送货 — 对应 Prisma enum delivery_method */
export type DeliveryMethod =
  | 'self_pickup'
  | 'haulage'
  | 'special_van'
  | 'logistics'
  | 'site_delivery';

/** 交付状态：pending=待发货 / shipped=已发货 / signed=已签收 — 对应 Prisma enum delivery_status */
export type DeliveryStatus = 'pending' | 'shipped' | 'signed';

/** 成本渠道类型：warehouse=自有仓库出库 / supplier=外部供应商调货 — 对应 Prisma enum cost_channel_type */
export type CostChannelType = 'warehouse' | 'supplier';

/** 退换类型：refund=退款 / exchange=换货 — 对应 Prisma enum refund_type */
export type RefundType = 'refund' | 'exchange';

/** v2.1 退换处理状态：pending=待处理（已记录待后续跟进）/ closed=已关闭 — 对应 Prisma enum refund_status */
export type RefundStatus = 'pending' | 'closed';

/** v2.1 定档归档状态：working=临时区可编辑 / archived=已定档冻结 / revoked=已反定档（保留追溯） — 对应 Prisma enum archive_status */
export type ArchiveStatus = 'working' | 'archived' | 'revoked';

/** 预置系统角色（seed 基线，可改权限；不可删除） */
export type SystemRoleCode = 'sales' | 'allocator' | 'cashier' | 'delivery' | 'manager' | 'admin';

/** 角色编码：预置 + 自定义，一律以 DB roles.code 为准 */
export type RoleCode = string;

export const SYSTEM_ROLE_CODES: SystemRoleCode[] = [
  'sales',
  'allocator',
  'cashier',
  'delivery',
  'manager',
  'admin',
];

export function isSystemRoleCode(code: string): code is SystemRoleCode {
  return (SYSTEM_ROLE_CODES as string[]).includes(code);
}

/** 导航叶子权限码（与 menu 注册表同源）：业务 8 + 基础数据 4 + 系统管理 5
 * v1.7.1：恢复独立 supplier_manage（供应商独立档案管理，标准接口解耦） */
export type ViewCode =
  | 'purchase_quote'
  | 'payment_recon'
  | 'allocation'
  | 'delivery_fulfill'
  | 'cost_verify'
  | 'after_sales'
  | 'sales_summary'
  | 'archive'
  | 'product_manage'
  | 'customer_manage'
  // v1.7.1：供应商独立档案管理（独立权限叶子，标准接口解耦）
  | 'supplier_manage'
  // v1.7.0：库存/仓库/欠库/待入库（配货·成本推演方案新增权限叶子）
  | 'inventory'
  | 'ops_report'
  | 'auth_code_manage'
  | 'access_request_manage'
  | 'user_manage'
  | 'audit_log_manage'
  | 'role_manage';

export const MASTER_DATA_VIEW_CODES: ViewCode[] = [
  'product_manage',
  'customer_manage',
  'supplier_manage',
  'inventory',
];

export const SYSTEM_VIEW_CODES: ViewCode[] = [
  'auth_code_manage',
  'access_request_manage',
  'user_manage',
  'audit_log_manage',
  'role_manage',
];

/** 视图权限级别：none=无访问权限（前端正常显示入口，后端返回403） / ro=只读 / rw=可读可写 */
export type ViewPermission = 'none' | 'ro' | 'rw';

// ============================================================
// 状态常量
// ============================================================

/** 单据状态档位顺序（1-8，用于客户端展示与排序；状态机本身双向可逆）
 * v2.2 合并：原 warehouse_in_progress(4) + external_in_progress(5) 合并为 allocation_in_progress(4) */
export const DOCUMENT_STATUS_ORDER: Record<DocumentStatus, number> = {
  demand_pending: 1,
  quote_confirmed: 2,
  payment_settled: 3,
  allocation_in_progress: 4,
  delivery_completed: 5,
  cost_verified: 6,
  after_sales: 7,
  archived: 8,
};

/** 单据状态中文显示名 */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  demand_pending: '需求待确认',
  quote_confirmed: '报价已确认',
  payment_settled: '款项已结清',
  allocation_in_progress: '配货中',
  delivery_completed: '交付已完成',
  cost_verified: '成本已核定',
  after_sales: '售后处理中',
  archived: '单据最终归档',
};

/** 购销报价阶段状态中文显示名 */
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  voided: '作废',
};

/** 价格是否对客户可见：仅 purchase_quote_status === confirmed */
export function isPurchaseQuotePriceVisible(status: StageStatus): boolean {
  return status === 'confirmed';
}

// ============================================================
// 数据模型接口（与 Prisma schema 字段对齐，camelCase）
// ============================================================

/** 单据主表（唯一事实源）— 对应 Prisma documents 模型 */
export interface Document {
  id: string;
  /** 单据号：Q + YYYYMMDD + 3位序号 */
  documentNo: string;
  customerId: string;
  title: string | null;
  status: DocumentStatus;
  /**
   * 购销报价阶段状态。
   * 注意：价格可见性用 purchaseQuoteStatus，不再用 status===demand_pending。
   */
  purchaseQuoteStatus: StageStatus;
  /** 是否需要开票 */
  needInvoice: boolean;
  /** 单据级乐观锁 */
  lockVersion: number;
  /** 创建员工（客户自助创建时为 null） */
  createdBy: string | null;
  // ===== v2.1 业务打印字段 =====
  /** 业务员（关联 users） */
  salespersonId: string | null;
  /** 交货地址（打印用） */
  deliveryAddress: string | null;
  /** 联系电话（打印用） */
  contactPhone: string | null;
  /** 预计交货日期 */
  expectedDeliveryDate: string | null;
  /** 报价有效期 */
  validUntil: string | null;
  /** 付款条件（如"款到发货"、"月结30天"） */
  paymentTerms: string | null;
  // ===== v2.1 税费字段 =====
  /** 税率（如 13 表示 13%） */
  taxRate: string;
  /** 是否含税 */
  taxInclusive: boolean;
  // ===== v2.1 整单优惠 / 抹零 =====
  /** 整单优惠金额（按行金额比例分摊到 line_discount） */
  orderDiscountAmount: string;
  /** 抹零金额 */
  roundOffAmount: string;
  /** 整单优惠备注 */
  orderDiscountRemark: string | null;
  // ===== v2.1 汇总冗余字段（锁定报价/成本核定时写入） =====
  /** 行小计汇总 = Σ(qty * unit_price - discount) */
  subtotalAmount: string;
  /** 税额 */
  taxAmount: string;
  /** 价税合计 */
  totalAmount: string;
  /** 已收款金额 */
  paidAmount: string;
  /** 成本合计（V7 核定后写入） */
  costTotal: string;
  /** 毛利 = totalAmount - costTotal */
  grossProfit: string;
  // ===== v2.1 分阶段定档状态 =====
  /** 销售定档状态：working/archived/revoked */
  salesArchiveStatus: ArchiveStatus;
  /** 配货定档状态 */
  logisticsArchiveStatus: ArchiveStatus;
  /** 成本定档状态 */
  costArchiveStatus: ArchiveStatus;
  /** 销售定档时间 */
  salesArchivedAt: string | null;
  /** 配货定档时间 */
  logisticsArchivedAt: string | null;
  /** 成本定档时间 */
  costArchivedAt: string | null;
  /** 店长汇总确认（V10） */
  summaryConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  note: string | null;
}

/** 单据行（唯一事实源）— 对应 Prisma document_lines 模型 */
export interface DocumentLine {
  id: string;
  documentId: string;
  /** 行序号（单据内唯一） */
  seq: number;
  /** 关联产品（可空——待建档商品直接用 productRef） */
  productId: string | null;
  /** 商品显示名（冗余，支持未建档商品） */
  productRef: string;
  /** v4.0：商品全名快照（product_name + spec_model 拼接） */
  specModel: string | null;
  unit: string;
  /** 需求数量 */
  qty: string;
  /** 对外售价 */
  unitPrice: string;
  /** 行优惠 */
  lineDiscount: string;
  /** 行金额 = qty * unitPrice - lineDiscount */
  amount: string;
  remark: string | null;
  /** 行级乐观锁 */
  lineVersion: number;
  // ===== v4.0 冗余快照字段（从 products / product_units 快照，用于打印与定档冻结） =====
  /** 关联单位 ID（v4.0 保留：无FK快照，打印不依赖档案当前状态） */
  unitId: string | null;
  /** 分类 ID（冗余） */
  categoryId: number | null;
  /** 缩略图 URL（冗余） */
  thumbnailUrl: string | null;
  /** 多图 URL 数组（冗余） */
  imageUrls: unknown | null;
  /** v4.0 AI 识单：是否标准化 */
  isStandardized: boolean;
  /** v4.0 AI 识单：原始描述 */
  rawDescription: string | null;
  /** v4.0 AI 识单：原始单位 */
  rawUnit: string | null;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated quote_lines 已删除；售价在 DocumentLine.unitPrice/amount */

/** 收款对账视图标注 — 对应 Prisma payment_records 模型 */
export interface PaymentRecord {
  id: string;
  documentId: string;
  paymentType: PaymentType;
  /** 现金 / 微信 / 支付宝 / 银行转账 */
  method: string;
  amount: string;
  paidAt: string;
  invoiceInfo: unknown | null;
  reconcileStatus: ReconcileStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 配货视图标注（V4+V5 合并：仓库出库 + 外部调货统一表）— 对应 Prisma allocation_lines 模型
 * v2.2 合并：原 warehouse_lines + sourcing_lines 合并为 allocation_lines
 *
 * 设计要点：
 *  - source_type=warehouse：自有仓库出库（原 warehouse_lines）
 *  - source_type=external：外部供应商调货（原 sourcing_lines）
 *  - pending_status=allocated：已配（alloc_qty > 0）/ pending：代配（alloc_qty=0，仅标注出库方）
 *  - 超拿支持：alloc_qty 可超过缺口数量（多余当样品）
 *  - upsert by (line_id, source_id)：同一物料行 + 同一来源只能有一条记录
 */
export interface AllocationLine {
  id: string;
  lineId: string;
  /** 来源类型：warehouse=自有仓库 / external=外部供应商 */
  sourceType: 'warehouse' | 'external';
  /** 来源 ID（suppliers.id，type 与 sourceType 一致） */
  sourceId: string;
  /** 配货数量（Decimal(14,3)，后端 Number() 转换为 number） */
  allocQty: number;
  /** 代配状态：allocated=已配（alloc_qty>0）/ pending=代配（alloc_qty=0，仅标注出库方） */
  pendingStatus: 'allocated' | 'pending';
  /** 批次号（仓库出库用） */
  batchNo: string | null;
  /** 配货时间（alloc_qty > 0 时写入） */
  allocAt: string | null;
  /** 运费分摊（按行金额比例分摊） */
  freightShare: number;
  /** 单位成本（仓库出库成本 / 外部调货采购价） */
  unitCost: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 交付履约视图标注 — 对应 Prisma delivery_records 模型 */
export interface DeliveryRecord {
  id: string;
  documentId: string;
  deliveryMethod: DeliveryMethod;
  trackingNo: string | null;
  receiver: string | null;
  receiverPhone: string | null;
  status: DeliveryStatus;
  shippedAt: string | null;
  signedAt: string | null;
  attachmentUrls: unknown | null;
  /** v2.1 运费（三源汇集源3：按行金额比例分摊到 cost_lines.freight） */
  freight: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 成本核定视图标注（内部进货成本，与 document_lines.unit_price 物理隔离）— 对应 Prisma cost_lines 模型 */
export interface CostLine {
  id: string;
  lineId: string;
  /** warehouse=自有仓库出库 / supplier=外部供应商调货 */
  channelType: CostChannelType;
  /** 来源 ID（warehouse_lines.warehouseId 或 sourcing_lines.supplierId 对应的 suppliers.id） */
  sourceId: string;
  // ===== v2.1 三源汇集字段 =====
  /** 预设单位成本（= product_variants.cost_price） */
  presetUnitCost: string;
  /** 实际单位成本（店长核定，初始 = presetUnitCost） */
  actualCost: string;
  /** 成本调整额 = actualCost - presetUnitCost */
  costAdjust: string;
  /** 运费（按行金额比例分摊） */
  freight: string;
  /** 成本数量（= warehouse_lines.outboundQty + sourcing_lines.sourcingQty） */
  costQty: string;
  /** 成本小计 = actualCost * costQty + freight */
  costAmount: string;
  /** 备注（核定说明） */
  remark: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 退换售后视图标注（强制继承原单基准数据）— 对应 Prisma refund_lines 模型 */
export interface RefundLine {
  id: string;
  lineId: string;
  refundType: RefundType;
  // ===== v2.1 强继承字段（系统自动从 document_lines 继承，不接受前端传入） =====
  /** 原始数量 = document_lines.qty */
  originalQty: string;
  /** 原始售价 = document_lines.unit_price */
  originalPrice: string;
  /** 退换数量（系统校验 SUM(refundQty WHERE lineId) ≤ originalQty） */
  refundQty: string;
  /** 退换金额 = refundQty * originalPrice */
  refundAmount: string;
  /** v2.1 退换处理状态：pending=待处理 / closed=已关闭 */
  refundStatus: RefundStatus;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// API 响应类型
// ============================================================

/** 统一 API 响应（与后端 ApiResponse 对齐） */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 分页结果（与后端 PaginationResult 对齐） */
export interface PaginationResult<T> {
  list: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ============================================================
// WebSocket 事件类型（与后端 backend/src/types/index.ts WsEvent 同步）
// ============================================================

/** v2.1 WS 事件：8 类原视图增量 + 8 类定档归档事件
 * v2.2 合并：原 warehouse.shortage_changed 改为 allocation.changed */
export type WsEvent =
  | { type: 'document.status_changed'; documentId: string; status: DocumentStatus; actor: { id: string; name: string }; ts: number }
  | { type: 'document.lines_updated'; documentId: string; ts: number }
  | { type: 'quote.lines_updated'; documentId: string; ts: number }
  | { type: 'allocation.changed'; documentId: string; ts: number }
  | { type: 'payment.updated'; documentId: string; ts: number }
  | { type: 'delivery.updated'; documentId: string; ts: number }
  | { type: 'cost.updated'; documentId: string; ts: number }
  | { type: 'refund.updated'; documentId: string; ts: number }
  // v2.1 定档归档事件（分阶段人工定档 + 退换记录 + 店长汇总确认）
  | { type: 'archive.sales_archived'; documentId: string; ts: number }
  | { type: 'archive.sales_unarchived'; documentId: string; ts: number }
  | { type: 'archive.logistics_archived'; documentId: string; ts: number }
  | { type: 'archive.logistics_unarchived'; documentId: string; ts: number }
  | { type: 'archive.costs_archived'; documentId: string; ts: number }
  | { type: 'archive.costs_unarchived'; documentId: string; ts: number }
  | { type: 'refund.recorded'; documentId: string; ts: number }
  | { type: 'summary.confirmed'; documentId: string; ts: number };

/** 客户端 WS 消息（订阅/取消订阅/心跳） */
export type WsClientMessage =
  | { action: 'subscribe'; documentId: string }
  | { action: 'unsubscribe'; documentId: string }
  | { action: 'ping' };

// ============================================================
// 权限矩阵（与后端 backend/src/types/index.ts 同步）
// ============================================================

/** 视图权限矩阵：仅预置系统角色的缺键回落；自定义角色只认 DB */
export type ViewPermissionMatrix = Record<SystemRoleCode, Record<ViewCode, ViewPermission>>;

/** 用户视图权限并集（一人多角色取最高：rw > ro > none） */
export type ViewPermissions = Partial<Record<ViewCode, ViewPermission>>;

const bizNone = {
  purchase_quote: 'none',
  payment_recon: 'none',
  allocation: 'none',
  delivery_fulfill: 'none',
  cost_verify: 'none',
  after_sales: 'none',
  sales_summary: 'none',
  archive: 'none',
} as const;

const masterNone = {
  product_manage: 'none',
  customer_manage: 'none',
  supplier_manage: 'none',
  inventory: 'none',
  ops_report: 'none',
} as const;

const systemNone = {
  auth_code_manage: 'none',
  access_request_manage: 'none',
  user_manage: 'none',
  audit_log_manage: 'none',
  role_manage: 'none',
} as const;

export const VIEW_PERMISSION_MATRIX: ViewPermissionMatrix = {
  sales: {
    ...bizNone,
    purchase_quote: 'rw',
    cost_verify: 'rw',
    after_sales: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  allocator: {
    ...bizNone,
    purchase_quote: 'ro',
    allocation: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  cashier: {
    ...bizNone,
    purchase_quote: 'ro',
    payment_recon: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  delivery: {
    ...bizNone,
    purchase_quote: 'ro',
    allocation: 'ro',
    delivery_fulfill: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ...systemNone,
  },
  manager: {
    purchase_quote: 'rw',
    payment_recon: 'rw',
    allocation: 'rw',
    delivery_fulfill: 'rw',
    cost_verify: 'rw',
    after_sales: 'rw',
    sales_summary: 'rw',
    archive: 'rw',
    product_manage: 'rw',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    inventory: 'rw',
    ops_report: 'rw',
    auth_code_manage: 'ro',
    access_request_manage: 'ro',
    user_manage: 'ro',
    audit_log_manage: 'ro',
    role_manage: 'ro',
  },
  admin: {
    purchase_quote: 'ro',
    payment_recon: 'ro',
    allocation: 'ro',
    delivery_fulfill: 'ro',
    cost_verify: 'ro',
    after_sales: 'ro',
    sales_summary: 'ro',
    archive: 'ro',
    product_manage: 'rw',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    inventory: 'ro',
    ops_report: 'ro',
    auth_code_manage: 'rw',
    access_request_manage: 'rw',
    user_manage: 'rw',
    audit_log_manage: 'rw',
    role_manage: 'rw',
  },
};

export const ALL_VIEW_CODES: ViewCode[] = [
  'purchase_quote',
  'payment_recon',
  'allocation',
  'delivery_fulfill',
  'cost_verify',
  'after_sales',
  'sales_summary',
  'archive',
  'product_manage',
  'customer_manage',
  'supplier_manage',
  'inventory',
  'ops_report',
  'auth_code_manage',
  'access_request_manage',
  'user_manage',
  'audit_log_manage',
  'role_manage',
];

function rank(p: ViewPermission): number {
  return p === 'rw' ? 2 : p === 'ro' ? 1 : 0;
}

function maxPerm(a: ViewPermission, b: ViewPermission): ViewPermission {
  return rank(a) >= rank(b) ? a : b;
}

/** 将权限图键规范为 ViewCode（兼容 API serialize 后的 camelCase） */
export function normalizeViewCodeKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/** 解析权限图：只保留合法 ViewCode，键统一 snake_case */
export function parseViewPermissions(raw: unknown): ViewPermissions {
  if (!raw || typeof raw !== 'object') return {};
  const result: ViewPermissions = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== 'none' && v !== 'ro' && v !== 'rw') continue;
    const code = normalizeViewCodeKey(k);
    if ((ALL_VIEW_CODES as string[]).includes(code)) {
      result[code as ViewCode] = v;
    }
  }
  return result;
}

export function mergePermissionMaps(maps: ViewPermissions[]): ViewPermissions {
  const result: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) {
    let max: ViewPermission = 'none';
    for (const m of maps) {
      max = maxPerm(max, m[vc] ?? 'none');
      if (max === 'rw') break;
    }
    result[vc] = max;
  }
  return result;
}

export function mergeViewPermissions(roles: string[]): ViewPermissions {
  return mergePermissionMaps(
    roles.map((role) => (isSystemRoleCode(role) ? VIEW_PERMISSION_MATRIX[role] : {})),
  );
}

export function hasViewPermission(
  viewPermissions: ViewPermissions,
  view: ViewCode,
  level: 'ro' | 'rw',
): boolean {
  const perm = viewPermissions[view] ?? 'none';
  if (perm === 'none') return false;
  if (level === 'ro') return perm === 'ro' || perm === 'rw';
  return perm === 'rw';
}

export function hasAnyViewPermission(
  viewPermissions: ViewPermissions,
  views: ViewCode[],
  level: 'ro' | 'rw' = 'ro',
): boolean {
  return views.some((v) => hasViewPermission(viewPermissions, v, level));
}
