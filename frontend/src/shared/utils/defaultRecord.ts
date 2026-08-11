// defaultRecord — 同构多记录字段「默认记录」统一规则（SSOT）
//
// 设计依据：表格工程范式「多记录字段（一列一条完整记录 + ▾ 展开矩阵面板）」，
//   每条可标记默认（isDefault）；用户未指定默认时按全局规则取第一条（录入顺序）。
//   联系信息（供应商/客户）、售价（默认售价类型）、进价（默认供应商）等多记录
//   字段均复用本规则，禁止各功能各自实现（代码冗余 + 语义漂移）。

// ============================================================
// §1 类型
// ============================================================

/** 具有默认标记的多记录项（业务记录需具备 isDefault 字段） */
export interface DefaultableRecord {
  isDefault?: boolean;
}

// ============================================================
// §2 默认记录解析
// ============================================================

/**
 * 解析默认记录：
 *   用户指定 isDefault=true → 取默认
 *   用户未指定任何默认 → 全局规则取第一条（录入顺序）
 *   空列表 → null
 */
export function resolveDefaultRecord<T extends DefaultableRecord>(
  records: T[] | null | undefined,
): T | null {
  if (!records?.length) return null;
  return records.find((r) => r.isDefault) ?? records[0];
}

// ============================================================
// §3 默认记录归一化
// ============================================================

/**
 * 归一化默认标记：至多一条 isDefault=true；
 * 用户未指定任何默认时，全局规则：第一条自动成为默认。
 */
export function normalizeDefaultRecords<T extends DefaultableRecord>(records: T[]): T[] {
  const hasDefault = records.some((r) => r.isDefault);
  return records.map((r, i) => ({ ...r, isDefault: hasDefault ? Boolean(r.isDefault) : i === 0 }));
}
