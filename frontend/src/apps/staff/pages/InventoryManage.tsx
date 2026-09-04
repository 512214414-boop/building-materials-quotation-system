// v1.7.0 库存台账（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》4 / 5.1 / 9.2 / 9.3 / 10.4）：
//   - 库存台账：仓库 × SKU，加权平均进价（本仓入库采购单价）
//   - 内部出库成本 = 当前仓库加权平均进价；库存不足时已有的库存全额扣除（缺口走欠库/外部补齐）
//   - 流水追溯：inventory_ledger（ledger_no / biz_no 双向可查）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp } from 'antd';
import { HistoryOutlined, SettingOutlined, PlusOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import { deriveTableColumns, mergeColumns } from '../../../shared/config/deriveTableColumns.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import ProductPicker, { type SelectedPrice } from '../../../shared/components/ProductPicker.js';
import { PickerHostTrigger } from '../../../shared/components/PickerSlotChrome.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import { resolveGuard } from '../../../shared/config/resolveGuard.js';
import {
  listInventory,
  listInventoryLedgers,
  adjustInventory,
  openingInventory,
  listEnabledWarehouses,
  type InventoryRow,
  type InventoryLedgerRow,
  type WarehouseView,
} from '../../../shared/services/api/inventoryApi.js';
import type { SkuSearchRow, SkuOptionUnit } from '../../../shared/services/api/baseDataApi.js';

const MOVEMENT_LABELS: Record<string, string> = {
  in: '入库',
  out: '出库',
  adjust: '盘点',
};

const MOVEMENT_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
  in: 'success',
  out: 'warning',
  adjust: 'default',
};

// ============================================================
// 盘点调整弹窗
// ============================================================

function AdjustDialog({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: InventoryRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [targetQty, setTargetQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && record) {
      setTargetQty(String(record.qty ?? 0));
      setUnitCost(String(record.weighted_avg_cost ?? ''));
      setRemark('');
    }
  }, [open, record]);

  const handleSave = async () => {
    const block = resolveGuard('inventory_adjust', {
      form: { targetQty, unitCost },
    });
    if (block) {
      message.warning(block);
      return;
    }
    if (!record) return;
    const qty = Number(targetQty);
    const costVal = unitCost.trim() === '' ? undefined : Number(unitCost);
    setSaving(true);
    try {
      await adjustInventory(record.id, {
        targetQty: qty,
        remark: remark.trim() || undefined,
        unitCost: costVal,
      });
      message.success('盘点调整成功');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as { message?: string })?.message || '盘点调整失败');
    } finally {
      setSaving(false);
    }
  };

  const fullName = record
    ? record.productName || '—'
    : '';
  return (
    <DsDialog
      open={open}
      title="盘点调整"
      width={420}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="确认调整"
      cancelText="取消"
    >
      {record && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-default)' }}>
            {fullName} · {record.unitName ?? ''}
          </div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            当前库存 {record.qty} · 加权平均进价 ¥{record.weighted_avg_cost}
          </div>
          <div>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
              盘点后数量
            </div>
            <DsInput
              size="sm"
              value={targetQty}
              onChange={(e) => setTargetQty(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              inputMode="decimal"
              style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
              成本单价（期初必填，空白则保持原均价）
            </div>
            <DsInput
              size="sm"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder={String(record.weighted_avg_cost ?? 0)}
              inputMode="decimal"
              style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
              备注
            </div>
            <DsInput
              size="sm"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="盘点原因（可选）"
              style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
          </div>
        </div>
      )}
    </DsDialog>
  );
}

// ============================================================
// 流水弹窗
// ============================================================

