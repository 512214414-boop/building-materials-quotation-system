/**
 * 交付履约视图服务
 *
 * 职责：
 *  1. listByDocument：查所有交付记录（按 created_at 升序）
 *  2. createDelivery：创建交付记录，status 默认 pending
 *  3. updateDelivery：更新字段，status 改为 shipped 时自动设置 shipped_at
 *  4. signDelivery：签收确认，status 改为 signed + signed_at；若该单据所有交付均已签收，自动推进单据状态到 delivery_completed
 *
 * 设计原则：
 *  - 一个单据可有多个交付记录（分批交付）
 *  - 签收确认后自动检查是否全部签收，全部签收才推进单据状态
 *  - 交付状态变更触发 WS 广播
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { applyTransition, broadcastStatusChange } from '../engines/document-state-machine.js';
import type { delivery_method, delivery_status } from '@prisma/client';

export interface DeliveryCreateInput {
  deliveryMethod: delivery_method;
  trackingNo?: string;
  receiver?: string;
  receiverPhone?: string;
  note?: string;
  attachmentUrls?: string[];
  freight?: number;
}

export interface DeliveryUpdateInput {
  trackingNo?: string;
  receiver?: string;
  receiverPhone?: string;
  status?: delivery_status;
  note?: string;
  attachmentUrls?: string[];
  freight?: number;
}

function broadcastDeliveryChanged(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'delivery.updated',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

/**
 * 查询单据的所有交付记录。
 */
