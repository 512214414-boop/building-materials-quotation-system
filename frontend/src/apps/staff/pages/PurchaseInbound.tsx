// 独立采购入库（不绑客户订单的囤货入库）
// 确认即落账：加库存 + 应付 purchase + 冲欠库。选品走 ProductPicker，不合成开单链。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import ProductPicker, {
  buildQuickCreateSelection,
  type SelectedPrice,
} from '../../../shared/components/ProductPicker.js';
import QuickCreateConfirmDialog from '../../../shared/components/QuickCreateConfirmDialog.js';
import SupplierPicker from '../../../shared/components/SupplierPicker.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import {
  listPurchaseInbounds,
  confirmPurchaseInbound,
  type PurchaseInbound,
} from '../../../shared/services/api/purchaseInboundApi.js';
import { listEnabledWarehouses, type WarehouseView } from '../../../shared/services/api/inventoryApi.js';
import type { SkuSearchRow, SkuOptionUnit } from '../../../shared/services/api/baseDataApi.js';

interface DraftLine {
  key: string;
  productRef: string;
  specId: string;
  brandId: string;
  unitId: string;
  productName: string;
  specModel: string;
  brandName: string;
  categoryName: string;
  unitName: string;
  qty: string;
  unitCost: string;
}

function emptyDraft(): DraftLine {
  return {
    key: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productRef: '',
    specId: '',
    brandId: '',
    unitId: '',
    productName: '',
    specModel: '',
    brandName: '',
    categoryName: '',
    unitName: '',
    qty: '1',
    unitCost: '',
  };
}

function fillFromSku(sku: SkuSearchRow, unit: SkuOptionUnit, selectedPrice: SelectedPrice | null): Partial<DraftLine> {
  const cost =
    selectedPrice?.purchase?.price ??
    unit.defaultPurchasePrice ??
    sku.purchasePriceDefault ??
    '';
  return {
    productRef: [sku.brandName, sku.productName, sku.specModel].filter(Boolean).join(' '),
    specId: sku.specId,
    brandId: sku.brandId,
    unitId: unit.unitId,
    productName: sku.productName,
    specModel: sku.specModel,
    brandName: sku.brandName,
    categoryName: sku.categoryName,
    unitName: unit.unitName,
    unitCost: cost === '' || cost == null ? '' : String(cost),
  };
}

