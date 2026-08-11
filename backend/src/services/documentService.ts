/**
 * 单据主表服务
 *
 * 职责：
 *  1. 单据 CRUD：list / getById / create / update / archive
 *  2. document_no 自动生成：YY-MM-DD-序号（3 位）
 *  3. 状态流转：transitionStatus 调用 document-state-machine.applyTransition
 *  4. 客户端价格可见性：getByIdForCustomer 在 purchase_quote_status !== confirmed 时剥离售价
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { applyTransition, isPriceVisible } from '../engines/document-state-machine.js';
import { wsManager } from '../ws/index.js';
import type { DocumentStatus, StageStatus } from '../types/index.js';

function formatDate(d: Date): string {
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 生成下一个 document_no。
 * 查询当天最大序号 + 1，并发场景依赖 document_no 唯一约束 + 重试。
 */
async function generateDocumentNo(): Promise<string> {
  const dateStr = formatDate(new Date());
  const prefix = dateStr;
  const last = await prisma.documents.findFirst({
    where: { document_no: { startsWith: prefix } },
    orderBy: { document_no: 'desc' },
    select: { document_no: true },
  });
  let seq = 1;
  if (last) {
    const lastSeq = parseInt(last.document_no.slice(-3), 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${dateStr}-${String(seq).padStart(3, '0')}`;
}

export interface ListFilter {
  keyword?: string;
  customerId?: bigint;
  status?: DocumentStatus;
  createdBy?: bigint;
  startDate?: Date;
  endDate?: Date;
  includeArchived?: boolean;
}

export async function listDocuments(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};

  if (typeof query.keyword === 'string' && query.keyword) {
    const kw = query.keyword.trim();
    // v15.2 索引驱动检索（规模基线：几千万行单据，禁止 OR contains 全表扫描）：
    //   - 标准单号形态（以「YY-」开头，如 26-08-10-001 / 26-08-10）→ document_no 前缀检索，
    //     走 document_no 唯一索引前缀（单据号检索是最高频路径，必须先索引）
    //   - 其余关键词（客户名/电话/公司/标题）→ 保持模糊匹配（配合状态/时间过滤收敛）
    if (/^\d{2}-/.test(kw)) {
      where.document_no = { startsWith: kw };
    } else {
      // v11.0 解耦：customer 关系已移除，改为基于快照字段检索
      where.OR = [
        { customerName: { contains: kw } },
        { customerPhone: { contains: kw } },
        { customerCompany: { contains: kw } },
        { title: { contains: kw } },
      ];
    }
  }
  if (typeof query.customerId === 'string' && query.customerId) {
    where.customer_id = BigInt(query.customerId);
  }
  if (typeof query.status === 'string' && query.status) {
    where.status = query.status;
  }
  if (typeof query.createdBy === 'string' && query.createdBy) {
    where.created_by = BigInt(query.createdBy);
  }
  const dateFrom = query.dateFrom ?? query.startDate;
  const dateTo = query.dateTo ?? query.endDate;
  if (typeof dateFrom === 'string' && dateFrom) {
    where.created_at = { ...(where.created_at as object), gte: new Date(dateFrom) };
  }
  if (typeof dateTo === 'string' && dateTo) {
    where.created_at = { ...(where.created_at as object), lte: new Date(dateTo) };
  }
  const includeArchived = query.includeArchived === 'true' || query.includeArchived === true;
  if (!includeArchived) {
    where.sales_archived_at = null;
  }

  const sort = parseSort(query, ['created_at', 'updated_at', 'document_no', 'status'], {
    field: 'created_at',
    order: 'desc',
  });
  const [total, list] = await Promise.all([
    prisma.documents.count({ where }),
    prisma.documents.findMany({
      where,
      orderBy: sort,
      skip,
      take,
      include: {
        // v11.0 解耦：移除 customer / creator include，使用扁平快照字段
        _count: { select: { document_lines: true } },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

const detailInclude = {
  // v11.0 解耦：移除 customer / creator include，使用扁平快照字段（customerName/customerPhone/customerCompany/creatorName/salespersonName）
  document_lines: {
    orderBy: { seq: 'asc' },
    // v11.0 解耦：移除 brand/unitLink/product 关联 include，使用扁平快照字段
  },
  payment_records: { orderBy: { created_at: 'desc' } },
  delivery_records: { orderBy: { created_at: 'desc' } },
} as const;

export async function getDocumentById(id: bigint) {
  const doc = await prisma.documents.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const lineIds = doc.document_lines.map((l) => l.id);
  const [allocationLinesCount, costLinesCount, refundLinesCount] = lineIds.length
    ? await Promise.all([
        prisma.allocation_lines.count({ where: { line_id: { in: lineIds } } }),
        prisma.cost_lines.count({ where: { line_id: { in: lineIds } } }),
        prisma.refund_lines.count({ where: { line_id: { in: lineIds } } }),
      ])
    : [0, 0, 0];

  return {
    ...doc,
    purchaseQuoteStatus: doc.purchase_quote_status as StageStatus,
    needInvoice: doc.need_invoice,
    viewLocks: doc.view_locks as Record<string, boolean> | null,
    annotationCounts: {
      documentLines: doc.document_lines.length,
      allocationLines: allocationLinesCount,
      costLines: costLinesCount,
      refundLines: refundLinesCount,
      paymentRecords: doc.payment_records.length,
      deliveryRecords: doc.delivery_records.length,
    },
  };
}

/** 剥离客户不可见的售价字段 */
function stripLinePrices<T extends { unitPrice: unknown; amount: unknown; lineDiscount: unknown }>(
  line: T,
  priceVisible: boolean,
) {
  if (priceVisible) return line;
  return {
    ...line,
    unitPrice: null,
    amount: null,
    lineDiscount: null,
  };
}

/**
 * 客户端视角的单据详情。
 * 价格可见性：仅 purchase_quote_status === confirmed 时返回售价。
 */
export async function getDocumentForCustomer(id: bigint, customerId: bigint) {
  const doc = await prisma.documents.findFirst({
    where: { id, customer_id: customerId },
    include: {
      document_lines: {
        orderBy: { seq: 'asc' },
        // v11.0 解耦：移除 brand/unitLink/product 关联 include，使用扁平快照字段
      },
    },
  });
  if (!doc) throw Errors.notFound('单据不存在或无权访问');

  const purchaseQuoteStatus = doc.purchase_quote_status as StageStatus;
  const priceVisible = isPriceVisible(purchaseQuoteStatus);
  const lines = doc.document_lines.map((line) => stripLinePrices(line, priceVisible));

  return {
    ...doc,
    purchaseQuoteStatus,
    needInvoice: doc.need_invoice,
    document_lines: lines,
  };
}

/**
 * 客户端获取当前活动单据（未归档，按 updated_at desc 取最新一张）。
 */
export async function getActiveDocumentForCustomer(customerId: bigint) {
  const doc = await prisma.documents.findFirst({
    where: {
      customer_id: customerId,
      status: { not: 'archived' },
      sales_archived_at: null,
    },
    orderBy: { updated_at: 'desc' },
    include: {
      document_lines: {
        orderBy: { seq: 'asc' },
        // v11.0 解耦：移除 brand/unitLink/product 关联 include，使用扁平快照字段
      },
    },
  });
  if (!doc) return null;

  const purchaseQuoteStatus = doc.purchase_quote_status as StageStatus;
  const priceVisible = isPriceVisible(purchaseQuoteStatus);
  const lines = doc.document_lines.map((line) => stripLinePrices(line, priceVisible));
  return {
    ...doc,
    purchaseQuoteStatus,
    needInvoice: doc.need_invoice,
    document_lines: lines,
  };
}

/**
 * 客户端列出本人全部清单（含已归档，不含行明细以减轻负载）。
 */
export async function listDocumentsForCustomer(customerId: bigint) {
  const list = await prisma.documents.findMany({
    where: { customer_id: customerId },
    orderBy: { updated_at: 'desc' },
    select: {
      id: true,
      document_no: true,
      title: true,
      status: true,
      purchase_quote_status: true,
      note: true,
      created_at: true,
      updated_at: true,
      total_amount: true,
      _count: { select: { document_lines: true } },
    },
  });
  return list.map((d) => {
    const purchaseQuoteStatus = d.purchase_quote_status as StageStatus;
    const priceVisible = isPriceVisible(purchaseQuoteStatus);
    return {
      ...d,
      purchaseQuoteStatus,
      // 未确认时不暴露合计金额
      total_amount: priceVisible ? d.total_amount : null,
    };
  });
}

/**
 * 客户更新本人单据标题/备注。
 */
export async function updateDocumentForCustomer(
  documentId: bigint,
  customerId: bigint,
  data: { title?: string; note?: string },
) {
  const existing = await prisma.documents.findFirst({
    where: { id: documentId, customer_id: customerId },
  });
  if (!existing) throw Errors.notFound('单据不存在');
  return prisma.documents.update({
    where: { id: documentId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    },
  });
}

/**
 * 客户归档本人清单（软删除入口）。
 */
export async function archiveDocumentForCustomer(documentId: bigint, customerId: bigint) {
  const existing = await prisma.documents.findFirst({
    where: { id: documentId, customer_id: customerId },
  });
  if (!existing) throw Errors.notFound('单据不存在');
  return prisma.documents.update({
    where: { id: documentId },
    data: { status: 'archived' },
  });
}

export interface CreateDocumentInput {
  // 客户可选：允许仅凭标题建单
  customerId?: bigint | null;
  title?: string;
  note?: string;
  createdBy?: bigint | null;
  /// v11.0 解耦：业务员ID（用于填充 salespersonName 快照）
  salespersonId?: bigint | null;
  lines?: Array<{
    /** v14.0：关联规格变体 ID（物理 NOT NULL，缺失兜底 0=未关联规格） */
    specId?: bigint;
    /** v8.0：关联品牌 ID */
    brandId?: bigint;
    /** v8.0：关联 SPU ID（用于获取 categoryId/specModel） */
    productId?: bigint | null;
    /** v8.0：关联单位 ID */
    unitId?: bigint;
    productRef: string;
    /** v8.0：规格型号快照（来自 SPU.specModel） */
    spec?: string;
    categoryId?: number;
    thumbnailUrl?: string;
    unit: string;
    qty: number;
    remark?: string;
    unitPrice?: number;
  }>;
}

export async function createDocument(input: CreateDocumentInput) {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < 3) {
    const document_no = await generateDocumentNo();
    try {
      // v11.0 解耦：主动查询客户/员工档案填充快照字段
      const [customerRow, creatorRow, salespersonRow] = await Promise.all([
        input.customerId
          ? prisma.customers.findUnique({
              where: { id: input.customerId },
              select: { name: true, phone: true, company: true },
            })
          : Promise.resolve(null),
        input.createdBy
          ? prisma.users.findUnique({
              where: { id: input.createdBy },
              select: { real_name: true },
            })
          : Promise.resolve(null),
        input.salespersonId
          ? prisma.users.findUnique({
              where: { id: input.salespersonId },
              select: { real_name: true },
            })
          : Promise.resolve(null),
      ]);

      const created = await prisma.documents.create({
        data: {
          document_no,
          // v2.6 customer_id 可空：未关联客户时为 null
          customer_id: input.customerId ?? null,
          title: input.title ?? null,
          note: input.note ?? null,
          created_by: input.createdBy ?? null,
          salesperson_id: input.salespersonId ?? null,
          // v11.0 解耦：客户档案快照字段
          customerName: customerRow?.name ?? null,
          customerPhone: customerRow?.phone ?? null,
          customerCompany: customerRow?.company ?? null,
          // v11.0 解耦：员工档案快照字段
          creatorName: creatorRow?.real_name ?? null,
          salespersonName: salespersonRow?.real_name ?? null,
          status: 'demand_pending',
          purchase_quote_status: 'pending',
          document_lines: input.lines?.length
            ? {
                create: input.lines.map((line, idx) => {
                  const unitPrice = line.unitPrice ?? 0;
                  return {
                    seq: idx + 1,
                    // v14.0：SKU 关联（specId 物理 NOT NULL，缺失兜底 0=未关联规格）
                    specId: line.specId ?? 0n,
                    brandId: line.brandId ?? null,
                    productId: line.productId ?? null,
                    unitId: line.unitId ?? null,
                    // v8.0 快照字段
                    productRef: line.productRef,
                    spec: line.spec ?? null,
                    unit: line.unit,
                    categoryId: line.categoryId ?? null,
                    thumbnailUrl: line.thumbnailUrl ?? null,
                    qty: line.qty,
                    unitPrice,
                    lineDiscount: 0,
                    amount: Number(line.qty) * unitPrice,
                    remark: line.remark ?? null,
                  };
                }),
              }
            : undefined,
        },
        include: { document_lines: true },
      });
      return created;
    } catch (err) {
      lastErr = err;
      attempt++;
    }
  }
  throw lastErr;
}

export async function updateDocument(
  id: bigint,
  data: { title?: string; note?: string; needInvoice?: boolean; createdAt?: string },
  lockVersion?: number,
) {
  const existing = await prisma.documents.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单据不存在');

  if (lockVersion !== undefined && lockVersion !== existing.lock_version) {
    throw Errors.conflict('单据已被其他操作修改，请刷新后重试', 40901);
  }

  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.note !== undefined) update.note = data.note;
  if (data.needInvoice !== undefined) update.need_invoice = data.needInvoice;
  if (data.createdAt !== undefined) {
    const next = new Date(data.createdAt);
    if (Number.isNaN(next.getTime())) throw Errors.badRequest('单据日期格式错误');
    // 仅改日期：尽量保留原时分秒；纯 YYYY-MM-DD 则落到中午避免时区翻转
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.createdAt.trim())) {
      next.setHours(12, 0, 0, 0);
    }
    update.created_at = next;
  }

  return prisma.documents.update({
    where: { id },
    data: update,
  });
}

export interface DocumentBusinessUpdateInput {
  customerId?: bigint | null;
  salespersonId?: bigint | null;
  deliveryAddress?: string | null;
  contactPhone?: string | null;
  expectedDeliveryDate?: string | null;
  validUntil?: string | null;
  paymentTerms?: string | null;
  taxRate?: number;
  taxInclusive?: boolean;
  orderDiscountAmount?: number;
  roundOffAmount?: number;
  orderDiscountRemark?: string | null;
  needInvoice?: boolean;
}

/**
 * v2.1 更新单据业务字段。
 * v11.0 解耦：customerId / salespersonId 变更时同步刷新快照字段
 */
export async function updateDocumentBusiness(id: bigint, input: DocumentBusinessUpdateInput) {
  const existing = await prisma.documents.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单据不存在');

  const update: Record<string, unknown> = {};
  if (input.customerId !== undefined) update.customer_id = input.customerId;
  if (input.salespersonId !== undefined) update.salesperson_id = input.salespersonId;
  if (input.deliveryAddress !== undefined) update.delivery_address = input.deliveryAddress;
  if (input.contactPhone !== undefined) update.contact_phone = input.contactPhone;
  if (input.expectedDeliveryDate !== undefined)
    update.expected_delivery_date = input.expectedDeliveryDate;
  if (input.validUntil !== undefined) update.valid_until = input.validUntil;
  if (input.paymentTerms !== undefined) update.payment_terms = input.paymentTerms;
  if (input.taxRate !== undefined) update.tax_rate = input.taxRate;
  if (input.taxInclusive !== undefined) update.tax_inclusive = input.taxInclusive;
  if (input.orderDiscountAmount !== undefined)
    update.order_discount_amount = input.orderDiscountAmount;
  if (input.roundOffAmount !== undefined) update.round_off_amount = input.roundOffAmount;
  if (input.orderDiscountRemark !== undefined)
    update.order_discount_remark = input.orderDiscountRemark;
  if (input.needInvoice !== undefined) update.need_invoice = input.needInvoice;

  // v11.0 解耦：customer/salesperson 变更时主动查询档案刷新快照
  const newCustomerId = input.customerId !== undefined ? input.customerId : existing.customer_id;
  const newSalespersonId =
    input.salespersonId !== undefined ? input.salespersonId : existing.salesperson_id;
  const customerChanged = input.customerId !== undefined;
  const salespersonChanged = input.salespersonId !== undefined;
  if (customerChanged || salespersonChanged) {
    const [customerRow, salespersonRow] = await Promise.all([
      customerChanged && newCustomerId
        ? prisma.customers.findUnique({
            where: { id: newCustomerId },
            select: { name: true, phone: true, company: true },
          })
        : Promise.resolve(null),
      salespersonChanged && newSalespersonId
        ? prisma.users.findUnique({
            where: { id: newSalespersonId },
            select: { real_name: true },
          })
        : Promise.resolve(null),
    ]);
    if (customerChanged) {
      update.customerName = customerRow?.name ?? null;
      update.customerPhone = customerRow?.phone ?? null;
      update.customerCompany = customerRow?.company ?? null;
    }
    if (salespersonChanged) {
      update.salespersonName = salespersonRow?.real_name ?? null;
    }
  }

  return prisma.documents.update({ where: { id }, data: update });
}

export async function transitionStatus(
  id: bigint,
  to: DocumentStatus,
  actor: { id: bigint; name: string },
  lockVersion?: number,
  reason?: string,
  tx?: import('../engines/document-state-machine.js').TransitionTx,
) {
  const client = tx ?? prisma;
  const existing = await client.documents.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单据不存在');

  const currentLockVersion = lockVersion ?? existing.lock_version;
  const result = await applyTransition(
    {
      documentId: id,
      currentStatus: existing.status as DocumentStatus,
      currentLockVersion,
      to,
      actor,
      reason,
    },
    tx,
  );
  return result;
}

export async function archiveDocument(id: bigint) {
  const existing = await prisma.documents.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单据不存在');
  return prisma.documents.update({
    where: { id },
    data: { status: 'archived' },
  });
}

/**
 * 广播单据行更新事件（供 documentLineService 调用）。
 */
export function broadcastLinesUpdated(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'document.lines_updated',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

/**
 * 客户提交需求：标记备注 + 触摸更新时间 + 广播，通知员工端刷新。
 * 仅 pending 阶段允许。
 */
export async function submitDemandForCustomer(documentId: bigint, customerId: bigint) {
  const doc = await prisma.documents.findFirst({
    where: { id: documentId, customer_id: customerId },
    include: { document_lines: { select: { id: true } } },
  });
  if (!doc) throw Errors.notFound('单据不存在');
  if (doc.document_lines.length === 0) {
    throw Errors.badRequest('请先添加物料后再提交需求');
  }
  if (doc.purchase_quote_status !== 'pending') {
    throw Errors.forbidden('当前报价状态不允许提交需求');
  }

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const marker = `[客户已提交需求 ${stamp}]`;
  const prevNote = (doc.note ?? '').replace(/\[客户已提交需求[^\]]*]\s*/g, '').trim();
  const note = prevNote ? `${marker}\n${prevNote}` : marker;

  const updated = await prisma.documents.update({
    where: { id: documentId },
    data: { note },
  });

  broadcastLinesUpdated(documentId);
  return updated;
}
