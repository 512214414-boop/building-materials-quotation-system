// 客户端产品详情抽屉（v9.0 适配 SPU 合并 + 品牌单字段 + 单位挂 SPU + SKU 检索宽表）
//
// v9.0 适配：
//   1. 接收 SkuSearchRow（来自 ProductBrowser 选品）替代 VariantSearchRow
//   2. 单位+价格通过 getSkuOptionsPublic(brandId) 懒加载（SkuOptionUnit[]）
//   3. 商品全名 = productName + brandName + specModel（buildFullName 三参版本）
//   4. 客户端不展示价格（公开端 getSkuOptionsPublic 已剥离 purchasePrices）
//   5. 加入清单时传 v9.0 字段（brandId/productId/unitId）

import { useEffect, useMemo, useState } from 'react';
import { Spin, App as AntdApp } from 'antd';
import { PictureOutlined, CheckCircleOutlined } from '@ant-design/icons';
import DsButton from '../../../shared/components/DsButton.js';
import DsNumberInput from '../../../shared/components/DsNumberInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsDrawer from '../../../shared/components/DsDrawer.js';
import {
  getSkuOptionsPublic,
  type SkuSearchRow,
  type SkuOptionUnit,
} from '../../../shared/services/api/baseDataApi.js';
import {
  createMyDocument,
  listMyDocuments,
  type CustomerDocumentSummary,
  type CustomerLineInput,
} from '../../../shared/services/api/customerApi.js';
import { usePurchaseListStore } from '../../../shared/stores/purchase-list.js';
import { pickGalleryFromView, buildFullName } from './productUtils.js';

export interface ProductDetailDrawerProps {
  /** v8.0 改为直接传入 SkuSearchRow（替代 VariantSearchRow） */
  sku: SkuSearchRow | null;
  open: boolean;
  onClose: () => void;
  /** 是否允许加入清单（通常希望待确认时可加） */
  canAddToList?: boolean;
  onAdded?: () => void;
}

