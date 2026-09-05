/**
 * 地址矩阵外壳（泛型）
 *
 * 供应商地址 / 客户地址的矩阵**行为层一字不差**：
 * 多记录、默认互斥、空行晋升、删除保护（最后一条不可删）、失焦即脏。
 * 差异只有字段和文案（供应商带坐标与地址类型字典，客户带联系人电话与省市区）。
 *
 * 所以这里只收行为层外壳，字段与文案由各页通过 cfg 传入。
 * 这样「默认互斥怎么算、空行怎么晋升、最后一条为什么不能删」只有一处实现，
 * 不会出现改了供应商忘了客户的情况。
 *
 * 不把 buildRows 也收进来的理由：两个表的字段语义不同
 * （addressTypeName 是字典引用、label 是自由文本；
 *   coordinate 需要经纬度解析、region 需要省市区解析），
 * 硬塞进一个通用列定义只会长出 if。差异是配置，不是抽象。
 */
import type { ReactNode } from 'react';
import MatrixTable, { type MatrixRowConfig } from '../MatrixTable.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import useMatrixRecords from '../../hooks/useMatrixRecords.js';

/** 数据行操作 API，由外壳接好线后交给 cfg 使用 */
export interface AddressMatrixApi<T> {
  update: (idx: number, patch: Partial<T>) => void;
  remove: (idx: number) => void;
  /** 设为默认（互斥：设了这条，其余自动取消） */
  setDefault: (idx: number) => void;
}

/** 空行操作 API */
export interface AddressBlankApi<T> {
  updateLastBlank: (patch: Partial<T>) => void;
}

export interface AddressMatrixConfig<T> {
  headerName: string;
  headerPrice: string;
  midCols: string[];
  minWidth: number;
  template: string;
  /** 行 key 前缀，用于 rowSelectDisabled 判定（如 'address_'） */
  rowKeyPrefix: string;
  isDataRow: (row: T) => boolean;
  blank: () => T;
  normalize: (rows: T[]) => T[];
  buildRows: (
    rows: T[],
    api: AddressMatrixApi<T>,
    canWrite: boolean,
    deleteDisabled: (idx: number) => boolean,
  ) => MatrixRowConfig[];
  addNameCell: (api: AddressBlankApi<T>) => ReactNode;
  addMidCells: (api: AddressBlankApi<T>) => ReactNode[];
  addPriceCell: (api: AddressBlankApi<T>) => ReactNode;
}

export default function ArchiveAddressMatrixShell<T extends { isDefault?: boolean }>({
  cfg,
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate,
}: {
  cfg: AddressMatrixConfig<T>;
  value: T[];
  canWrite: boolean;
  onDirty: (rows: T[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  gridTemplate?: string;
}) {
  const matrix = useMatrixRecords<T>({
    value: value ?? [],
    isDataRow: cfg.isDataRow,
    blank: cfg.blank,
    normalize: cfg.normalize,
    onDirty,
  });

  // 最后一条不可删：删空了就没有默认地址可设，属于把数据改成非法状态
  const deleteDisabled = (_idx: number) => !canWrite || matrix.dataRowCount <= 1;

  const rows = cfg.buildRows(
    matrix.dataRows,
    {
      update: matrix.update,
      remove: matrix.remove,
      setDefault: (idx: number) => matrix.setDefault(idx, 'isDefault'),
    },
    canWrite,
    deleteDisabled,
  );

  const blankApi: AddressBlankApi<T> = { updateLastBlank: matrix.updateLastBlank };

  return (
    <div className={fill ? 'ds-record-panel-fill' : undefined}>
      <RecordExpandPanel minWidth={fill ? undefined : cfg.minWidth}>
        <MatrixTable
          headerName={cfg.headerName}
          headerPrice={cfg.headerPrice}
          midCols={cfg.midCols}
          rows={rows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk: string) => !rk.startsWith(cfg.rowKeyPrefix)}
          addNameCell={cfg.addNameCell(blankApi)}
          addMidCells={cfg.addMidCells(blankApi)}
          addPriceCell={cfg.addPriceCell(blankApi)}
          showAddButton={false}
          template={gridTemplate ?? cfg.template}
          disabled={!canWrite}
        />
      </RecordExpandPanel>
    </div>
  );
}