export default function PurchaseInbound() {
  const perm = usePermission('inventory');
  const canWrite = perm === 'rw';
  const { message } = AntdApp.useApp();

  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [remark, setRemark] = useState('');
  const [drafts, setDrafts] = useState<DraftLine[]>([emptyDraft()]);
  const [quickCreateKw, setQuickCreateKw] = useState<string | null>(null);
  const [quickCreateKey, setQuickCreateKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [list, setList] = useState<PurchaseInbound[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    listEnabledWarehouses()
      .then((ws) => {
        setWarehouses(ws);
        const main = ws.find((w) => w.isMain) ?? ws[0];
        if (main) setWarehouseId(main.id);
      })
      .catch(() => setWarehouses([]));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPurchaseInbounds({ keyword: keyword || undefined, page, pageSize });
      setList(res.list ?? []);
      setTotal(res.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const applySkuToRow = useCallback((key: string, sku: SkuSearchRow, unit: SkuOptionUnit, price: SelectedPrice | null) => {
    setDrafts((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...fillFromSku(sku, unit, price) } : r));
      const last = next[next.length - 1];
      if (last?.specId) next.push(emptyDraft());
      return next;
    });
  }, []);

  const handleDraftCommit = useCallback(
    (rowIndex: number, columnKey: string, value: unknown) => {
      setDrafts((prev) => {
        const row = prev[rowIndex];
        if (!row) return prev;
        if (columnKey === 'productRef' && value && typeof value === 'object' && 'sku' in (value as object)) {
          const { sku, unit, selectedPrice } = value as {
            sku: SkuSearchRow;
            unit: SkuOptionUnit;
            selectedPrice: SelectedPrice | null;
          };
          const patched = { ...row, ...fillFromSku(sku, unit, selectedPrice) };
          const next = prev.map((r, i) => (i === rowIndex ? patched : r));
          if (rowIndex === next.length - 1) next.push(emptyDraft());
          return next;
        }
        const next = [...prev];
        next[rowIndex] = { ...row, [columnKey]: value == null ? '' : String(value) };
        return next;
      });
    },
    [],
  );

  const handleConfirm = async () => {
    if (!canWrite) return;
    if (!supplierId) {
      message.warning('请选择供应商');
      return;
    }
    if (!warehouseId) {
      message.warning('请选择入库仓库');
      return;
    }
    const lines = drafts.filter((r) => r.specId && r.brandId && r.unitId);
    if (!lines.length) {
      message.warning('请先选品，再确认入库');
      return;
    }
    for (const l of lines) {
      const qty = Number(l.qty);
      const cost = Number(l.unitCost);
      if (!isFinite(qty) || qty <= 0) {
        message.warning(`「${l.productRef}」数量必须大于 0`);
        return;
      }
      if (!isFinite(cost) || cost < 0) {
        message.warning(`「${l.productRef}」进价不能为负`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await confirmPurchaseInbound({
        supplierId,
        warehouseId,
        remark: remark.trim() || undefined,
        lines: lines.map((l) => ({
          specId: l.specId,
          brandId: l.brandId,
          unitId: l.unitId,
          qty: Number(l.qty),
          unitCost: Number(l.unitCost),
          productName: l.productName,
          specModel: l.specModel,
          brandName: l.brandName,
          categoryName: l.categoryName,
          unitName: l.unitName,
        })),
      });
      message.success('采购入库已落账（库存 + 应付 + 冲欠库）');
      setDrafts([emptyDraft()]);
      setRemark('');
      void fetchList();
    } catch (e) {
      message.error((e as { message?: string })?.message || '入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  const draftColumns: UnifiedTableColumn<DraftLine>[] = useMemo(
    () => [
      {
        key: 'productRef',
        title: '产品',
        dataIndex: 'productRef',
        minWidth: COL_WIDTHS.NAME_QUOTE,
        wrap: true,
        align: 'left',
        renderMode: 'picker',
        pickerTrigger: 'dropdown',
        isStandardValue: (_v, record) => !!record.specId,
        isDisabled: () => !canWrite,
        render: (value: string) => (
          <span style={{ color: value ? 'var(--text-default)' : 'var(--text-tertiary)' }}>{value || '选品入库'}</span>
        ),
        renderEditor: (value, record, _ri, anchor, onCommit, onCancel, isOpen) => (
          <ProductPicker
            open={isOpen}
            anchorRef={anchor}
            initialKeyword={typeof value === 'string' ? value : record.productRef}
            onClose={onCancel}
            onSelect={(sku, unit, selectedPrice) => onCommit({ sku, unit, selectedPrice })}
            isStaff
            dropdownMode
            hideHostInput
            onDraftCommit={(kw) => onCommit(kw)}
            onQuickCreate={(kw) => {
              setQuickCreateKey(record.key);
              setQuickCreateKw(kw);
            }}
          />
        ),
      },
      {
        key: 'unitName',
        title: '单位',
        dataIndex: 'unitName',
        minWidth: COL_WIDTHS.TAG_M,
        align: 'center',
        renderMode: 'static',
        render: (val: string) => <span style={{ color: 'var(--text-secondary)' }}>{val || '—'}</span>,
      },
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'number',
        placeholder: '0',
        isDisabled: () => !canWrite,
      },
      {
        key: 'unitCost',
        title: '进价',
        dataIndex: 'unitCost',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'number',
        placeholder: '0.00',
        isDisabled: () => !canWrite,
      },
    ],
    [canWrite],
  );

  const histColumns: UnifiedTableColumn<PurchaseInbound>[] = useMemo(
    () => [
      {
        key: 'purchaseNo',
        title: '入库单号',
        dataIndex: 'purchaseNo',
        minWidth: COL_WIDTHS.NAME_S,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-default)' }}>{val}</span>
        ),
      },
      {
        key: 'supplierName',
        title: '供应商',
        dataIndex: 'supplierName',
        minWidth: COL_WIDTHS.NAME_S,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => <span>{val || '—'}</span>,
      },
      {
        key: 'warehouseName',
        title: '仓库',
        dataIndex: 'warehouseName',
        minWidth: COL_WIDTHS.TAG_L,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => <span>{val || '—'}</span>,
      },
      {
        key: 'totalQty',
        title: '数量',
        dataIndex: 'totalQty',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
        ),
      },
      {
        key: 'totalAmount',
        title: '金额',
        dataIndex: 'totalAmount',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>¥{Number(val).toFixed(2)}</span>
        ),
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: COL_WIDTHS.TAG_M,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => <DsTag color={val === 'done' ? 'success' : 'default'}>{val === 'done' ? '已入库' : val}</DsTag>,
      },
      {
        key: 'confirmedAt',
        title: '确认时间',
        dataIndex: 'confirmedAt',
        minWidth: COL_WIDTHS.DATETIME,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val ? new Date(val).toLocaleString('zh-CN') : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '单',
        statusHint: '确认即落账：加库存、记应付、自动冲欠库。不绑客户订单。',
        actions: canWrite ? (
          <DsButton variant="primary" size="sm" icon={<PlusOutlined />} onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? '入库中…' : '确认入库'}
          </DsButton>
        ) : null,
      }}
      bizStrip={{
        left: (
          <>
            <div style={{ width: 220 }}>
              <SupplierPicker
                value={supplierId || null}
                displayName={supplierName || null}
                onChange={(s) => {
                  setSupplierId(s?.id ?? '');
                  setSupplierName(s?.name ?? '');
                }}
                placeholder="供应商（名称/电话）"
              />
            </div>
            <DsSelect
              size="sm"
              value={warehouseId || undefined}
              onChange={(v: string | undefined) => setWarehouseId(v ?? '')}
              options={warehouses.map((w) => ({
                label: w.isMain ? `${w.name}（主仓）` : w.name,
                value: w.id,
              }))}
              style={{ width: 150 }}
              placeholder="入库仓库"
            />
            <DsInput
              size="sm"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="备注（选填）"
              style={{ width: 180, background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
            <DsInput
              size="sm"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="检索历史单号/供应商"
              style={{ width: 180, background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
          </>
        ),
      }}
    >
      {canWrite && (
        <UnifiedTable<DraftLine>
          rowKey="key"
          columns={draftColumns}
          rows={drafts}
          selectable={false}
          pagination={false}
          emptyText="点格选品"
          onCellCommit={handleDraftCommit}
        />
      )}
      <UnifiedTable<PurchaseInbound>
        rowKey="id"
        columns={histColumns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无采购入库单"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 单`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
      <QuickCreateConfirmDialog
        open={quickCreateKw != null}
        initialProductName={quickCreateKw ?? ''}
        onClose={() => {
          setQuickCreateKw(null);
          setQuickCreateKey(null);
        }}
        onSaved={(result) => {
          const { sku, unit } = buildQuickCreateSelection(result);
          if (quickCreateKey) applySkuToRow(quickCreateKey, sku, unit, null);
        }}
      />
    </ViewFrame>
  );
}
