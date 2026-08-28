// 原值 / 新值对比卡片（C70）。确认层、批量匹配等前后对比共用。
// 纯 CSS 两枚 chip + 箭头，无状态；禁止用「」把一对值包成一句。

export type ValueChipTone = 'from' | 'to' | 'onBrand';

export function ValueChip({
  tone,
  k,
  children,
}: {
  tone: ValueChipTone;
  k?: string;
  children: string;
}) {
  return (
    <span className={`ds-value-chip is-${tone === 'onBrand' ? 'on-brand' : tone}`} title={children}>
      {k ? <span className="ds-value-chip-k">{k}</span> : null}
      <span className="ds-value-chip-v">{children}</span>
    </span>
  );
}

export default function ValueChangePair({
  from,
  to,
}: {
  from?: string;
  to: string;
}) {
  const adding = !from;
  const label = adding ? `新增 ${to}` : `${from} 改为 ${to}`;
  return (
    <div
      className={`ds-change-pair${adding ? ' is-add' : ' is-replace'}`}
      data-shared-badge="C70"
      aria-label={label}
    >
      {adding ? <span className="ds-change-pair-verb">新增</span> : <ValueChip tone="from" k="原">{from}</ValueChip>}
      {adding ? null : (
        <span className="ds-change-pair-arrow" aria-hidden>
          →
        </span>
      )}
      <ValueChip tone="to" k={adding ? undefined : '新'}>
        {to}
      </ValueChip>
    </div>
  );
}