function LedgerDialog({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: InventoryRow | null;
  onClose: () => void;
}) {
  const [list, setList] = useState<InventoryLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setLoading(true);
    listInventoryLedgers({
      warehouseId: record.warehouse_id,
      brandId: record.brand_id,
      unitId: record.unit_id,
      page: 1,
      pageSize: 50,
    })
      .then((res) => setList(res.list ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [open, record]);

  const ledgerColumns: UnifiedTableColumn<InventoryLedgerRow>[] = useMemo(
    () => [
      {
        key: 'movement_type',
        title: '类型',
        dataIndex: 'movement_type',
        minWidth: 70,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <DsTag color={MOVEMENT_COLORS[val] ?? 'default'}>{MOVEMENT_LABELS[val] ?? val}</DsTag>
        ),
      },
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span
            style={{
              color: val > 0 ? 'var(--status-success-default)' : val < 0 ? 'var(--status-warning-default)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-family-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {val > 0 ? `+${val}` : val}
          </span>
        ),
      },
      {
        key: 'unit_cost',
        title: '单价',
        dataIndex: 'unit_cost',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>
            ¥{val}
          </span>
        ),
      },
      {
        key: 'biz_no',
        title: '业务单号',
        dataIndex: 'biz_no',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null, row: InventoryLedgerRow) => (
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val || row.ledger_no || '—'}
          </span>
        ),
      },
      {
        key: 'balance_qty',
        title: '结存',
        dataIndex: 'balance_qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {val}
          </span>
        ),
      },
      {
        key: 'created_at',
        title: '时间',
        dataIndex: 'created_at',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val ? new Date(val).toLocaleString('zh-CN') : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  const fullName = record
    ? record.productName || '—'
    : '';
  return (
    <DsDialog
      open={open}
      title={`库存流水 · ${fullName}`}
      width={760}
      onCancel={onClose}
      footer={null}
    >
      <UnifiedTable<InventoryLedgerRow>
        rowKey="id"
        columns={ledgerColumns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无库存流水"
        pagination={false}
      />
    </DsDialog>
  );
}

// ============================================================
// 期初入库条（无库存行时建档入库；贴格选品，不叠独占弹窗）
// ============================================================

function OpeningStrip({
  warehouses,
  onDone,
  onCancel,
}: {
  warehouses: WarehouseView[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { message } = AntdApp.useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(() => warehouses.find((w) => w.isMain)?.id ?? warehouses[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [sku, setSku] = useState<SkuSearchRow | null>(null);
  const [unit, setUnit] = useState<SkuOptionUnit | null>(null);
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelect = (next: SkuSearchRow, u: SkuOptionUnit, price: SelectedPrice | null) => {
    setSku(next);
    setUnit(u);
    setLabel(next.productName || '—');
    const cost = price?.purchase?.price ?? u.defaultPurchasePrice ?? next.purchasePriceDefault;
    if (cost != null) setUnitCost(String(cost));
    setPickerOpen(false);
  };

  const handleSave = async () => {
    const block = resolveGuard('inventory_opening', {
      form: { warehouseId, sku, unit, qty, unitCost },
    });
    if (block) {
      message.warning(block);
      return;
    }
    // 守卫（inventory_opening.requires）已断言 sku/unit 非空；此处仅窄化类型
    if (!sku || !unit) return;
    const qtyNum = Number(qty);
    const costNum = Number(unitCost);
    setSaving(true);
    try {
      await openingInventory({
        warehouseId,
        specId: sku.specId,
        brandId: sku.brandId,
        unitId: unit.unitId,
        qty: qtyNum,
        unitCost: costNum,
        remark: '期初入库',
      });
      message.success('期初已入库');
      onDone();
    } catch (e) {
      message.error((e as { message?: string })?.message || '期初入库失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-tertiary)',
      }}
    >
      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>期初入库</span>
      <DsSelect
        size="sm"
        value={warehouseId || undefined}
        onChange={(v: string | undefined) => setWarehouseId(v ?? '')}
        options={warehouses.map((w) => ({ label: w.isMain ? `${w.name}（主仓）` : w.name, value: w.id }))}
        style={{ width: 140 }}
      />
      <div
        ref={hostRef}
        style={{
          width: COL_WIDTHS.NAME_QUOTE,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border-neutral-l2)',
          borderRadius: 'var(--radius-4)',
          background: 'var(--bg-base)',
        }}
      >
        <PickerHostTrigger
          label={label}
          placeholder="点此选品"
          onOpen={() => setPickerOpen(true)}
        />
      </div>
      <ProductPicker
        open={pickerOpen}
        anchorRef={hostRef}
        initialKeyword={label}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        isStaff
        dropdownMode
        hideHostInput
        onDraftCommit={(kw) => setLabel(kw)}
        onQuickCreate={() => message.info('请到产品管理或开单里建档后再做期初')}
      />
      <DsInput
        size="sm"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
        placeholder="数量"
        inputMode="decimal"
        style={{ width: COL_WIDTHS.AMOUNT }}
      />
      <DsInput
        size="sm"
        value={unitCost}
        onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ''))}
        placeholder="成本单价"
        inputMode="decimal"
        style={{ width: COL_WIDTHS.AMOUNT }}
      />
      <DsButton size="sm" variant="primary" onClick={() => void handleSave()} disabled={saving}>
        {saving ? '写入中…' : '确认期初'}
      </DsButton>
      <DsButton size="sm" variant="ghost" onClick={onCancel}>
        取消
      </DsButton>
    </div>
  );
}

// ============================================================
// 页面主组件
// ============================================================

export default function InventoryManage() {
  const perm = usePermission('inventory');
  const canWrite = perm === 'rw';

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [adjustRecord, setAdjustRecord] = useState<InventoryRow | null>(null);
  const [ledgerRecord, setLedgerRecord] = useState<InventoryRow | null>(null);
  const [showOpening, setShowOpening] = useState(false);

  useEffect(() => {
    listEnabledWarehouses()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInventory({
        warehouseId: warehouseId || undefined,
        keyword: keyword || undefined,
        status: statusFilter || undefined,
        page,
        pageSize,
      });
      setList(res.list ?? []);
      setTotal(res.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, keyword, statusFilter, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const columns: UnifiedTableColumn<InventoryRow>[] = useMemo(
    () => mergeColumns(deriveTableColumns('inventory', 'inventory'), [
      // 操作列必须在前面（点即所得：字段多/手机端无需翻到最后）
      {
        key: 'op',
        title: '操作',
        dataIndex: 'op',
        minWidth: 120,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, r: InventoryRow) => (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <DsButton
              size="sm"
              variant="ghost"
              icon={<HistoryOutlined />}
              onClick={() => setLedgerRecord(r)}
              title="查看库存流水"
            />
            <DsButton
              size="sm"
              variant="ghost"
              icon={<SettingOutlined />}
              disabled={!canWrite}
              onClick={() => setAdjustRecord(r)}
              title="盘点调整"
            />
          </span>
        ),
      },
      {
        key: 'product',
        title: '产品',
        dataIndex: 'productName',
        minWidth: 240,
        align: 'center',
        renderMode: 'custom',
        render: (_val: string, r: InventoryRow) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {r.mainImageThumbUrl ? (
              <img
                src={r.mainImageThumbUrl}
                alt=""
                style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover' }}
              />
            ) : null}
            <span style={{ fontWeight: 500, color: 'var(--text-default)' }}>
              {r.productName || '—'}
            </span>
          </span>
        ),
      },
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unitName',
        minWidth: 60,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | undefined) => (
          <span style={{ color: 'var(--text-secondary)' }}>{val || '—'}</span>
        ),
      },
      {
        key: 'warehouse',
        title: '仓库',
        dataIndex: 'warehouse_id',
        minWidth: 110,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => {
          const w = warehouses.find((x) => x.id === val);
          return (
            <span style={{ color: 'var(--text-default)' }}>
              {w?.name ?? val}
              {w?.isMain ? <DsTag color="brand" style={{ marginLeft: 4 }}>主</DsTag> : null}
            </span>
          );
        },
      },
      {
        key: 'qty',
        title: '库存数量',
        dataIndex: 'qty',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span
            style={{
              fontWeight: 600,
              color: val > 0 ? 'var(--text-default)' : 'var(--status-warning-default)',
              fontFamily: 'var(--font-family-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {val}
          </span>
        ),
      },
      {
        key: 'weighted_avg_cost',
        title: '加权平均进价',
        dataIndex: 'weighted_avg_cost',
        minWidth: 110,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span
            style={{
              color: 'var(--status-discount-default)',
              fontFamily: 'var(--font-family-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ¥{val}
          </span>
        ),
      },
      {
        key: 'last_in_at',
        title: '最近入库',
        dataIndex: 'last_in_at',
        minWidth: 150,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: val ? 'var(--text-secondary)' : 'var(--text-quaternary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val ? new Date(val).toLocaleString('zh-CN') : '—'}
          </span>
        ),
      },
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouses, canWrite],
  );

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '项',
        statusHint: '库存 = 仓库 × 单品 · 内部出库成本取加权平均进价 · 无行时用期初入库',
        actions: canWrite ? (
          <DsButton size="sm" variant="secondary" icon={<PlusOutlined />} onClick={() => setShowOpening(true)}>
            期初入库
          </DsButton>
        ) : null,
      }}
      bizStrip={{
        left: (
          <>
            <DsSelect
              size="sm"
              value={warehouseId || undefined}
              onChange={(v: string | undefined) => {
                setWarehouseId(v ?? '');
                setPage(1);
              }}
              options={[
                { label: '全部仓库', value: '' },
                ...warehouses.map((w) => ({ label: w.isMain ? `${w.name}（主仓）` : w.name, value: w.id })),
              ]}
              style={{ width: 150 }}
              allowClear
            />
            <DsInput
              size="sm"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="检索产品名/规格/品牌"
              style={{ width: 200, background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
            <DsSelect
              size="sm"
              value={statusFilter || undefined}
              onChange={(v: string | undefined) => {
                setStatusFilter(v ?? '');
                setPage(1);
              }}
              options={[
                { label: '全部库存', value: '' },
                { label: '有库存', value: 'instock' },
                { label: '零库存', value: 'zero' },
              ]}
              style={{ width: 110 }}
              allowClear
            />
            <DsButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setPage(1);
                void fetchList();
              }}
            >
              查询
            </DsButton>
          </>
        ),
      }}
      preContent={
        showOpening ? (
          <OpeningStrip
            warehouses={warehouses}
            onDone={() => {
              setShowOpening(false);
              void fetchList();
            }}
            onCancel={() => setShowOpening(false)}
          />
        ) : null
      }
    >
      <UnifiedTable<InventoryRow>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无库存数据"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 项`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <AdjustDialog
        open={adjustRecord != null}
        record={adjustRecord}
        onClose={() => setAdjustRecord(null)}
        onSaved={() => void fetchList()}
      />
      <LedgerDialog
        open={ledgerRecord != null}
        record={ledgerRecord}
        onClose={() => setLedgerRecord(null)}
      />
    </ViewFrame>
  );
}
