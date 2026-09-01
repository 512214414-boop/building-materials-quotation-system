// CascadeSwitchRow — 级联切换行（编辑矩阵中间层统一形态，v26）
//
// 每个中间层一行：行首=层级名，选项横排（唯一性字段值或字段拼接），选中高亮，
// 末尾=新增空位（确认层）。多行级联（品牌行→规格行→单位行）整体呈现挂载层级关系。
//
// 交互（两段式 · 首次点选中，再次点进确认层）：
//   - 未选中选项：纯文本，点任意处 = 切换（onSelect）
//   - 已选中选项：整个按钮都是确认层热区，点任意处 = 进确认层（editCell 注入的格子）
// 热区为什么必须撑满：确认层格原本只有文字那几个像素可点，跟按钮边的 padding 之间是
// 死区（点在 padding 上什么都不会发生），手指点不准。撑满之后「点哪都能进」，
// 行为靠状态（选中/未选中）区分，不再靠点击位置区分。
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface CascadeOption {
  key: string;
  /** 选项显示文本（唯一性字段值或字段拼接） */
  label: string;
  active?: boolean;
  /** 选中态的名称确认层格（替代 label 渲染；未选中忽略） */
  editCell?: ReactNode;
  /** 附加信息（如 (1图)） */
  suffix?: ReactNode;
}

export interface CascadeSwitchRowProps {
  /** 行首层级名（品牌 / 规格 / 单位） */
  label: string;
  options: CascadeOption[];
  /** 点击未选中选项 = 切换 */
  onSelect: (key: string) => void;
  /** 末尾新增空位（确认层） */
  addCell?: ReactNode;
  /** 选中项的编辑区（多字段层：单行编辑表格；渲染在切换行下方） */
  editRow?: ReactNode;
  disabled?: boolean;
}

const labelStyle: CSSProperties = {
  flex: '0 0 auto',
  minWidth: 44,
  fontSize: 'var(--body-sm-font-size)',
  fontWeight: 650,
  color: 'var(--text-secondary)',
};

const optBase: CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--tag-border, var(--border-neutral-l2))',
  borderRadius: 'var(--radius-3)',
  background: 'transparent',
  color: 'var(--text-default)',
  cursor: 'pointer',
  fontSize: 'var(--body-sm-font-size)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
};

const optActive: CSSProperties = {
  border: '1px solid var(--text-brand)',
  background: 'var(--bg-brand-popup)',
  color: 'var(--text-brand)',
  fontWeight: 500,
  cursor: 'pointer', // 选中态仍可点（再点进确认层），光标要告诉人
};

// 选中态：按钮的 padding 交给这层容器，容器 flex 撑满整格——
// DisplayCell 的 width:100% 才能覆盖到按钮边缘，热区不再只有文字那几个像素。
const EDIT_FILL: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  alignSelf: 'stretch',
  minWidth: 0,
  padding: '4px 10px',
};

export default function CascadeSwitchRow({
  label,
  options,
  onSelect,
  addCell,
  editRow,
  disabled,
}: CascadeSwitchRowProps) {
  const guard = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    if (!disabled) fn();
  };

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 6,
          alignItems: 'center',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 2,
        }}
      >
        <span style={labelStyle}>{label}</span>
        {options.map((o) => (
          <div
            key={o.key}
            className="cascade-opt"
            onClick={guard(() => {
              if (!o.active) onSelect(o.key);
            })}
            style={{
              ...optBase,
              ...(o.active ? optActive : {}),
              // 确认层格自带 padding，按钮这层让出去，热区才连成一片
              ...(o.active && o.editCell ? { padding: 0 } : {}),
            }}
            title={o.label}
          >
            {o.active && o.editCell ? (
              <span style={EDIT_FILL}>
                <span style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {o.editCell}
                </span>
                {o.suffix}
              </span>
            ) : (
              <>
                <span style={{ minWidth: 24, textAlign: 'center' }}>{o.label}</span>
                {o.suffix}
              </>
            )}
          </div>
        ))}
        {addCell != null && (
          <div
            style={{
              padding: '4px 10px',
              border: '1px dashed var(--text-brand)',
              borderRadius: 'var(--radius-3)',
              background: 'var(--add-bg, transparent)',
              color: 'var(--text-brand)',
              fontSize: 'var(--body-sm-font-size)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              minWidth: 88,
            }}
          >
            {addCell}
          </div>
        )}
      </div>
      {editRow}
    </div>
  );
}
