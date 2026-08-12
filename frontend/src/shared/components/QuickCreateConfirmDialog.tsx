// QuickCreateConfirmDialog — 快速建档二次确认弹窗（v11.5）+ 相似档案候选决策（v11.7）
//
// 背景（用户反馈）：
//   采购报价手输文字 → 点「新建」直接 quickCreateProduct，把「完整 productRef 字符串」
//   （如「XXX 普通品牌 通用」）整体当产品名 → 再次新建时又叠一层品牌/规格（重复建档）。
//   且底层要求「分开存储」：产品名/品牌/规格/单位是独立字段，不能把拼接串当产品名。
//
// 设计（所有新建档案入口统一走本弹窗）：
//   1. 字段分开编辑：产品名称（必填）/ 品牌 / 规格型号 / 单位 各归各
//   2. 保存时缺省值二次确认（对齐 ProductEditDialog v13.1 缺省值注册表范式）：
//       规格空 → 系统补「通用」；单位空 → 补「件」；品牌空 → 补「普通品牌」
//       用户确认 → 保存（系统兜底）；用户取消 → 返回继续编辑
//   3. 保存走 quickCreateProduct（后端 v11.6 宽表组合去重幂等：在 SKU 宽表
//      product_sku_search 上按「无空格产品名+无空格规格」组合完整值精确比对，
//      命中即复用已有档案——规格值录进产品名等字段错位也能命中，不重复建档）
//   4. v11.7 相似档案候选（匹配度）：
//       精确命中（100%）→ 静默复用；匹配度 ≥ 60% → 弹窗内展示候选列表，用户决策
//       「复用该档案」或「仍要新建」（forceNew）；匹配度 < 60% → 视为新品直接新建。
//       产品名长、输入与档案近似时，系统不替用户臆断「同一条还是不同产品」，交用户拍板。
//   5. 有时间 → 完整录入所有信息；没时间 → 直接确认保存，由系统兜底，最灵活
//
// 交互：弹窗右上角「保存」→ 校验 + 缺省提示 → 建档；候选出现时 → 复用 or 仍要新建

import { useState } from 'react';
import { App as AntdApp } from 'antd';
import DsDialog from './DsDialog.js';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import { confirmFillsBeforeSave } from './DefaultFillsPreview.js';
import { QUICK_CREATE_LAYERS, resolveFieldValue } from '../config/quickCreateConfig.js';
import {
  quickCreateProduct,
  type QuickCreateProductResult,
  type QuickCreateProductResponse,
} from '../services/api/baseDataApi.js';

// v15.3 配置驱动：产品信息层字段（label/必填/兜底值/去重语义）统一定义在
//   shared/config/quickCreateConfig.ts（SSOT），本弹窗只声明「层 + 实际值」，
//   调整兜底值（普通品牌/通用/件）只改配置一处，全局生效
const productLayer = QUICK_CREATE_LAYERS.product;
/** 按字段 key 取配置（调用方声明层内的字段） */
const fieldConfig = (key: string) => productLayer.fields.find((f) => f.key === key)!;

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--body-xs-font-size)',
  color: 'var(--text-tertiary)',
  marginBottom: 2,
};

export interface QuickCreateConfirmDialogProps {
  open: boolean;
  /** 待建档关键词（产品名称预填，用户在弹窗内可修改/补全） */
  initialProductName: string;
  /** 是否员工端（默认 true；false 时建档接口不可用，通常员工端才触发） */
  isStaff?: boolean;
  onClose: () => void;
  /** 建档成功回调（返回完整 SKU 三级结构：product/spec/specBrand/brand/unit） */
  onSaved: (result: QuickCreateProductResult) => void;
}

