/** 开单行落库不变量（P-014 / P-015）。禁止在业务页再写一份。 */

/** 0/''/null 不能当档案 ID 落库（P-015） */
export function toNullableId(v: unknown): string | undefined {
  if (v == null || v === '' || v === 0 || v === '0') return undefined;
  return String(v);
}

/** 「认成货」：规格、牌子、单位都在（售后回库 / 开单标准行同一口径） */
export function isRecognizedGoods(line: {
  specId?: string | number | bigint | null;
  brandId?: string | number | bigint | null;
  unitId?: string | number | bigint | null;
}): boolean {
  return !!(toNullableId(line.specId) && toNullableId(line.brandId) && toNullableId(line.unitId));
}

/** 空行按页位置插入：insertSeq = 表格下标 + 1（P-014） */
export function insertSeqFromIndex(insertIndex: unknown): number | undefined {
  return typeof insertIndex === 'number' ? insertIndex + 1 : undefined;
}

/** addLine 返回后按原下标 splice，禁止 append 到表尾（P-014） */
export function splicePersistedLineAtIndex<T>(
  prev: T[],
  nextLine: T,
  idx: number | null | undefined,
): T[] {
  if (idx == null || idx < 0 || idx >= prev.length) return [...prev, nextLine];
  const next = [...prev];
  next.splice(idx, 0, nextLine);
  return next;
}

/** 「下方插入」：插在当前行序号之后，后端按 seq 后移后续行 */
export function insertSeqAfterLine(seq: number): number {
  return Math.max(1, seq + 1);
}

/** 「下方插入」落表：插在指定行后面，并给后续行序号 +1（与后端后移 seq 对齐） */
export function spliceLineAfterIndex<T>(prev: T[], afterIndex: number, nextLine: T): T[] {
  if (afterIndex < 0 || afterIndex >= prev.length) return [...prev, nextLine];
  const next = [...prev];
  next.splice(afterIndex + 1, 0, nextLine);
  for (let i = afterIndex + 2; i < next.length; i++) {
    const row = next[i] as T & { seq?: number };
    if (typeof row.seq === 'number') {
      next[i] = { ...row, seq: row.seq + 1 };
    }
  }
  return next;
}
