// DefaultFillsPreview — 保存前确认「完整档案字段清单」预览 + 统一自动补充确认流程
//
// 背景（用户三轮反馈）：
//   1. 原确认框罗列「缺失项 → 自动补充什么」不够直观 → 改为直接展示创建后的完整档案
//   2. 「普通品牌 / 未分类」不是预填种子数据——所有表初始无数据，输入框留空，
//      保存时才按值去重写入（存在即复用关联、不存在才新建）。确认框展示的是
//      「保存后将创建的完整实体档案」，让用户一眼看清这条记录长什么样
//   3. v15.4：**所有保存路径统一自动补充确认**——无论保存是手动触发、失焦触发还是静默保存，
//      只要涉及自动补充缺省值，保存执行前必须提示补充了什么并确认，统一行为与感知
//      （confirmFillsBeforeSave 单一入口，禁止各保存路径另写确认/静默补充）
// 设计（v15.3 通用分层）：
//   - groups：按数据层分组展示该实体的**全部字段**（如产品信息层：产品名称/分类/品牌/规格/单位）
//   - 必填字段排第一（required 星标）；auto=true 的自动补充项值高亮 + 「自动补充」标签
//   - notes：行级补充说明（如「售价 N 行自动补充价格类型「零售价」」，不属于单值字段）
//   - 通用：未来快速新建价格（价格信息层）/ 供应商等其他实体，同样按数据层传 groups，
//     展示与交互完全统一，禁止各实体另写确认弹窗
// 使用：QuickCreateConfirmDialog / ProductEditDialog / ProductManage 列表价格保存 统一走
//   confirmFillsBeforeSave（单一实现）

import type { CanvasModalInstance } from '../hooks/useCanvasApp';

export interface DefaultFillsPreviewField {
  /** 字段名（如 产品名称 / 分类 / 品牌 / 规格型号 / 单位） */
  label: string;
  /** 最终值（已补齐缺省值） */
  value: string;
  /** 是否本次自动补充（高亮 + 「自动补充」标签） */
  auto?: boolean;
  /** 是否必填（展示 * 星标，必填项排在分组首位） */
  required?: boolean;
}

export interface DefaultFillsPreviewGroup {
  /** 数据层名（如 产品信息层 / 价格信息层），不传则不显示层标题 */
  title?: string;
  fields: DefaultFillsPreviewField[];
}

export interface DefaultFillsPreviewProps {
  /** 内容区首行提示，默认「保存后将创建以下完整档案：」；仅 groups/notes 有内容时显示 */
  title?: string;
  /** 按数据层分组的字段清单（顺序即展示顺序；无单值字段时传空数组，仅展示 notes） */
  groups: DefaultFillsPreviewGroup[];
  /** 行级补充说明（售价/进价行自动补等） */
  notes?: string[];
}

export default function DefaultFillsPreview({
  title,
  groups,
  notes,
}: DefaultFillsPreviewProps) {
  const warningColor = 'var(--status-warning-default)';
  const hasNotes = !!notes && notes.length > 0;
  // 无任何内容（fields 与 notes 均空）时不显示首行提示
  const hasGroups = groups.some((g) => g.fields.length > 0);
  const showTitle = hasGroups || hasNotes;

  return (
    <div data-shared-badge="C31" style={{ fontSize: 12, lineHeight: 1.8 }}>
      {showTitle && (
        <div style={{ marginBottom: 6, color: 'var(--text-default)' }}>
          {title ?? '保存后将创建以下完整档案：'}
        </div>
      )}
      {groups.map((g, gi) =>
        g.fields.length === 0 ? null : (
          <div key={g.title ?? gi} style={{ marginBottom: gi === groups.length - 1 ? 0 : 10 }}>
            {g.title && <div style={{ marginBottom: 3, color: 'var(--text-tertiary)' }}>{g.title}</div>}
            <div
              style={{
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {g.fields.map((f, i) => (
                <div
                  key={f.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 10px',
                    background: i % 2 === 0 ? 'var(--bg-base-secondary)' : 'transparent',
                  }}
                >
                  <span style={{ width: 64, flexShrink: 0, color: 'var(--text-tertiary)' }}>
                    {f.label}
                    {f.required && (
                      <span style={{ color: 'var(--status-error-default)' }}> *</span>
                    )}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: f.auto ? 500 : 400,
                      color: f.auto ? warningColor : 'var(--text-default)',
                    }}
                    title={f.value}
                  >
                    {f.value}
                  </span>
                  {f.auto && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        lineHeight: '16px',
                        color: warningColor,
                        background: 'var(--status-warning-surface-l1)',
                        border: `1px solid ${warningColor}`,
                        borderRadius: 3,
                        padding: '0 4px',
                      }}
                    >
                      自动补充
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ),
      )}
      {hasNotes && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: warningColor }}>
          {notes!.map((n) => (
            <li key={n} style={{ marginBottom: 2 }}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ConfirmFillsBeforeSaveOptions {
  /** 各层字段清单（无单值字段时传空数组，仅展示 notes） */
  groups: DefaultFillsPreviewGroup[];
  /** 行级补充说明（售价/进价行等） */
  notes?: string[];
  /** 内容区首行提示（默认「保存后将创建以下完整档案：」） */
  contentTitle?: string;
}

/**
 * 保存前统一「自动补充确认」（v15.4 单一入口）：
 *   - 有自动补充项（auto 字段 / notes）→ 弹确认框，用户确认后返回 true 继续保存；取消返回 false（不保存）
 *   - 无补充项 → 直接返回 true（不打扰）
 * 所有保存路径（产品编辑 / 快速新建 / 列表价格保存 / 未来快速新建价格…）统一走本函数，
 * 无论保存是手动触发、失焦触发还是静默保存，只要涉及自动补充都必须先提示并确认。
 */
export async function confirmFillsBeforeSave(
  modal: CanvasModalInstance,
  options: ConfirmFillsBeforeSaveOptions,
): Promise<boolean> {
  const hasFills =
    options.groups.some((g) => g.fields.some((f) => f.auto)) ||
    (options.notes?.length ?? 0) > 0;
  if (!hasFills) return true;
  return new Promise<boolean>((resolve) => {
    modal.confirm({
      title: '保存前请确认',
      content: (
        <DefaultFillsPreview
          groups={options.groups}
          notes={options.notes}
          title={options.contentTitle}
        />
      ),
      okText: '确认保存',
      cancelText: '返回继续编辑',
      okButtonProps: { size: 'small' },
      cancelButtonProps: { size: 'small' },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
