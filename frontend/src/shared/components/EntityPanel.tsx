// EntityPanel — 浮层表网格基座（C65）
//
// 从 MatrixTable / UnitManagePanel 抽出的共同 DOM：`.ds-grid-header` + `.ds-grid-row`。
// 二者是适配器，不是废弃：列结构、事件、点选语义仍由调用方决定。
// 呈现必须与抽出前一致（类名、行高、间距、选中底均走既有 `.ds-grid-*` 令牌）。

import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface EntityPanelRow {
  key: string;
  cells: ReactNode;
  selected?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  title?: string;
}

export interface EntityPanelProps {
  /** 共享组件编号（C19 / C29 / C65） */
  badge?: string;
  /** grid-template-columns */
  template: string;
  header: ReactNode;
  rows: EntityPanelRow[];
  addRow?: ReactNode;
  footer?: ReactNode;
  style?: CSSProperties;
}

export default function EntityPanel({
  badge = 'C65',
  template,
  header,
  rows,
  addRow,
  footer,
  style,
}: EntityPanelProps) {
  const colStyle: CSSProperties = { gridTemplateColumns: template };

  return (
    <div
      data-shared-badge={badge}
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', ...style }}
    >
      <div className="ds-grid-header" style={colStyle}>
        {header}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="ds-grid-row"
          style={{
            ...colStyle,
            cursor: row.onClick ? 'pointer' : undefined,
            background: row.selected ? 'var(--bg-overlay-l1)' : undefined,
          }}
          onClick={row.onClick}
          title={row.title}
        >
          {row.cells}
        </div>
      ))}
      {addRow != null && (
        <div className="ds-grid-row" style={colStyle}>
          {addRow}
        </div>
      )}
      {footer}
    </div>
  );
}
