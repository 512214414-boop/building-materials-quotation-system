// PricePicker — 价格字段无约束原则下的「+ 新建补全价格」入口
//
// 设计目标：
//   - 单据明细行单价字段保持 number 模式直接输入体验（不强制写回档案）
//   - 当档案售价为空（brandId + unitId 已确定但 sale_price 表无记录）时，
//     输入框旁显示「+」按钮，点击后弹 Modal 选择价格类型 → 写入 sale_price 档案
//   - 用户决定是否写入档案，便于后续复用
//
// 交互流程：
//   1. 输入框直接输入数字 → 失焦/Enter → onCommit(value)，不写档案
//   2. 档案为空时输入框旁显示「+」按钮
//   3. 点击「+」→ 弹 Modal 选价格类型（默认选中第一个） → 确认 → createSalePrice → 刷新档案列表
//   4. 档案已有记录时不显示「+」按钮（避免重复建档）
//   5. Escape → onCancel（回滚）

import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntdApp, Modal, Spin } from 'antd';
import {
  createSalePrice,
  listPriceTypes,
  listSalePrices,
  type PriceTypeView,
  type SalePriceView,
} from '../services/api/baseDataApi.js';
import DsSelect from './DsSelect.js';
import { overlayModalContainer } from '../utils/canvasStage.js';

