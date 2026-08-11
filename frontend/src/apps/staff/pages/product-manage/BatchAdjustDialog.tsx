// v12.0 批量调整进价对话框（点位模式）
//
// 需求：进价 = 面价 × 点位；点位调整时按「供应商 + 品牌名 + 分类名」圈组批量更新点位
// 设计：
//   - 点位规则挂供应商维度（supplier_point_rule），品牌名/分类名粒度由人控制（系列/管件不同点位 → 名录录细）
//   - 三个条件（供应商/品牌/分类）齐了自动带出该组旧点位
//   - 必须「预览」成功后才能「确认调整」，避免误操作
//   - v12.0 定价语义：面价(price) 是录入值永不重算，只更新点位规则，进价 = 面价 × 新点位 自动派生
import { useEffect, useState } from 'react';
import { App as AntdApp } from 'antd';
import {
  DsButton,
  DsDialog,
  DsNumberInput,
  DsTag,
  SuggestInput,
} from '../../../../shared/components/index.js';
import {
  batchAdjustPreview,
  batchAdjustPurchasePrices,
  getPointRule,
  type BatchAdjustInput,
  type BatchAdjustPreviewResult,
} from '../../../../shared/services/api/baseDataApi.js';

export interface BatchAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  /** 调整成功后刷新列表 */
  onDone?: () => void;
  /** v11.3：从单产品进价明细进入时带入上下文（供应商/品牌/分类已锁定，无需再选） */
  initialContext?: {
    supplierId: string;
    supplierName: string;
    brandName: string;
    categoryName: string;
  };
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 'var(--body-xs-font-size)',
  color: 'var(--text-secondary)',
  marginBottom: 2,
  whiteSpace: 'nowrap',
};

