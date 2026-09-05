/**
 * 收款对账视图服务
 *
 * 职责：
 *  1. listByDocument：查询单据的所有收款记录
 *  2. add：创建收款记录（定金/尾款/赊账）
 *  3. update：修改收款记录（金额、方式、发票信息）
 *  4. reconcile：切换对账核销状态（pending ↔ reconciled）
 *  5. remove：删除收款记录
 *
 * 设计原则：payment_records 是单据的标注表，不修改 document_lines
 */
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { broadcastStatusChange } from '../engines/document-state-machine.js';
import type { TransitionTx, TransitionResult } from '../engines/document-state-machine.js';
import type { payment_type, reconcile_status } from '@prisma/client';

export interface PaymentCreateInput {
  paymentType: payment_type;
  method: string;
  amount: number;
  paidAt?: Date;
  invoiceInfo?: unknown;
}

export interface PaymentUpdateInput {
  paymentType?: payment_type;
  method?: string;
  amount?: number;
  paidAt?: Date;
  invoiceInfo?: unknown;
  reconcileStatus?: reconcile_status;
}

function broadcastPaymentUpdated(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'payment.updated',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

// ============================================================
// 查询
// ============================================================

export async function listByDocument(documentId: bigint) {
  const doc = await repositories.documentRepository.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');
  return repositories.documentRepository.payment_records.findMany({
    where: { document_id: documentId },
    orderBy: [{ paid_at: 'asc' }, { created_at: 'asc' }],
  });
}

/**
 * 收款对账汇总：返回应收总额（documents.total_amount 优先，否则 Σ document_lines.amount）
 */
export async function getPaymentSummary(documentId: bigint) {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, total_amount: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  // 应收：优先用单据冗余合计，否则从行汇总
  let payableAmount = Number(doc.total_amount);
  if (!payableAmount) {
    const lines = await repositories.documentRepository.document_lines.findMany({
      where: { documentId },
      select: { amount: true },
    });
    payableAmount = lines.reduce((sum, l) => sum + Number(l.amount), 0);
  }

  const payments = await repositories.documentRepository.payment_records.findMany({
    where: { document_id: documentId },
    select: { amount: true, reconcile_status: true, payment_type: true },
  });
  const receivedAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const reconciledAmount = payments
    .filter((p) => p.reconcile_status === 'reconciled')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const unreconciledAmount = receivedAmount - reconciledAmount;

  // 按类型分组
  const byType = {
    deposit: payments.filter((p) => p.payment_type === 'deposit').reduce((s, p) => s + Number(p.amount), 0),
    final: payments.filter((p) => p.payment_type === 'final').reduce((s, p) => s + Number(p.amount), 0),
    balance: payments.filter((p) => p.payment_type === 'balance').reduce((s, p) => s + Number(p.amount), 0),
  };

  return {
    payableAmount,
    receivedAmount,
    reconciledAmount,
    unreconciledAmount,
    outstandingAmount: payableAmount - receivedAmount,
    byType,
  };
}

// ============================================================
// 增删改
// ============================================================

export async function addPayment(documentId: bigint, input: PaymentCreateInput, actor: { id: bigint; name: string }) {
  const doc = await repositories.documentRepository.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  const created = await repositories.documentRepository.payment_records.create({
    data: {
      document_id: documentId,
      payment_type: input.paymentType,
      method: input.method,
      amount: input.amount,
      paid_at: input.paidAt ?? new Date(),
      invoice_info: (input.invoiceInfo as object) ?? undefined,
      reconcile_status: 'pending',
      created_by: actor.id,
    },
  });
  broadcastPaymentUpdated(documentId);
  return created;
}

export async function updatePayment(paymentId: bigint, input: PaymentUpdateInput) {
  const existing = await repositories.documentRepository.payment_records.findUnique({
    where: { id: paymentId },
    select: { id: true, document_id: true },
  });
  if (!existing) throw Errors.notFound('收款记录不存在');

  const update: Record<string, unknown> = {};
  if (input.paymentType !== undefined) update.payment_type = input.paymentType;
  if (input.method !== undefined) update.method = input.method;
  if (input.amount !== undefined) update.amount = input.amount;
  if (input.paidAt !== undefined) update.paid_at = input.paidAt;
  if (input.invoiceInfo !== undefined) update.invoice_info = input.invoiceInfo as object;
  if (input.reconcileStatus !== undefined) update.reconcile_status = input.reconcileStatus;

  const updated = await repositories.documentRepository.payment_records.update({ where: { id: paymentId }, data: update });
  broadcastPaymentUpdated(existing.document_id);
  return updated;
}

/**
 * 切换对账核销状态（pending ↔ reconciled）
 * 当全部收款已核销且合计金额 ≥ 单据价税合计时，自动推进主状态为 payment_settled。
 *
 * 多表写入（payment_records 核销 + documents 状态推进）必须事务包裹，保证原子性：
 * 任一写入失败则整体回滚，避免出现「收款已核销但单据状态未推进」的中间态。
 */
export async function reconcilePayment(paymentId: bigint, status: reconcile_status) {
  const existing = await repositories.documentRepository.payment_records.findUnique({
    where: { id: paymentId },
    select: { id: true, document_id: true, reconcile_status: true },
  });
  if (!existing) throw Errors.notFound('收款记录不存在');
  if (existing.reconcile_status === status) {
    throw Errors.unprocessable(`该记录已是 ${status} 状态`, 42206);
  }

  // 使用对象包装规避 TS 控制流分析在异步闭包内赋值后收窄为 null 的问题
  const ctx: {
    updated: Awaited<ReturnType<typeof repositories.documentRepository.payment_records.update>> | undefined;
    advanceResult: TransitionResult | null;
  } = {
    updated: undefined,
    advanceResult: null,
  };
  await prisma.$transaction(async (tx) => {
    // 1. 切换核销状态
    ctx.updated = await tx.payment_records.update({
      where: { id: paymentId },
      data: { reconcile_status: status },
    });

    // 2. 核销完成后 best-effort 推进单据状态到 payment_settled（与核销在同一事务）
    if (status === 'reconciled') {
      try {
        ctx.advanceResult = await maybeAdvancePaymentSettled(existing.document_id, tx);
      } catch (e) {
        logger.warn('自动推进 payment_settled 失败', {
          documentId: String(existing.document_id),
          err: e,
        });
      }
    }
  });

  // 事务提交后再广播（避免客户端在事务未提交时刷新到旧数据）
  broadcastPaymentUpdated(existing.document_id);
  if (ctx.advanceResult) {
    broadcastStatusChange(existing.document_id, ctx.advanceResult.to, { id: BigInt(0), name: '系统' });
  }

  return ctx.updated!;
}

/**
 * 核销金额足够时推进到 payment_settled（仅从 early 阶段正向）。
 *
 * @param tx 可选事务上下文。传入时所有读写走事务；不传时走 prisma 顶层客户端。
 * @returns 推进成功返回 TransitionResult；未推进（金额不足/状态不允许/未达到条件）返回 null。
 */
async function maybeAdvancePaymentSettled(
  documentId: bigint,
  tx?: TransitionTx,
): Promise<TransitionResult | null> {
  const client = tx ?? prisma;
  const doc = await client.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, lock_version: true, total_amount: true },
  });
  if (!doc) return null;
  if (doc.status !== 'demand_pending' && doc.status !== 'quote_confirmed') return null;

  const payments = await client.payment_records.findMany({
    where: { document_id: documentId },
    select: { amount: true, reconcile_status: true },
  });
  const reconciled = payments
    .filter((p) => p.reconcile_status === 'reconciled')
    .reduce((s, p) => s + Number(p.amount), 0);
  const total = Number(doc.total_amount ?? 0);
  if (reconciled <= 0) return null;
  if (total > 0 && reconciled + 0.01 < total) return null;

  const { transitionStatus } = await import('./documentService.js');
  return await transitionStatus(
    documentId,
    'payment_settled',
    { id: BigInt(0), name: '系统' },
    doc.lock_version,
    '收款核销完成自动推进',
    tx,
  );
}

