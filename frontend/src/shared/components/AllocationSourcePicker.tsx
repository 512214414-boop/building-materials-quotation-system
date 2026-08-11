// AllocationSourcePicker — v1.7.0 配货来源选择器（分组检索 + 共用全局打分 + 快速新建）
//
// 设计依据（《配货与成本核算推演方案.md》1.3 / 6.1 / 6.2 / 6.3）：
//   - 不拆分「内部/外部单选按钮」，单列关键词检索输入框
//   - 检索打分共用全局逻辑（后端 listAllocationSources 服务端打分，
//     scoreNameByWeights 双端 SSOT：完全匹配 ＞ 前缀 ＞ 词组包含 ＞ 零散关键词）
//   - 下拉分组展示：上方「内部仓库列表」、下方「外部供应商列表」
//   - 检索无对应仓库/供应商时，弹窗一键快速新建档案（仓库/供应商二选一），
//     新建完成自动回填选中，全程不切换页面
//
// 数据流：
//   - 数据源：listAllocationSources({ keyword }) 返回 { warehouses, suppliers } 分组结构
//   - 输入关键词 → 防抖 250ms → 服务端打分 → 分组渲染
//   - 选择已有项 → onChange(sourceId, sourceType)
//   - 点击「+ 新建档案」→ Modal 二选一 → quickAddAllocationSource → 回填选中

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Modal, Radio } from 'antd';
import DsSelect from './DsSelect.js';
import { DsInput } from './DsInput.js';
import {
  listAllocationSources,
  quickAddAllocationSource,
  type AllocationSourcesResult,
} from '../services/api/allocationApi.js';

export interface AllocationSourcePickerProps {
  /** 当前选中的 sourceId */
  value?: string;
  /** 选中项变更回调 */
  onChange: (sourceId: string, sourceType: 'warehouse' | 'external') => void;
  /** 失焦回调（用于自动保存） */
  onBlur?: () => void;
  /** 禁用 */
  disabled?: boolean;
  /** 占位符 */
  placeholder?: string;
  /** 尺寸 */
  size?: 'small' | 'middle' | 'large';
  /** 外部传入的分组来源（不传则组件内部加载） */
  sources?: AllocationSourcesResult | null;
  /** sources 变更回调（外部受控模式时使用） */
  onSourcesChange?: (sources: AllocationSourcesResult) => void;
}

/** 新建档案选项的特殊值标识 */
const QUICK_ADD_VALUE = '__quick_add_source__';

/**
 * 命名空间 value：仓库与供应商的数据库 id 可能相同（各自独立自增），
 * 直接用原始 id 做 Select value 会冲突 → 点击「面价渠道」可能误选同 id 的仓库。
 * 统一用前缀区分：仓库 `wh:{id}`、供应商 `sup:{id}`；对外 onChange 仍传原始 id。
 */
const NS_WH = 'wh:';
const NS_SUP = 'sup:';

function nsValue(type: 'warehouse' | 'external', id: string): string {
  return type === 'warehouse' ? `${NS_WH}${id}` : `${NS_SUP}${id}`;
}

/**
 * 从分组数据中按 value 查找来源（支持命名空间值 wh:/sup:，兼容旧纯 id）。
 * 返回的 id 为原始数据库 id。
 */
function findSourceById(
  result: AllocationSourcesResult | null | undefined,
  value: string,
): { id: string; name: string; sourceType: 'warehouse' | 'external' } | null {
  if (!result) return null;
  if (value.startsWith(NS_WH)) {
    const w = result.warehouses.find((x) => x.id === value.slice(NS_WH.length));
    if (w) return { id: w.id, name: w.name, sourceType: 'warehouse' };
  }
  if (value.startsWith(NS_SUP)) {
    const s = result.suppliers.find((x) => x.id === value.slice(NS_SUP.length));
    if (s) return { id: s.id, name: s.name, sourceType: 'external' };
  }
  // 兼容旧格式（无前缀纯 id）：仓库优先，供应商兜底
  const w = result.warehouses.find((x) => x.id === value);
  if (w) return { id: w.id, name: w.name, sourceType: 'warehouse' };
  const s = result.suppliers.find((x) => x.id === value);
  if (s) return { id: s.id, name: s.name, sourceType: 'external' };
  return null;
}