export default function BatchAdjustDialog({
  open,
  onClose,
  onDone,
  initialContext,
}: BatchAdjustDialogProps) {
  const { message } = AntdApp.useApp();

  const [supplierInput, setSupplierInput] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [brandInput, setBrandInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [oldPoint, setOldPoint] = useState('');
  const [newPoint, setNewPoint] = useState('');
  const [preview, setPreview] = useState<BatchAdjustPreviewResult | null>(null);
  const [loadingRule, setLoadingRule] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // v11.3：从单产品进价明细进入 → 自动带入上下文并锁定三个条件
  const contextLocked = Boolean(initialContext);
  useEffect(() => {
    if (!open || !initialContext) return;
    setSupplierId(initialContext.supplierId);
    setSupplierInput(initialContext.supplierName);
    setBrandInput(initialContext.brandName);
    setCategoryInput(initialContext.categoryName);
    setPreview(null);
  }, [open, initialContext]);

  const groupReady = Boolean(supplierId && brandInput.trim() && categoryInput.trim());

  // 三个条件齐了 → 自动读取该组旧点位（规则带出），并清除旧预览
  useEffect(() => {
    if (!open || !groupReady) return;
    let cancelled = false;
    setLoadingRule(true);
    getPointRule({
      supplierId,
      brandName: brandInput.trim(),
      categoryName: categoryInput.trim(),
    })
      .then((rule) => {
        if (cancelled) return;
        setOldPoint(rule ? String(rule.point) : '');
        setPreview(null);
      })
      .catch(() => {
        if (!cancelled) setOldPoint('');
      })
      .finally(() => {
        if (!cancelled) setLoadingRule(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, groupReady, supplierId, brandInput, categoryInput]);

  const invalidatePreview = () => setPreview(null);

  const buildInput = (): BatchAdjustInput | null => {
    const oldP = parseFloat(oldPoint);
    const newP = parseFloat(newPoint);
    if (!(oldP > 0)) {
      message.warning('请填写旧点位');
      return null;
    }
    if (!(newP > 0)) {
      message.warning('请填写新点位');
      return null;
    }
    return {
      supplierId,
      brandName: brandInput.trim(),
      categoryName: categoryInput.trim(),
      oldPoint: oldP,
      newPoint: newP,
    };
  };

  const handlePreview = async () => {
    if (!groupReady) {
      message.warning('请先选择供应商、品牌、分类');
      return;
    }
    const input = buildInput();
    if (!input) return;
    setPreviewing(true);
    try {
      const result = await batchAdjustPreview(input);
      setPreview(result);
      if (result.total === 0) message.info('该组下没有进价记录，无需调整');
    } catch (e) {
      message.error((e as Error).message || '预览失败');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async () => {
    const input = buildInput();
    if (!input) return;
    setSubmitting(true);
    try {
      const result = await batchAdjustPurchasePrices(input);
      message.success(`已调整 ${result.updated} 条进价`);
      onDone?.();
      onClose();
    } catch (e) {
      message.error((e as Error).message || '调整失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DsDialog
      open={open}
      title="批量调整进价"
      width={560}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <DsButton key="cancel" variant="ghost" onClick={onClose} disabled={submitting}>
          取消
        </DsButton>,
        <DsButton
          key="submit"
          variant="primary"
          loading={submitting}
          disabled={!preview || submitting}
          onClick={handleSubmit}
        >
          确认调整
        </DsButton>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 定位同类：供应商 + 品牌名 + 分类名 */}
        <div>
          <div style={FIELD_LABEL}>供应商</div>
          <SuggestInput
            field="supplier"
            value={supplierInput}
            onChange={(val) => {
              setSupplierInput(val);
              invalidatePreview();
            }}
            onSelect={(item) => {
              setSupplierId(item.id ?? '');
              setSupplierInput(item.name);
              invalidatePreview();
            }}
            allowCreate={false}
            placeholder="选择供应商（点位挂供应商维度）"
            size="sm"
            disabled={contextLocked}
          />
        </div>
        <div>
          <div style={FIELD_LABEL}>品牌</div>
          <SuggestInput
            field="brand"
            value={brandInput}
            onChange={(val) => {
              setBrandInput(val);
              invalidatePreview();
            }}
            onSelect={(item) => {
              setBrandInput(item.name);
              invalidatePreview();
            }}
            allowCreate={false}
            placeholder="选择品牌（同品牌不同系列点位不同 → 品牌名录细）"
            size="sm"
            disabled={contextLocked}
          />
        </div>
        <div>
          <div style={FIELD_LABEL}>分类</div>
          <SuggestInput
            field="category"
            value={categoryInput}
            onChange={(val) => {
              setCategoryInput(val);
              invalidatePreview();
            }}
            onSelect={(item) => {
              setCategoryInput(item.name);
              invalidatePreview();
            }}
            allowCreate={false}
            placeholder="选择分类（管材/管件点位不同 → 分类名录细）"
            size="sm"
            disabled={contextLocked}
          />
        </div>

        {/* 点位输入（旧点位自动带出，新点位必填） */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={FIELD_LABEL}>
              旧点位{loadingRule && '（读取中…）'}
            </div>
            <DsNumberInput
              size="sm"
              placeholder="如 0.58"
              value={oldPoint}
              onChange={(e) => {
                setOldPoint(e.target.value);
                invalidatePreview();
              }}
              align="left"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={FIELD_LABEL}>新点位</div>
            <DsNumberInput
              size="sm"
              placeholder="如 0.55"
              value={newPoint}
              onChange={(e) => {
                setNewPoint(e.target.value);
                invalidatePreview();
              }}
              align="left"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* 预览按钮 */}
        <DsButton
          variant="secondary"
          size="sm"
          loading={previewing}
          onClick={handlePreview}
          block
        >
          预览（计算影响范围）
        </DsButton>

        {/* 预览结果 */}
        {preview && (
          <div
            style={{
              border: '1px solid var(--border-neutral-l1)',
              borderRadius: 'var(--radius-6)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
              <DsTag color="brand">共 {preview.total} 条进价</DsTag>
              <DsTag color="danger">点位 {preview.oldPoint ?? 1} → {preview.newPoint}</DsTag>
            </div>
            {preview.examples.length > 0 ? (
              <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-default)' }}>
                {preview.examples.map((r) => (
                  <div key={r.purchasePriceId} style={{ whiteSpace: 'nowrap' }}>
                    · {r.brandName} {r.productName} {r.specModel}（{r.unitName}）：{r.oldPrice.toFixed(2)} →{' '}
                    <span style={{ color: 'var(--status-danger-default)' }}>{r.newPrice.toFixed(2)}</span>
                  </div>
                ))}
                {preview.total > preview.examples.length && (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    … 等共 {preview.total} 条，确认后一次全部调整
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                该组下暂无进价记录
              </div>
            )}
          </div>
        )}
      </div>
    </DsDialog>
  );
}