export interface PricePickerProps {
  /** 当前数字字符串 */
  value: string;
  /** v14.0：SKU 规格×品牌关联ID（必传，用于定位档案） */
  specBrandId: string | null;
  /** SKU 单位ID（必传，用于定位档案） */
  unitId: string | null;
  /** 浮动锚点（由 UnifiedTable picker 模式注入） */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** 提交数字（失焦/Enter 触发，不写档案） */
  onCommit: (val: string) => void;
  /** 取消编辑（Escape 触发，回滚） */
  onCancel: () => void;
  /** 占位符 */
  placeholder?: string;
  /** v2.0 焦点总线契约：open 由 UnifiedTable activeCell 注入，默认 true
   *  PricePicker 无 FloatPanel，open 仅作契约一致性（UnifiedTable 已通过条件渲染控制激活态） */
  open?: boolean;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default function PricePicker({
  value,
  specBrandId,
  unitId,
  onCommit,
  onCancel,
  placeholder = '待报价',
  open = true,
}: PricePickerProps) {
  // v3 F3-3 修复：open 真实响应（替代原 _open 仅契约一致性）
  //   - open=true（激活态）：聚焦 input + 加载档案
  //   - open=false（失活态）：PricePicker 由 UnifiedTable 卸载，无需处理
  //   - 当前 UnifiedTable 通过条件渲染控制挂载，open 挂载时必为 true，
  //     但保留 open 驱动副作用，确保未来架构变更（如常驻渲染）时仍正确
  const { message } = AntdApp.useApp();
  const [inputValue, setInputValue] = useState(value);
  const [archivePrices, setArchivePrices] = useState<SalePriceView[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [priceTypes, setPriceTypes] = useState<PriceTypeView[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPriceTypeId, setSelectedPriceTypeId] = useState<string>('');
  const [archiving, setArchiving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载档案售价（specBrandId + unitId 已确定时）
  const loadArchive = useCallback(async () => {
    if (!specBrandId || !unitId) {
      setArchivePrices([]);
      return;
    }
    setLoadingArchive(true);
    try {
      const res = await listSalePrices({ specBrandId, unitId, page: 1, pageSize: 50 });
      setArchivePrices(res.list ?? []);
    } catch {
      setArchivePrices([]);
    } finally {
      setLoadingArchive(false);
    }
  }, [specBrandId, unitId]);

  // v3 F3-3: open 真实响应，open=true 时加载档案
  useEffect(() => {
    if (open) void loadArchive();
  }, [open, loadArchive]);

  // 加载价格类型字典（懒加载，仅首次打开 Modal 时）
  const loadPriceTypes = useCallback(async () => {
    if (priceTypes.length > 0) return;
    try {
      const list = await listPriceTypes();
      setPriceTypes(list);
      if (list.length > 0 && !selectedPriceTypeId) {
        // v1.5.6.2：价格类型字典本身无默认概念（isDefault 挂在 sale_price 行上），
        //   原 `p.isDefault` 读取不存在的字段（TS 类型错误 + 恒 undefined），移除死逻辑
        setSelectedPriceTypeId(list[0].id);
      }
    } catch {
      // silent
    }
  }, [priceTypes, selectedPriceTypeId]);

  // v3 F3-3: 自动聚焦依赖 open，open=true 时聚焦+全选
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  const handleBlur = () => {
    // 问题域 4 修复：空值关闭不提交，有值且变化才提交
    const trimmed = String(inputValue ?? '').trim();
    if (trimmed === '' || trimmed === String(value ?? '')) {
      onCancel();
      return;
    }
    onCommit(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(inputValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // 点击「+」打开 Modal
  const handleOpenModal = async () => {
    if (!specBrandId || !unitId) {
      message.warning('请先选择产品与单位');
      return;
    }
    const numVal = toNum(inputValue);
    if (numVal <= 0) {
      message.warning('请先输入有效价格');
      return;
    }
    await loadPriceTypes();
    if (priceTypes.length === 0) {
      message.warning('暂无价格类型，请先在档案中创建');
      return;
    }
    setModalOpen(true);
  };

  // 确认写入档案
  const handleArchiveConfirm = async () => {
    if (!specBrandId || !unitId) return;
    if (!selectedPriceTypeId) {
      message.warning('请选择价格类型');
      return;
    }
    setArchiving(true);
    try {
      await createSalePrice({
        specBrandId,
        unitId,
        priceTypeId: selectedPriceTypeId,
        price: toNum(inputValue),
      });
      message.success('已写入档案售价');
      setModalOpen(false);
      await loadArchive();
    } catch (e) {
      message.error((e as Error).message || '写入档案失败');
    } finally {
      setArchiving(false);
    }
  };

  // 档案为空 + specBrandId/unitId 已确定 → 显示「+」按钮
  const showArchiveBtn =
    !!specBrandId && !!unitId && !loadingArchive && archivePrices.length === 0;

  return (
    <>
      <div
        data-shared-badge="C21"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          defaultValue={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            textAlign: 'right',
            fontFamily: 'var(--font-family-mono)',
            fontVariantNumeric: 'tabular-nums',
            border: 'none',
            outline: 'none',
            padding: '0 4px',
            background: 'transparent',
            color: 'var(--text-default)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        />
        {showArchiveBtn && (
          <button
            type="button"
            // 阻止 mousedown 默认行为，避免点击「+」时输入框失焦触发 onCommit 导致 PricePicker 卸载
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleOpenModal}
            title="档案售价为空，点击将当前价格写入档案"
            style={{
              flexShrink: 0,
              marginLeft: 2,
              padding: '0 6px',
              height: '100%',
              border: '1px solid var(--border-brand-default)',
              borderRadius: 3,
              background: 'var(--bg-brand-popup)',
              color: 'var(--text-brand)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-brand-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-brand-popup)')}
          >
            +
          </button>
        )}
      </div>

      {/* 补全档案价格 Modal */}
      <Modal
        open={modalOpen}
        title="补全档案售价"
        okText="写入档案"
        cancelText="取消"
        confirmLoading={archiving}
        onOk={handleArchiveConfirm}
        onCancel={() => setModalOpen(false)}
        width={380}
        getContainer={overlayModalContainer}
        centered
      >
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              当前价格
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--text-default)',
                fontFamily: 'var(--font-family-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ¥{toNum(inputValue).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              价格类型
            </div>
            {priceTypes.length === 0 ? (
              <Spin size="small" />
            ) : (
              <DsSelect
                value={selectedPriceTypeId}
                onChange={(v) => setSelectedPriceTypeId(v as string)}
                options={priceTypes.map((p) => ({ label: p.name, value: p.id }))}
                style={{ width: '100%' }}
              />
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
            写入档案后，该价格将在后续选择此 SKU 时自动复用。
          </p>
        </div>
      </Modal>
    </>
  );
}
