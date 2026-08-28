// v14.0 规格列表面板（嵌入式，挂在产品编辑弹窗规格输入框旁的下拉按钮）
// v1.7.1.6：已收敛为共享组件 DictListPanel 的配置化薄封装（差异仅 props 注入）
//
// 设计依据：用户「和分类一样，输入框可以快速检索匹配和新增，
//   下拉用于查看当前产品的全部规格，有行级别的独立编辑删除新增按钮」指令
//
// 面板结构（v11.3 对齐 CategoryManagePanel 交互模式）：
//   顶部：搜索输入框（实时过滤规格列表）
//   表头：规格型号 | 品牌数 | 操作
//   列表：规格行（点击规格名切换到该规格 | 编辑按钮→行内编辑 | 删除按钮→确认删除）
//   底部：新增规格按钮（button 模式，无输入框）
//
// 行级操作（v14.0：规格为独立 spec 表，改名/删除调规格级 API）：
//   - 点击规格名称 → 切换到该规格编辑（onSelect）
//   - 编辑按钮 → 行内编辑规格型号（调 updateSpec），支持 Enter 保存、Esc 取消
//   - 删除按钮 → 确认弹窗（显示引用计数）→ 调 deleteSpec
//   - 新增按钮 → 在同产品下新建规格（onAdd）
//
// 规格唯一性约束：(productId, brandId, specModel) 不重复
//   - 编辑保存时，若新值与其他规格重复，后端返回 409/唯一约束错误，前端提示

import { useCallback, useMemo } from 'react';
import DictListPanel, { type DictListPanelItem } from '../../../../shared/components/DictListPanel.js';
import { useCanvasApp } from '../../../../shared/hooks/useCanvasApp.js';
import {
  updateSpec,
  deleteSpec,
  getSpecDocRefs,
  type SiblingSpec,
} from '../../../../shared/services/api/baseDataApi.js';

// ============================================================
// §1 类型
// ============================================================

export interface SpecListPanelProps {
  /** 同产品名的所有规格列表 */
  specs: SiblingSpec[];
  /** v14.0：当前选中的规格 ID（用于高亮当前行；与产品 ID 区分，spec.id 才是规格唯一键） */
  currentSpecId: string | null;
  /** 是否在创建新规格模式（高亮"新建"行） */
  creatingSibling: boolean;
  /** 当前规格输入框的值（用于新建行显示） */
  currentSpecModel: string;
  /** 选择规格回调（切换到指定规格） */
  onSelect: (specId: string) => void;
  /** 新增规格回调 */
  onAdd: () => void;
  /** 规格变更回调（编辑/删除后刷新外部列表） */
  onSpecChanged?: () => void;
  /** 禁用（loading/saving 时） */
  disabled?: boolean;
}

// ============================================================
// §2 规格列表面板主组件（DictListPanel 配置化薄封装）
// ============================================================

