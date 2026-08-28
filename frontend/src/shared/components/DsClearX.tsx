// 单输入框清除：与采购报价「客户」输入框同一套
// 纯文本 ×、有值且悬停/聚焦才出现、绝对定位不占流式宽度。

import type { CSSProperties, MouseEvent } from 'react';

export interface DsClearXProps {
  onClear: () => void;
  style?: CSSProperties;
}

export function DsClearX({ onClear, style }: DsClearXProps) {
  return (
    <button
      type="button"
      className="ds-clear-x"
      tabIndex={-1}
      aria-label="清除"
      title="清除"
      style={style}
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
    />
  );
}

export default DsClearX;
