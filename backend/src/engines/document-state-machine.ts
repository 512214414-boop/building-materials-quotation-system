// v2.0 单据状态机引擎
// 设计原则：
//   1. 8 档 documents.status 任意双向可逆（无单向锁定；其它环节自动推进仍用此字段）
//   2. 客户端价格可见性：purchase_quote_status === confirmed（见 isPriceVisible / isPurchaseQuotePriceVisible）
//   3. 状态变更触发 WebSocket 广播 + 审计日志

import { prisma } from '../config/prisma.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { Errors } from '../utils/errors.js';
import {
  DocumentStatus,
  StageStatus,
  DOCUMENT_STATUS_ORDER,
  DOCUMENT_STATUS_LABELS,
  isPurchaseQuotePriceVisible,
} from '../types/index.js';

/**
 * 校验状态是否可从 from 流转到 to。
 * v2.0 设计：任意双向可逆，恒返回 true。
 * 保留此函数用于未来扩展（如需要限制某些流转）。
 */
export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  if (from === to) return false; // 相同状态不允许流转（无意义）
  return true;
}

/**
 * 客户端价格可见性判断。
 * 以 purchase_quote_status（StageStatus）为准：仅 confirmed 可见。
 */
export function isPriceVisible(purchaseQuoteStatus: StageStatus): boolean {
  return isPurchaseQuotePriceVisible(purchaseQuoteStatus);
}

/**
 * 获取可流转到的下一档状态列表（正向）。
 * 注意：v2.0 支持任意双向流转，此函数仅用于 UI 提示，不限制实际流转。
 */
export function getNextStatuses(status: DocumentStatus): DocumentStatus[] {
  const currentOrder = DOCUMENT_STATUS_ORDER[status];
  return (Object.keys(DOCUMENT_STATUS_ORDER) as DocumentStatus[]).filter(
    (s) => DOCUMENT_STATUS_ORDER[s] > currentOrder,
  );
}

/**
 * 获取可回退到的上一档状态列表（逆向）。
 * 注意：v2.0 支持任意双向流转，此函数仅用于 UI 提示，不限制实际流转。
 */
export function getPreviousStatuses(status: DocumentStatus): DocumentStatus[] {
  const currentOrder = DOCUMENT_STATUS_ORDER[status];
  return (Object.keys(DOCUMENT_STATUS_ORDER) as DocumentStatus[]).filter(
    (s) => DOCUMENT_STATUS_ORDER[s] < currentOrder,
  );
}

/** 状态流转参数 */
export interface TransitionParams {
  documentId: bigint;
  currentStatus: DocumentStatus;
  currentLockVersion: number;
  to: DocumentStatus;
  actor: { id: bigint; name: string };
  reason?: string;
}

/** 状态流转结果 */
export interface TransitionResult {
  documentId: bigint;
  from: DocumentStatus;
  to: DocumentStatus;
  newLockVersion: number;
}

/**
 * 状态机事务上下文类型：与 prisma.$transaction 回调的第一个参数同型。
 * 用于 applyTransition / transitionStatus 在事务内被调用时透传 tx。
 */
export type TransitionTx = Parameters<Parameters<typeof prisma['$transaction']>[0]>[0];

/**
 * 单据状态变更 WS 广播。
 * 单独抽出，便于事务内调用 applyTransition 后由调用方在事务提交后再广播。
 */
export function broadcastStatusChange(
  documentId: bigint,
  to: DocumentStatus,
  actor: { id: bigint; name: string },
) {
  wsManager.broadcast(String(documentId), {
    type: 'document.status_changed',
    documentId: String(documentId),
    status: to,
    actor: { id: String(actor.id), name: actor.name },
    ts: Date.now(),
  });
}

/**
 * 执行单据状态流转。
 * 流程：校验 → 乐观锁更新 status + lock_version → 审计日志 → WS 广播
 *
 * 事务支持：
 *  - 不传 tx：使用 prisma 顶层客户端，函数内完成广播（兼容历史调用方）。
 *  - 传 tx：所有写入走事务上下文，**不在此处广播**，由调用方在事务提交后
 *    调用 broadcastStatusChange 进行广播，避免事务未提交即触发客户端刷新。
 */
export async function applyTransition(
  params: TransitionParams,
  tx?: TransitionTx,
): Promise<TransitionResult> {
  const { documentId, currentStatus, currentLockVersion, to, actor, reason } = params;
  const client = tx ?? prisma;

  // 1. 校验
  if (!canTransition(currentStatus, to)) {
    throw Errors.badRequest(
      `状态不可从「${DOCUMENT_STATUS_LABELS[currentStatus]}」流转到「${DOCUMENT_STATUS_LABELS[to]}」`,
      42210,
    );
  }

  // 2. 乐观锁更新
  const updated = await client.documents.updateMany({
    where: { id: documentId, lock_version: currentLockVersion },
    data: { status: to, lock_version: { increment: 1 } },
  });

  if (updated.count === 0) {
    throw Errors.conflict(
      '单据已被其他操作修改，请刷新后重试（lock_version 不匹配）',
      40901,
    );
  }

  const newLockVersion = currentLockVersion + 1;

  // 3. 审计日志
  try {
    await client.audit_logs.create({
      data: {
        user_id: actor.id,
        // v11.0 解耦：actor.name 即 user.real_name 快照
        userName: actor.name,
        action: 'document.status_change',
        resource_type: 'document',
        resource_id: documentId,
        detail: {
          from: currentStatus,
          to,
          fromLabel: DOCUMENT_STATUS_LABELS[currentStatus],
          toLabel: DOCUMENT_STATUS_LABELS[to],
          reason: reason ?? null,
        },
      },
    });
  } catch (e) {
    logger.warn('状态流转审计日志写入失败', { documentId: String(documentId), err: e });
  }

  // 4. WS 广播（仅在非事务模式下广播；事务模式下由调用方在提交后广播）
  if (!tx) {
    broadcastStatusChange(documentId, to, actor);
  }

  logger.info('单据状态流转', {
    documentId: String(documentId),
    from: currentStatus,
    to,
    actor: actor.name,
    reason: reason ?? null,
    inTransaction: !!tx,
  });

  return {
    documentId,
    from: currentStatus,
    to,
    newLockVersion,
  };
}