export function SpecListPanel({
  specs,
  currentSpecId,
  creatingSibling,
  currentSpecModel,
  onSelect,
  onAdd,
  onSpecChanged,
  disabled,
}: SpecListPanelProps) {
  const { message, modal } = useCanvasApp();

  // ---- 业务行 → 通用面板行映射 ----
  const items = useMemo<DictListPanelItem[]>(
    () =>
      specs.map((spec) => ({
        key: spec.id,
        name:
          spec.status === 0 ? (
            <>
              {spec.specModel || '(空)'}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>(停用)</span>
            </>
          ) : (
            (spec.specModel || '(空)')
          ),
        count: spec.brandCount > 0 ? spec.brandCount : null,
        // v14.0：按规格 ID 判断当前行（spec.id === currentSpecId）
        isCurrent: spec.id === currentSpecId && !creatingSibling,
        disabled,
        // 当前规格不可删除（与分类面板删除语义一致：禁止删除当前正编辑项）
        deletable: !(spec.id === currentSpecId && !creatingSibling),
        data: spec,
      })),
    [specs, currentSpecId, creatingSibling, disabled],
  );

  // ---- 选择规格（切换） ----
  const handleSelect = useCallback(
    (item: DictListPanelItem) => {
      const spec = item.data as SiblingSpec;
      // v14.0：当前规格判断用 currentSpecId（规格 ID），不是产品 ID
      if (disabled || spec.id === currentSpecId) return;
      onSelect(spec.id);
    },
    [disabled, currentSpecId, onSelect],
  );

  // ---- 保存编辑（调 updateProduct 仅更新 specModel） ----
  const handleRename = useCallback(
    async (item: DictListPanelItem, newName: string) => {
      const spec = item.data as SiblingSpec;
      if (newName === spec.specModel) return;
      // 前端预检：同列表内是否有重复规格
      if (specs.some((s) => s.id !== spec.id && s.specModel === newName)) {
        message.warning(`规格「${newName}」已存在`);
        throw new Error('duplicate');
      }
      try {
        await updateSpec(spec.id, { specModel: newName });
        message.success('规格型号已更新');
        onSpecChanged?.();
      } catch (e) {
        const err = e as { message?: string };
        // 后端唯一约束冲突
        if (/unique|duplicate|重复/i.test(err?.message ?? '')) {
          message.warning(`规格「${newName}」已存在`);
        } else {
          message.error(err?.message || '修改失败，请重试');
        }
        throw e;
      }
    },
    [specs, message, onSpecChanged],
  );

  // ---- 删除规格（调 deleteProduct，显示引用计数） ----
  const handleDelete = useCallback(
    (item: DictListPanelItem) => {
      const spec = item.data as SiblingSpec;
      const doDelete = () =>
        modal.confirm({
          title: '删除规格',
          content: `确认删除规格「${spec.specModel}」？此操作不可恢复。`,
          okText: '确认删除',
          cancelText: '取消',
          okType: 'danger',
          onOk: async () => {
            try {
              await deleteSpec(spec.id);
              message.success('规格已删除');
              // 如果删除的是当前规格，需要外部处理（关闭弹窗或切换）
              onSpecChanged?.();
            } catch {
              message.error('删除失败，请重试');
            }
          },
        });
      // 先查引用计数
      void getSpecDocRefs(spec.id)
        .then((refs) => {
          const docCount = refs.docLineCount ?? 0;
          if (docCount > 0) {
            modal.confirm({
              title: '删除规格',
              content: `规格「${spec.specModel}」已被 ${docCount} 个单据行引用，删除后单据中的快照信息保留，但产品数据将不可恢复。确认删除？`,
              okText: '确认删除',
              cancelText: '取消',
              okType: 'danger',
              onOk: async () => {
                try {
                  await deleteSpec(spec.id);
                  message.success('规格已删除');
                  onSpecChanged?.();
                } catch {
                  message.error('删除失败，请重试');
                }
              },
            });
          } else {
            doDelete();
          }
        })
        .catch(() => {
          doDelete();
        });
    },
    [modal, message, onSpecChanged],
  );

  // ---- 底部「新建中」行（creatingSibling 高亮） ----
  const footer = useMemo(() => {
    if (!creatingSibling) return undefined;
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) 48px 88px',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px',
          fontSize: 'var(--body-xs-font-size)',
          border: '1px dashed var(--text-brand)',
          background: 'var(--bg-brand-popup)',
        }}
      >
        <span style={{ color: 'var(--text-brand)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentSpecModel || '新规格'}
          <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>(新建)</span>
        </span>
        <span style={{ textAlign: 'center', color: 'var(--text-quaternary)' }}>—</span>
        <span style={{ textAlign: 'center', color: 'var(--text-brand)', fontSize: 10 }}>新建</span>
      </div>
    );
  }, [creatingSibling, currentSpecModel]);

  return (
    <>
      <div
        style={{
          padding: '4px 8px 0',
          fontSize: 'var(--body-xs-font-size)',
          color: 'var(--text-tertiary)',
        }}
      >
        改规格名立即写入档案；单位/价格/图片点弹窗底部保存
      </div>
    <DictListPanel
      items={items}
      nameHeader="系列/规格"
      countHeader="品牌"
      searchable
      searchPlaceholder="搜索系列/规格"
      addPlaceholder="新增系列/规格"
      addPosition="bottom"
      addMode="button"
      onCreate={() => onAdd()}
      onRename={handleRename}
      onDelete={handleDelete}
      onSelect={handleSelect}
      emptyText="暂无规格"
      footer={footer}
      disabled={disabled}
      editPlaceholder="输入系列/规格"
    />
    </>
  );
}

export default SpecListPanel;
