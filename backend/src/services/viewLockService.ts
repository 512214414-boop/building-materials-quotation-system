/**
 * 效率文档§4 视图级防误触锁定 — 通用服务
 *
 * 职责：在 documents.view_locks JSON 中读写各视图的锁定状态
 * 设计原则：
 *  - 集中存储：所有视图锁定状态统一存在 documents.view_locks JSON 中
 *  - 独立于状态机：锁定不影响单据状态流转，仅控制前端编辑
 *  - 视图隔离：每个视图独立锁定/解锁，互不影响
 *
 * 视图 key 清单（v2.5：purchase_quote 合并原需求确认+报价核算）：
 *  - purchase_quote（购销报价）
 *  - payment_reconcile（收款对账）
 *  - allocation（配货，仓库+外部统一）
 *  - delivery（交付履约）
 *  - cost_verify（成本核定）
 *  - refund_after_sale（退换售后）
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export type ViewLockKey =
  | 'purchase_quote'
  | 'payment_reconcile'
  | 'allocation'
  | 'delivery'
  | 'cost_verify'
  | 'refund_after_sale';

/**
 * 锁定指定视图（防误触）。
 */
export async function lockView(
  documentId: bigint,
  viewKey: ViewLockKey,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[viewKey] = true;

  await prisma.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('视图锁定', {
    documentId: String(documentId),
    viewKey,
    actor: actor.name,
  });

  return { documentId: String(documentId), view: viewKey, locked: true };
}

/**
 * 解锁指定视图。
 */
export async function unlockView(
  documentId: bigint,
  viewKey: ViewLockKey,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[viewKey] = false;

  await prisma.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('视图解锁', {
    documentId: String(documentId),
    viewKey,
    actor: actor.name,
  });

  return { documentId: String(documentId), view: viewKey, locked: false };
}
