// 联系信息矩阵（供应商联系人 / 库房负责人）— 统一点值确认层 + useMatrixRecords
import MatrixTable, { type MatrixRowConfig } from '../MatrixTable.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import useMatrixRecords from '../../hooks/useMatrixRecords.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import { contactMethodDict } from '../../config/contactMethodDict.js';
import { isContactLoginValue, CONTACT_LOGIN_VALUE_HINT } from '../../utils/contactLoginValue.js';
import { FieldCell } from '../cells/FieldCell.js';

export interface ArchiveContactRecord {
  name: string;
  method: string;
  value: string;
  isDefault?: boolean;
}

function blankContact(): ArchiveContactRecord {
  return { name: '', method: '', value: '', isDefault: false };
}

function isContactDataRow(c: ArchiveContactRecord): boolean {
  return Boolean(c.name.trim() || c.value.trim());
}

function normalizeContacts(contacts: ArchiveContactRecord[]): ArchiveContactRecord[] {
  return normalizeDefaultRecords(contacts);
}

const COPY = {
  contact: {
    headerName: '联系人',
    namePh: '联系人',
    nameEmptyPh: '输入联系人…',
    valuePh: '联系方式',
    valueEmptyPh: '输入后自动追加',
    addNameTitle: '新增联系人',
    addMethodTitle: '选择联系方式',
    addValueTitle: '新增联系方式',
    editNameTitle: '修改联系人',
    editMethodTitle: '修改联系方式',
    editValueTitle: '修改联系方式',
    defaultOn: '当前默认联系人',
    defaultOff: '设为默认联系人',
    delete: '删除该联系人',
  },
  customer: {
    headerName: '联系人',
    namePh: '联系人',
    nameEmptyPh: '输入联系人…',
    valuePh: '登录账号 / 电话 / 微信',
    valueEmptyPh: '输入后自动追加',
    addNameTitle: '新增联系人',
    addMethodTitle: '选择联系方式',
    addValueTitle: '新增联系方式（默认这条可登录）',
    editNameTitle: '修改联系人',
    editMethodTitle: '修改联系方式',
    editValueTitle: CONTACT_LOGIN_VALUE_HINT,
    defaultOn: '当前登录主号',
    defaultOff: '设为登录主号',
    delete: '删除该联系人',
  },
  manager: {
    headerName: '负责人',
    namePh: '负责人',
    nameEmptyPh: '输入负责人…',
    valuePh: '联系方式',
    valueEmptyPh: '输入后自动追加',
    addNameTitle: '新增负责人',
    addMethodTitle: '选择联系方式',
    addValueTitle: '新增联系方式',
    editNameTitle: '修改负责人',
    editMethodTitle: '修改联系方式',
    editValueTitle: '修改联系方式',
    defaultOn: '当前默认负责人',
    defaultOff: '设为默认负责人',
    delete: '删除该负责人',
  },
} as const;

function buildContactRows(
  contacts: ArchiveContactRecord[],
  copy: (typeof COPY)[keyof typeof COPY],
  onUpdate: (idx: number, patch: Partial<ArchiveContactRecord>) => void,
  onRemove: (idx: number) => void,
  onSetDefault: (idx: number) => void,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
  loginValue?: boolean,
): MatrixRowConfig[] {
  return contacts.map((c, idx) => ({
    rowKey: `contact_${idx}`,
    nameCell: (
      <FieldCell
        value={c.name}
        placeholder={isContactDataRow(c) ? copy.namePh : copy.nameEmptyPh}
        disabled={!canWrite}
        title={copy.editNameTitle}
        onApply={(v) => onUpdate(idx, { name: v })}
      />
    ),
    midCells: [
      <FieldCell
        key="method"
        value={c.method}
        placeholder="方式"
        disabled={!canWrite}
        title={copy.editMethodTitle}
        suggestField="contactMethod"
        dictConfig={contactMethodDict}
        onApply={(v) => onUpdate(idx, { method: v })}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    priceRender: (
      <FieldCell
        value={c.value}
        placeholder={isContactDataRow(c) ? copy.valuePh : copy.valueEmptyPh}
        disabled={!canWrite}
        title={copy.editValueTitle}
        onApply={(v) => {
          if (loginValue && v.trim() && !isContactLoginValue(v)) return;
          onUpdate(idx, { value: v });
        }}
      />
    ),
    isDefault: Boolean(c.isDefault),
    onIsDefaultChange: () => onSetDefault(idx),
    defaultTitle: c.isDefault ? copy.defaultOn : copy.defaultOff,
    defaultDisabled: !canWrite || !isContactDataRow(c),
    onDelete: () => onRemove(idx),
    deleteTitle: copy.delete,
    deleteDisabled: deleteDisabled(idx),
  }));
}

export default function ArchiveContactMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  variant = 'contact',
  gridTemplate = '96px 96px minmax(120px,1fr) 28px 24px',
}: {
  value: ArchiveContactRecord[];
  canWrite: boolean;
  onDirty: (contacts: ArchiveContactRecord[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  variant?: 'contact' | 'manager' | 'customer';
  gridTemplate?: string;
}) {
  const copy = COPY[variant];
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isContactDataRow,
    blank: blankContact,
    normalize: normalizeContacts,
    onDirty,
  });

  const rows = buildContactRows(
    matrix.dataRows,
    copy,
    matrix.update,
    matrix.remove,
    (idx) => matrix.setDefault(idx, 'isDefault'),
    canWrite,
    (_idx) => !canWrite || matrix.dataRowCount <= 1,
    variant === 'customer',
  );

  return (
    <div className={fill ? 'ds-record-panel-fill' : undefined}>
      <RecordExpandPanel minWidth={fill ? undefined : 320}>
        <MatrixTable
          headerName={copy.headerName}
          headerPrice="联系方式"
          midCols={['方式']}
          rows={rows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk) => !rk.startsWith('contact_')}
          addNameCell={
            <FieldCell
              placeholder={copy.nameEmptyPh}
              title={copy.addNameTitle}
              onApply={(v) => matrix.updateLastBlank({ name: v })}
            />
          }
          addMidCells={[
            <FieldCell
              key="method"
              placeholder="方式"
              title={copy.addMethodTitle}
              suggestField="contactMethod"
              dictConfig={contactMethodDict}
              onApply={(v) => matrix.updateLastBlank({ method: v })}
            />,
          ]}
          addPriceCell={
            <FieldCell
              placeholder={copy.valueEmptyPh}
              title={copy.addValueTitle}
              onApply={(v) => {
                if (variant === 'customer' && v.trim() && !isContactLoginValue(v)) return;
                matrix.updateLastBlank({ value: v });
              }}
            />
          }
          showAddButton={false}
          template={gridTemplate}
          disabled={!canWrite}
        />
      </RecordExpandPanel>
    </div>
  );
}

export { isContactDataRow, normalizeContacts, blankContact };