export default function AllocationSourcePicker({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = '选择仓库 / 供应商',
  size = 'small',
  sources: externalSources,
  onSourcesChange,
}: AllocationSourcePickerProps) {
  const { message } = AntdApp.useApp();
  const [internalSources, setInternalSources] = useState<AllocationSourcesResult | null>(null);
  const sources = externalSources ?? internalSources;
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'warehouse' | 'supplier'>('warehouse');
  const [modalName, setModalName] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const keywordRef = useRef('');
  keywordRef.current = keyword;

  const updateSources = useCallback(
    (next: AllocationSourcesResult) => {
      if (externalSources) {
        onSourcesChange?.(next);
      } else {
        setInternalSources(next);
      }
    },
    [externalSources, onSourcesChange],
  );

  // 加载来源（关键词防抖 → 服务端打分）
  const loadSources = useCallback(async () => {
    try {
      const result = await listAllocationSources({ keyword: keywordRef.current.trim() || undefined });
      updateSources(result);
    } catch {
      updateSources({ warehouses: [], suppliers: [] });
    }
  }, [updateSources]);

  useEffect(() => {
    if (externalSources) return;
    const timer = setTimeout(() => void loadSources(), keyword ? 250 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, externalSources]);

  // 首次挂载加载
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (!externalSources) void loadSources();
  }, [externalSources, loadSources]);

  // 分组下拉 options（antd Select 分组：label=组名 + options=组内项）
  const selectOptions = useMemo(() => {
    const groups: Array<{ label: React.ReactNode; options: Array<{ value: string; label: React.ReactNode }> }> = [];
    // 当前选中项不在过滤结果中时，置顶显示（避免 antd 只显示 value）
    const selected = value ? findSourceById(sources, value) : null;
    const groupOptions = (
      items: Array<{ id: string; name: string; isMain?: boolean }>,
      prefix: string,
      type: 'warehouse' | 'external',
    ) =>
      items.map((s) => ({
        value: nsValue(type, s.id),
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--text-default)' }}>{prefix}</span>
            <span style={{ color: 'var(--text-default)' }}>{s.name}</span>
            {s.isMain ? <span style={{ color: 'var(--text-brand)', fontSize: 11 }}>主</span> : null}
          </span>
        ),
      }));

    const warehouses = sources?.warehouses ?? [];
    const suppliers = sources?.suppliers ?? [];
    // 置顶：当前选中但不在过滤结果内
    if (selected) {
      const inList = [...warehouses, ...suppliers].some((x) => x.id === selected.id);
      if (!inList) {
        groups.push({
          label: '当前已选',
          options: [
            {
              value: nsValue(selected.sourceType, selected.id),
              label: `${selected.sourceType === 'warehouse' ? '仓库' : '供应商'} · ${selected.name}`,
            },
          ],
        });
      }
    }
    if (warehouses.length > 0) {
      groups.push({
        label: <span style={{ color: 'var(--text-brand)' }}>内部仓库列表</span>,
        options: groupOptions(warehouses, '仓库 · ', 'warehouse'),
      });
    }
    if (suppliers.length > 0) {
      groups.push({
        label: <span style={{ color: 'var(--text-brand)' }}>外部供应商列表</span>,
        options: groupOptions(suppliers, '供应商 · ', 'external'),
      });
    }
    // 无匹配时追加「快速新建档案」选项（仓库/供应商二选一）
    if (keyword.trim() && warehouses.length === 0 && suppliers.length === 0) {
      groups.push({
        label: <span style={{ color: 'var(--text-brand)' }}>快速新建</span>,
        options: [
          {
            value: QUICK_ADD_VALUE,
            label: <span style={{ color: 'var(--text-brand)' }}>+ 新建仓库/供应商档案「{keyword.trim()}」</span>,
          },
        ],
      });
    }
    return groups;
  }, [sources, keyword, value]);

  const handleChange = (val: string) => {
    if (val === QUICK_ADD_VALUE) {
      setModalName(keyword.trim());
      setModalOpen(true);
      return;
    }
    const source = findSourceById(sources, val);
    if (source) {
      onChange(source.id, source.sourceType);
    }
  };

  const handleModalOk = async () => {
    const name = modalName.trim();
    if (!name) {
      message.warning('请输入档案名称');
      return;
    }
    setModalLoading(true);
    try {
      const created = await quickAddAllocationSource({ kind: modalKind, name });
      // 刷新来源列表
      await loadSources();
      // 选中新建的档案
      if (created.kind === 'warehouse') {
        onChange(created.id, 'warehouse');
      } else {
        onChange(created.id, 'external');
      }
      setModalOpen(false);
      setModalName('');
      setKeyword('');
    } catch (e) {
      message.error((e as Error).message || '新建档案失败');
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setModalName('');
  };

  return (
    <>
      <DsSelect
        size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md'}
        value={value || undefined}
        onChange={handleChange}
        onSearch={setKeyword}
        disabled={disabled}
        placeholder={placeholder}
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        options={selectOptions}
        onBlur={onBlur}
        filterOption={false}
      />

      {/* 快速新建档案对话框（仓库/供应商二选一） */}
      <Modal
        title="快速新建配货来源"
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        confirmLoading={modalLoading}
        okText="新建并选用"
        cancelText="取消"
        width={420}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>档案类型</div>
            <Radio.Group
              value={modalKind}
              onChange={(e) => setModalKind(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={[
                { label: '内部仓库', value: 'warehouse' },
                { label: '外部供应商', value: 'supplier' },
              ]}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
              仅需填写名称，其他信息后续在档案管理中补全。
            </div>
            <DsInput
              autoFocus
              placeholder={modalKind === 'warehouse' ? '仓库名称（如 一号仓库）' : '供应商名称'}
              value={modalName}
              onChange={(e) => setModalName(e.target.value)}
              onPressEnter={handleModalOk}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