export default function ProductDetailDrawer({
  sku,
  open,
  onClose,
  canAddToList = false,
  onAdded,
}: ProductDetailDrawerProps) {
  const { message } = AntdApp.useApp();
  const { documentId, loadById, addLine, purchaseQuoteStatus } = usePurchaseListStore();
  const [imgIdx, setImgIdx] = useState(0);
  const [unitIndex, setUnitIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  // v3.0 业务链条补全：目标清单选择 + 连续加入
  const [docList, setDocList] = useState<CustomerDocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [lastAddedHint, setLastAddedHint] = useState<string>('');
  // v8.0 SKU 选项懒加载（单位 + 价格列表）
  const [units, setUnits] = useState<SkuOptionUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const allowAdd = canAddToList && purchaseQuoteStatus === 'pending';

  // v8.0 商品全名 = productName + brandName + specModel
  const fullName = useMemo(
    () => (sku ? buildFullName(sku.productName, sku.brandName, sku.specModel) : ''),
    [sku],
  );

  // v3.0 加载客户清单列表（用于"加入哪个清单"选择）
  useEffect(() => {
    if (!open || !allowAdd) return;
    setLoadingDocs(true);
    void listMyDocuments()
      .then((list) => {
        setDocList(list);
        // 默认选中当前活动清单；无活动清单则选第一个；都没有则选"新建"
        const defaultId = documentId ?? list[0]?.id ?? '__new__';
        setSelectedDocId(defaultId);
      })
      .catch(() => setDocList([]))
      .finally(() => setLoadingDocs(false));
  }, [open, allowAdd, documentId]);

  // v3.0 清单选项：已有清单 + 新建清单
  const docOptions = useMemo(() => {
    const items = docList.map((d) => {
      const lineCount = d.count?.documentLines ?? d._count?.documentLines ?? 0;
      const label = `${d.title ?? d.documentNo}${lineCount > 0 ? `（${lineCount}项）` : ''}`;
      return { label, value: d.id };
    });
    return [...items, { label: '➕ 新建清单', value: '__new__' }];
  }, [docList]);

  // v3.0 选中清单的显示名（用于成功提示）
  const selectedDocLabel = useMemo(() => {
    if (selectedDocId === '__new__') return '新建清单';
    const found = docList.find((d) => d.id === selectedDocId);
    return found?.title ?? found?.documentNo ?? '清单';
  }, [selectedDocId, docList]);

  // v8.0 sku 变化时：重置状态 + 懒加载 SKU 选项（单位+价格）
  useEffect(() => {
    if (!open || !sku) {
      return;
    }
    setImgIdx(0);
    setLastAddedHint('');
    setQty(1);
    setUnits([]);
    setUnitIndex(-1);
    // 懒加载该 SKU 的单位列表（公开端剥离进价）；v14.0：按 specBrandId（规格×品牌关联）
    if (sku.specBrandId) {
      setUnitsLoading(true);
      void getSkuOptionsPublic(sku.specBrandId)
        .then((result) => {
          const unitList = result.units ?? [];
          setUnits(unitList);
          // 初始化单位索引：优先基础单位，否则第一个
          const baseIdx = unitList.findIndex((u) => u.isBase);
          setUnitIndex(unitList.length ? (baseIdx >= 0 ? baseIdx : 0) : -1);
        })
        .catch(() => {
          setUnits([]);
          setUnitIndex(-1);
        })
        .finally(() => setUnitsLoading(false));
    }
  }, [open, sku]);

  const gallery = useMemo(() => (sku ? pickGalleryFromView(sku) : []), [sku]);

  const handleAdd = async () => {
    if (!sku || !allowAdd) return;
    if (qty <= 0) {
      message.warning('请输入有效数量');
      return;
    }
    setSubmitting(true);
    try {
      let targetDocId = selectedDocId;
      let targetDocLabel = selectedDocLabel;
      // v3.0 新建清单场景
      if (!targetDocId || targetDocId === '__new__') {
        const created = await createMyDocument();
        targetDocId = created.id;
        targetDocLabel = created.title ?? created.documentNo;
        // 刷新清单列表
        const freshList = await listMyDocuments();
        setDocList(freshList);
        setSelectedDocId(created.id);
      }
      // v3.0 切换到目标清单（如与当前活动清单不同）
      if (targetDocId !== documentId) {
        await loadById(targetDocId);
      }
      const selectedUnit = unitIndex >= 0 ? units[unitIndex] : null;
      // v14.0：传 specId/brandId/productId/unitId（SKU = 规格×品牌×单位，后端识别字段）
      const lineInput: CustomerLineInput = {
        productRef: fullName,
        spec: sku.specModel ?? undefined,
        unit: selectedUnit?.unitName ?? sku.defaultUnitName ?? '件',
        qty,
        isStandardized: true,
        specId: sku.specId,
        brandId: sku.brandId,
        productId: sku.productId,
        // v9.0 单位 ID（如有）
        unitId: selectedUnit?.unitId ?? sku.defaultUnitId ?? undefined,
      };
      await addLine(lineInput);
      // v3.0 连续加入：不关闭抽屉，显示成功提示，重置数量，刷新清单项数
      const freshList = await listMyDocuments();
      setDocList(freshList);
      setLastAddedHint(`✓ 已加入「${targetDocLabel}」，可继续选其他规格/产品`);
      message.success(`已加入「${targetDocLabel}」`);
      setQty(1);
      onAdded?.();
    } catch (e) {
      message.error((e as Error).message || '加入清单失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 默认单位名（用于详情展示）：优先选中单位，否则 defaultUnitName
  const defaultUnitName = useMemo(() => {
    if (unitIndex >= 0 && units[unitIndex]) {
      return units[unitIndex].unitName;
    }
    return sku?.defaultUnitName ?? null;
  }, [unitIndex, units, sku]);

  return (
    <DsDrawer
      breadcrumb={[fullName || '产品详情']}
      open={open}
      onClose={onClose}
      width={420}
    >
      {!sku ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 'var(--radius-8)',
              background: gallery[imgIdx]
                ? `url("${gallery[imgIdx]}") center/cover, var(--bg-base-tertiary)`
                : 'var(--bg-base-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-quaternary)',
              border: '1px solid var(--border-neutral-l1)',
            }}
          >
            {!gallery[imgIdx] && <PictureOutlined style={{ fontSize: 48 }} />}
          </div>
          {gallery.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {gallery.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setImgIdx(i)}
                  style={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: 4,
                    border: `2px solid ${i === imgIdx ? 'var(--border-brand)' : 'var(--border-neutral-l2)'}`,
                    background: `url("${url}") center/cover`,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-default)' }}>{fullName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
              品牌：{sku.brandName || '—'} · 规格：{sku.specModel || '—'} · 默认单位：{defaultUnitName ?? '—'}
            </div>
          </div>

          {unitsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              <Spin size="small" />
            </div>
          ) : units.length > 1 ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>单位（共 {units.length} 种）</span>
              <DsSelect
                value={String(unitIndex)}
                onChange={(v) => setUnitIndex(Number(v))}
                options={units.map((u, idx) => ({
                  label: u.isBase ? `${u.unitName}（基准）` : u.unitName,
                  value: String(idx),
                }))}
                style={{ width: '100%' }}
              />
            </label>
          ) : null}

          {allowAdd ? (
            <>
              {/* v3.0 业务链条补全：目标清单选择器 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>加入清单</span>
                <DsSelect
                  value={selectedDocId || undefined}
                  onChange={(v) => setSelectedDocId(v)}
                  options={docOptions}
                  loading={loadingDocs}
                  placeholder="选择目标清单"
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>数量</span>
                <DsNumberInput
                  value={String(qty)}
                  onChange={(e) => setQty(Number(e.target.value) || 0)}
                />
              </label>
              {/* v3.0 连续加入成功提示 */}
              {lastAddedHint && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-6)',
                    background: 'var(--status-success-surface-l1)',
                    border: '1px solid var(--status-success-default)',
                    fontSize: 12,
                    color: 'var(--status-success-default)',
                  }}
                >
                  <CheckCircleOutlined style={{ fontSize: 14 }} />
                  <span>{lastAddedHint}</span>
                </div>
              )}
              <DsButton
                variant="primary"
                loading={submitting}
                onClick={() => void handleAdd()}
                style={{ width: '100%' }}
              >
                {lastAddedHint ? '继续加入' : '加入采购清单'}
              </DsButton>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {purchaseQuoteStatus !== 'pending'
                ? '订单已确认，仅可浏览产品，不能再加入清单'
                : '当前不可加入清单'}
            </div>
          )}
        </div>
      )}
    </DsDrawer>
  );
}
