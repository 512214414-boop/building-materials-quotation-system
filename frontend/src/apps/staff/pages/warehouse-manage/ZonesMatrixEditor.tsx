import MatrixTable, { type MatrixRowConfig } from '../../../../shared/components/MatrixTable.js';
import RecordExpandPanel from '../../../../shared/components/RecordExpandPanel.js';
import {
  ArchiveEmptyFieldCell,
  ArchiveFieldCell,
} from '../../../../shared/components/product-picker/PickerInlineCells.js';
import useMatrixRecords from '../../../../shared/hooks/useMatrixRecords.js';
import type { WarehouseZoneItem } from '../../../../shared/services/api/inventoryApi.js';

export function blankZone(): WarehouseZoneItem {
  return { name: '', sortOrder: 0 };
}

export function isZoneDataRow(z: WarehouseZoneItem): boolean {
  return Boolean(z.name.trim());
}

export function formatWarehouseCoord(w: { lng?: number | null; lat?: number | null } | null): string {
  if (w?.lng != null && w?.lat != null) return `${w.lng},${w.lat}`;
  return '';
}

export function parseWarehouseCoord(text: string): { lng?: number; lat?: number } {
  const parts = text
    .split(/[,，\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length >= 2) return { lng: parts[0], lat: parts[1] };
  return {};
}

function buildZoneRows(
  zones: WarehouseZoneItem[],
  onUpdate: (idx: number, patch: Partial<WarehouseZoneItem>) => void,
  onRemove: (idx: number) => void,
  canWrite: boolean,
): MatrixRowConfig[] {
  return zones.map((z, idx) => ({
    rowKey: `zone_${idx}`,
    nameCell: (
      <ArchiveFieldCell
        value={z.name}
        placeholder="区位名"
        disabled={!canWrite}
        title="修改区位"
        onApply={(v: string) => onUpdate(idx, { name: v })}
      />
    ),
    price: '',
    onPriceChange: () => undefined,
    isDefault: false,
    onIsDefaultChange: () => undefined,
    defaultTitle: '',
    onDelete: () => onRemove(idx),
    deleteTitle: '删除该区位',
    deleteDisabled: !canWrite,
  }));
}

export default function ZonesMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
}: {
  value: WarehouseZoneItem[];
  canWrite: boolean;
  onDirty: (zones: WarehouseZoneItem[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
}) {
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isZoneDataRow,
    blank: blankZone,
    onDirty,
  });
  const rows = buildZoneRows(matrix.dataRows, matrix.update, matrix.remove, canWrite);
  return (
    <div className={fill ? 'ds-record-panel-fill' : undefined}>
      <RecordExpandPanel minWidth={fill ? undefined : 240}>
        <MatrixTable
          headerName="区位名"
          showPrice={false}
          showDefault={false}
          rows={rows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk: string) => !rk.startsWith('zone_')}
          addNameCell={
            <ArchiveEmptyFieldCell
              placeholder="输入区位…"
              title="新增区位"
              onApply={(v: string) => matrix.updateLastBlank({ name: v })}
            />
          }
          showAddButton={false}
          disabled={!canWrite}
        />
      </RecordExpandPanel>
    </div>
  );
}