export async function listByDocument(documentId: bigint) {
  const doc = await prisma.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  const records = await prisma.delivery_records.findMany({
    where: { document_id: documentId },
    orderBy: { created_at: 'asc' },
  });

  return records.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    deliveryMethod: r.delivery_method,
    trackingNo: r.tracking_no,
    receiver: r.receiver,
    receiverPhone: r.receiver_phone,
    status: r.status,
    shippedAt: r.shipped_at,
    signedAt: r.signed_at,
    attachmentUrls: r.attachment_urls,
    note: r.note,
    freight: Number(r.freight),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * 创建交付记录。
 */
export async function createDelivery(
  documentId: bigint,
  input: DeliveryCreateInput,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, lock_version: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const created = await prisma.delivery_records.create({
    data: {
      document_id: documentId,
      delivery_method: input.deliveryMethod,
      tracking_no: input.trackingNo ?? null,
      receiver: input.receiver ?? null,
      receiver_phone: input.receiverPhone ?? null,
      attachment_urls: input.attachmentUrls ?? undefined,
      note: input.note ?? null,
      freight: input.freight ?? 0,
    },
  });

  broadcastDeliveryChanged(documentId);

  logger.info('交付记录创建', {
    documentId: String(documentId),
    deliveryId: String(created.id),
    method: input.deliveryMethod,
    actor: actor.name,
  });

  return {
    id: created.id,
    documentId: created.document_id,
    deliveryMethod: created.delivery_method,
    trackingNo: created.tracking_no,
    receiver: created.receiver,
    receiverPhone: created.receiver_phone,
    status: created.status,
    shippedAt: created.shipped_at,
    signedAt: created.signed_at,
    attachmentUrls: created.attachment_urls,
    note: created.note,
    freight: Number(created.freight),
    createdAt: created.created_at,
    updatedAt: created.updated_at,
  };
}

/**
 * 更新交付记录。
 * 若 status 改为 'shipped'，自动设置 shipped_at = now()。
 */
export async function updateDelivery(
  deliveryId: bigint,
  input: DeliveryUpdateInput,
  actor: { id: bigint; name: string },
) {
  const existing = await prisma.delivery_records.findUnique({
    where: { id: deliveryId },
    select: { id: true, document_id: true, status: true, shipped_at: true },
  });
  if (!existing) throw Errors.notFound('交付记录不存在');

  // 若状态改为 shipped 且之前未设置 shipped_at，则设置 shipped_at
  const now = new Date();
  const data: Record<string, unknown> = {};
  if (input.trackingNo !== undefined) data.tracking_no = input.trackingNo;
  if (input.receiver !== undefined) data.receiver = input.receiver;
  if (input.receiverPhone !== undefined) data.receiver_phone = input.receiverPhone;
  if (input.note !== undefined) data.note = input.note;
  if (input.freight !== undefined) data.freight = input.freight;
  if (input.attachmentUrls !== undefined) data.attachment_urls = input.attachmentUrls;

  if (input.status !== undefined) {
    // 校验状态流转：pending → shipped → signed
    if (input.status === 'shipped' && existing.status === 'pending') {
      data.status = 'shipped';
      if (!existing.shipped_at) data.shipped_at = now;
    } else if (input.status === 'shipped' && existing.status === 'shipped') {
      // 已是 shipped，无操作
    } else {
      // signed 状态通过专门的 signDelivery 接口处理
      throw Errors.badRequest(
        `交付状态不可从「${existing.status}」通过 PATCH 改为「${input.status}」`,
        42213,
      );
    }
  }

  const updated = await prisma.delivery_records.update({
    where: { id: deliveryId },
    data,
  });

  broadcastDeliveryChanged(existing.document_id);

  logger.info('交付记录更新', {
    deliveryId: String(deliveryId),
    documentId: String(existing.document_id),
    fields: Object.keys(data),
    actor: actor.name,
  });

  return {
    id: updated.id,
    documentId: updated.document_id,
    deliveryMethod: updated.delivery_method,
    trackingNo: updated.tracking_no,
    receiver: updated.receiver,
    receiverPhone: updated.receiver_phone,
    status: updated.status,
    shippedAt: updated.shipped_at,
    signedAt: updated.signed_at,
    attachmentUrls: updated.attachment_urls,
    note: updated.note,
    freight: Number(updated.freight),
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * 签收确认。
 * 1. 校验当前 status 必须是 'shipped'
 * 2. 更新 status = 'signed' + signed_at = now()
 * 3. 检查该单据所有交付记录是否都已签收，若全部签收则自动推进单据状态到 delivery_completed
 */
export async function signDelivery(
  deliveryId: bigint,
  actor: { id: bigint; name: string },
) {
  const existing = await prisma.delivery_records.findUnique({
    where: { id: deliveryId },
    select: { id: true, document_id: true, status: true },
  });
  if (!existing) throw Errors.notFound('交付记录不存在');

  if (existing.status !== 'shipped') {
    throw Errors.badRequest(
      `交付记录当前状态为「${existing.status}」，必须先发货（shipped）才能签收`,
      42214,
    );
  }

  const now = new Date();

  // 多表写入（delivery_records 签收 + documents 状态推进）必须事务包裹，保证原子性：
  // 任一写入失败则整体回滚，避免出现「交付已签收但单据状态未推进」的中间态。
  let allSigned = false;
  let statusTransitioned = false;
  await prisma.$transaction(async (tx) => {
    // 1. 更新交付记录为签收
    await tx.delivery_records.update({
      where: { id: deliveryId },
      data: {
        status: 'signed',
        signed_at: now,
      },
    });

    // 2. 检查该单据所有交付记录是否都已签收
    const allDeliveries = await tx.delivery_records.findMany({
      where: { document_id: existing.document_id },
      select: { status: true },
    });
    allSigned = allDeliveries.length > 0 && allDeliveries.every((d) => d.status === 'signed');

    // 3. 全部签收则 best-effort 推进单据状态到 delivery_completed（与签收在同一事务）
    if (allSigned) {
      const doc = await tx.documents.findUnique({
        where: { id: existing.document_id },
        select: { status: true, lock_version: true },
      });
      if (doc && doc.status !== 'delivery_completed' && doc.status !== 'archived') {
        try {
          await applyTransition(
            {
              documentId: existing.document_id,
              currentStatus: doc.status,
              currentLockVersion: doc.lock_version,
              to: 'delivery_completed',
              actor,
              reason: '所有交付记录已签收，自动推进',
            },
            tx,
          );
          statusTransitioned = true;
          logger.info('单据状态自动推进至 delivery_completed', {
            documentId: String(existing.document_id),
            actor: actor.name,
          });
        } catch (e) {
          logger.warn('单据状态自动推进失败', {
            documentId: String(existing.document_id),
            err: e,
          });
        }
      }
    }
  });

  logger.info('交付签收确认', {
    deliveryId: String(deliveryId),
    documentId: String(existing.document_id),
    actor: actor.name,
  });

  // 事务提交后再广播（避免客户端在事务未提交时刷新到旧数据）
  broadcastDeliveryChanged(existing.document_id);
  if (statusTransitioned) {
    broadcastStatusChange(existing.document_id, 'delivery_completed', actor);
  }

  return {
    id: deliveryId,
    documentId: existing.document_id,
    status: 'signed' as delivery_status,
    signedAt: now,
    allSigned,
    statusTransitioned,
  };
}

// ============================================================
// 效率文档§4 视图级防误触锁定
// ============================================================

const VIEW_LOCK_KEY = 'delivery';

/**
 * 锁定交付履约视图（防误触）。
 * 在 documents.view_locks JSON 中设置 delivery=true。
 */
export async function lockView(documentId: bigint, actor: { id: bigint; name: string }) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[VIEW_LOCK_KEY] = true;

  await prisma.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('交付履约视图锁定', {
    documentId: String(documentId),
    actor: actor.name,
  });

  return { documentId: String(documentId), view: VIEW_LOCK_KEY, locked: true };
}

/**
 * 解锁交付履约视图。
 */
export async function unlockView(documentId: bigint, actor: { id: bigint; name: string }) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { view_locks: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const locks = (doc.view_locks ?? {}) as Record<string, boolean>;
  locks[VIEW_LOCK_KEY] = false;

  await prisma.documents.update({
    where: { id: documentId },
    data: { view_locks: locks },
  });

  logger.info('交付履约视图解锁', {
    documentId: String(documentId),
    actor: actor.name,
  });

  return { documentId: String(documentId), view: VIEW_LOCK_KEY, locked: false };
}