export default function QuickCreateConfirmDialog({
  open,
  initialProductName,
  onClose,
  onSaved,
}: QuickCreateConfirmDialogProps) {
  const { message, modal } = AntdApp.useApp();
  const [productName, setProductName] = useState(initialProductName);
  // v15.3：品牌不预填（输入框留空，用户直接输入；留空保存时按值去重写入「普通品牌」，
  //   全局档案已存在则复用、不存在才新建——普通品牌不是种子数据，是保存时的兜底值）
  const [brandName, setBrandName] = useState('');
  const [specModel, setSpecModel] = useState('');
  const [unitName, setUnitName] = useState('');
  const [saving, setSaving] = useState(false);
  /** v11.7：相似档案候选（匹配度 ≥ 60%），出现时由用户决策复用 or 仍要新建 */
  const [candidates, setCandidates] = useState<
    Array<QuickCreateProductResult & { matchScore: number }> | null
  >(null);

  // 打开时重置为初始值（预填关键词；品牌/规格/单位留空，保存时才兜底缺省值）
  const handleOpenReset = () => {
    setProductName(initialProductName);
    setBrandName('');
    setSpecModel('');
    setUnitName('');
    setSaving(false);
    setCandidates(null);
  };

  const doCreate = async (forceNew: boolean) => {
    setSaving(true);
    try {
      const resp: QuickCreateProductResponse = await quickCreateProduct({
        productName: productName.trim(),
        // 前端只传用户显式填写的值；空值由后端按缺省值注册表兜底（规格→通用、单位→件、品牌→普通品牌）
        specModel: specModel.trim() || undefined,
        unitName: unitName.trim() || undefined,
        brandName: brandName.trim() || undefined,
        ...(forceNew ? { forceNew: true } : {}),
      });
      if (resp.status === 'suggestion') {
        // v11.7：相似档案候选 → 展示给用户决策（复用 or 仍要新建），不直接建档
        setCandidates(resp.candidates);
        return;
      }
      // v11.8 用户感知：精确命中已有档案 → 明确告知「已使用现有档案」，不静默复用
      if (resp.result.reused) {
        message.success('已匹配到现有档案，直接使用（未新建）');
      } else {
        message.success('新建档案成功');
      }
      onSaved(resp.result);
      onClose();
    } catch (e) {
      // v11.3：后端唯一约束冲突给出友好提示（同名同规格已存在 → 建议从列表选择）
      const err = e as { message?: string };
      if (/unique|duplicate|重复|already exists/i.test(err?.message ?? '')) {
        message.warning('该产品/规格已存在，请关闭弹窗后从列表中选择');
      } else {
        message.error(err?.message || '快速新建失败，请重试');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = productName.trim();
    if (!trimmedName) {
      message.warning('请输入产品名称');
      return;
    }

    // 缺省值二次确认（v15.3 配置驱动分层字段清单式）：声明「产品信息层 + 用户实际填的值」，
    //   字段 label/兜底值由 quickCreateConfig 统一驱动；空输入保存时按值去重写入兜底值
    //   （普通品牌/未分类不是种子数据——输入框留空，全局档案已存在则复用关联、不存在才新建）
    const rawValues: Record<string, string> = {
      productName,
      category: '',
      brand: brandName,
      specModel,
      unitName,
    };
    const previewFields = productLayer.fields.map((f) => {
      const resolved = resolveFieldValue(f, rawValues[f.key] ?? '');
      return { label: f.label, value: resolved.value, auto: resolved.auto, required: f.required };
    });

    if (previewFields.some((f) => f.auto)) {
      // v15.4 统一自动补充确认（单一入口）：有自动补充项才弹确认，确认 → 建档；取消 → 返回继续编辑
      const confirmed = await confirmFillsBeforeSave(modal, {
        groups: [{ title: productLayer.title, fields: previewFields }],
      });
      if (!confirmed) return; // 取消 → 返回继续编辑
    }
    void doCreate(false);
  };

  /** v11.7 用户选中候选档案 → 直接复用（不新建）；v11.8 复用后明确告知用户 */
  const handleReuse = (candidate: QuickCreateProductResult & { matchScore: number }) => {
    message.success(`已使用现有档案「${archiveFullName(candidate)}」`);
    onSaved(candidate);
    onClose();
  };

  /** 匹配度 → 颜色（高→绿，中→橙，低→黄） */
  const scoreColor = (score: number) => {
    if (score >= 0.85) return 'var(--status-success-default)';
    if (score >= 0.7) return 'var(--text-warning)';
    return 'var(--text-tertiary)';
  };

  /** 档案完整组合（产品名 + 品牌 + 规格，用于候选展示） */
  const archiveFullName = (c: QuickCreateProductResult) =>
    `${c.product.name} ${c.brand.name} ${c.spec.specModel}`.trim();

  const hasCandidates = !!candidates && candidates.length > 0;

  return (
    <DsDialog
      open={open}
      data-shared-badge="C30"
      title="快速新增产品"
      width={560}
      onCancel={onClose}
      afterOpenChange={(opened) => {
        if (opened) handleOpenReset();
      }}
      footer={
        hasCandidates
          ? [
              <DsButton key="cancel" variant="ghost" onClick={onClose} disabled={saving}>
                取消
              </DsButton>,
              <DsButton
                key="forceNew"
                variant="primary"
                loading={saving}
                onClick={() => void doCreate(true)}
              >
                仍要新建
              </DsButton>,
            ]
          : [
              <DsButton key="cancel" variant="ghost" onClick={onClose} disabled={saving}>
                取消
              </DsButton>,
              <DsButton
                key="save"
                variant="primary"
                loading={saving}
                onClick={() => void handleSave()}
              >
                保存
              </DsButton>,
            ]
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          paddingTop: 2,
        }}
      >
        {/* 产品名称（必填） */}
        <div style={{ minWidth: 0 }}>
          <label style={FIELD_LABEL_STYLE}>
            产品名称 <span style={{ color: 'var(--status-error-default)' }}>*</span>
          </label>
          <DsInput
            size="sm"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="如 PPR热水管"
            disabled={saving}
            style={{ width: '100%' }}
          />
        </div>
        {/* 品牌（留空保存时按值去重写入「普通品牌」） */}
        <div style={{ minWidth: 0 }}>
          <label style={FIELD_LABEL_STYLE}>品牌</label>
          <DsInput
            size="sm"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder={`留空默认${fieldConfig('brand').fallback}`}
            disabled={saving}
            style={{ width: '100%' }}
          />
        </div>
        {/* 规格型号（留空触发缺省提示补「通用」） */}
        <div style={{ minWidth: 0 }}>
          <label style={FIELD_LABEL_STYLE}>规格型号</label>
          <DsInput
            size="sm"
            value={specModel}
            onChange={(e) => setSpecModel(e.target.value)}
            placeholder={`留空默认${fieldConfig('specModel').fallback}`}
            disabled={saving}
            style={{ width: '100%' }}
          />
        </div>
        {/* 单位（留空触发缺省提示补「件」） */}
        <div style={{ minWidth: 0 }}>
          <label style={FIELD_LABEL_STYLE}>单位</label>
          <DsInput
            size="sm"
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            placeholder={`留空默认${fieldConfig('unitName').fallback}`}
            disabled={saving}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* v11.7 相似档案候选区：精确命中时静默复用；近似（≥60%）列候选由用户决策 */}
      {hasCandidates && (
        <div
          style={{
            marginTop: 12,
            borderTop: '1px solid var(--border-neutral-l1)',
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-default)' }}>
            检测到相似档案（匹配度 ≥ 60%），请确认复用还是新建：
          </div>
          {candidates!.map((c) => (
            <div
              key={c.specBrand.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 4,
                background: 'var(--bg-base-tertiary)',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={archiveFullName(c)}
              >
                {archiveFullName(c)}
              </div>
              <span style={{ fontSize: 11, color: scoreColor(c.matchScore), width: 44, textAlign: 'right' }}>
                {Math.round(c.matchScore * 100)}%
              </span>
              <DsButton
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => handleReuse(c)}
              >
                复用
              </DsButton>
            </div>
          ))}
        </div>
      )}
    </DsDialog>
  );
}
