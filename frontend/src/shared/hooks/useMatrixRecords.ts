// useMatrixRecords — 多记录矩阵面板通用状态机（构成元素，组装式抽象）
//
// 设计依据：交互范式规范「组装式抽象（面向构成元素，非面向场景）」——所有多记录
//   矩阵面板（联系信息/售价/进价/单位等）共用的样板逻辑：数据行 + 末尾常驻空行 +
//   提交规范化（默认互斥 + 追加新空行）+ 增删改 + 互斥设默认。抽取为单一 hook，
//   各面板用本 hook + MatrixTable + 列渲染构成元素组装，禁止各面板重复手写状态机。
//
// 组成关系：
//   useMatrixRecords（状态机）← 多记录矩阵面板（联系信息/售价/进价…）
//     + MatrixTable（矩阵渲染）
//     + 列渲染构成元素（SuggestInput / DsInput / DictFieldInput…）
//     + RecordExpandPanel（外壳）
//
// 与 defaultRecord（默认规则工具）配合：normalize 未指定默认时取第一条（落库）。
// 行为与产品管理基准原型一致（空行输入有效值晋升为数据行并自动追加新空行）。

import { useState, useEffect } from 'react';

export interface UseMatrixRecordsOptions<T> {
  /** 外部记录（数据行集合，不含空行） */
  value: T[];
  /** 数据行判定（空行/未填完整行 = false） */
  isDataRow: (r: T) => boolean;
  /** 空记录工厂（末尾常驻空行；每次提交后重新创建） */
  blank: () => T;
  /** 默认规范化（未指定默认取第一条；默认实现 = 原样） */
  normalize?: (rows: T[]) => T[];
  /** 变更上抛（提交时：数据行数组） */
  onDirty: (rows: T[]) => void;
}

export interface UseMatrixRecordsResult<T> {
  /** 展示项（数据行 + 末尾空行） */
  items: T[];
  /** 数据行（不含空行） */
  dataRows: T[];
  /** 末尾空行 */
  lastBlank: T;
  /** 数据行数量 */
  dataRowCount: number;
  /** 提交：过滤数据行 → 规范化 → 追加新空行 → 上抛 */
  commit: (next: T[]) => void;
  /** 按索引更新（patch 合并）；数据行从空行晋升自动完成 */
  update: (idx: number, patch: Partial<T>) => void;
  /** 末尾空行编辑：输入有效值 → 晋升为数据行并自动追加新空行 */
  updateLastBlank: (patch: Partial<T>) => void;
  /** 删除（至少保留一行；删除后重新规范化默认） */
  remove: (idx: number) => void;
  /** 互斥设默认（field 默认 isDefault；其余项清除该标记） */
  setDefault: (idx: number, field?: keyof T) => void;
}

/**
 * 多记录矩阵通用状态机：数据行 + 末尾常驻空行 + 提交规范化 + 增删改 + 互斥默认。
 * 行为对齐产品管理基准原型（矩阵面板空行通式：输入有效值自动追加）。
 */
export function useMatrixRecords<T>({
  value,
  isDataRow,
  blank,
  normalize,
  onDirty,
}: UseMatrixRecordsOptions<T>): UseMatrixRecordsResult<T> {
  // items = [数据行..., 末尾空行]；末尾空行永远保留，输入有效值后晋升并追加新空行
  const [items, setItems] = useState<T[]>(() => {
    const base = (value ?? []).filter(isDataRow);
    return [...(normalize ? normalize(base) : base), blank()];
  });

  const valueSig = JSON.stringify(value ?? []);
  useEffect(() => {
    const base = (JSON.parse(valueSig) as T[]).filter(isDataRow);
    setItems([...(normalize ? normalize(base) : base), blank()]);
    // valueSig 变化时重建（面板打开 / 列表刷新）；编辑中 value 不变则不重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueSig]);

  const dataRows = items.slice(0, -1);
  const lastBlank = items[items.length - 1];
  const dataRowCount = dataRows.filter(isDataRow).length;

  const commit = (next: T[]) => {
    const valid = next.filter(isDataRow);
    const normalized = normalize ? normalize(valid) : valid;
    setItems([...normalized, blank()]);
    onDirty(normalized);
  };

  const update = (idx: number, patch: Partial<T>) => {
    commit(items.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const updateLastBlank = (patch: Partial<T>) => {
    const candidate = { ...lastBlank, ...patch };
    if (isDataRow(candidate)) {
      commit([...dataRows, candidate]);
    } else {
      setItems(items.map((c, i) => (i === items.length - 1 ? candidate : c)));
    }
  };

  const remove = (idx: number) => {
    if (dataRowCount <= 1) return;
    commit(items.filter((_, i) => i !== idx));
  };

  const setDefault = (idx: number, field: keyof T = 'isDefault' as keyof T) => {
    commit(
      dataRows.map((c, i) =>
        i === idx ? { ...c, [field]: true } : { ...c, [field]: false },
      ) as T[],
    );
  };

  return { items, dataRows, lastBlank, dataRowCount, commit, update, updateLastBlank, remove, setDefault };
}

export default useMatrixRecords;