export async function removePayment(paymentId: bigint) {
  const existing = await repositories.documentRepository.payment_records.findUnique({
    where: { id: paymentId },
    select: { id: true, document_id: true },
  });
  if (!existing) throw Errors.notFound('收款记录不存在');
  await repositories.documentRepository.payment_records.delete({ where: { id: paymentId } });
  broadcastPaymentUpdated(existing.document_id);
  return { id: paymentId };
}

// ============================================================
// 效率文档§4 视图级防误触锁定
// ============================================================

const VIEW_LOCK_KEY = 'payment_reconcile';

/**
 * 锁定收款对账视图（防误触）。
 * 在 documents.view_locks JSON 中设置 payment_reconcile=true。
 */
export async function lockView(documentId: bigint, actor: { id: bigint; name: string }) {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[VIEW_LOCK_KEY] = true;

  await repositories.documentRepository.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('收款对账视图锁定', {
    documentId: String(documentId),
    actor: actor.name,
  });

  return { documentId: String(documentId), view: VIEW_LOCK_KEY, locked: true };
}

/**
 * 解锁收款对账视图。
 */
export async function unlockView(documentId: bigint, actor: { id: bigint; name: string }) {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[VIEW_LOCK_KEY] = false;

  await repositories.documentRepository.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('收款对账视图解锁', {
    documentId: String(documentId),
    actor: actor.name,
  });

  return { documentId: String(documentId), view: VIEW_LOCK_KEY, locked: false };
}
