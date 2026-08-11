// QuickOptionsBar — 预置快速选项条（共享组件）
//
// 设计依据：表格设计理念「数据补全·预置快速选项」——对高频率出现的枚举值
//   （常用单位：米/根/个/桶/捆…），面板底部提供快速选项条：点击直接把预置值
//   填入当前空行对应字段并触发新增。抽象为通用配置参数 quickOptions：
//   - 是否提供/提供哪些值 → options 传入（不传不渲染）
//   - 点击后的行为 → onPick 由使用方决定（单位面板 → 填入空行新增；其他面板 → 各按场景）
//   - 已用值自动禁用 → usedValues（避免重复新增）
// 与具体业务解耦，跨面板复用（单位面板「常用单位」、联系信息面板「常用方式」、
//   分类面板「常用分类」……均通过同一组件），禁止各面板自造快速选项条。

export interface QuickOption {
  /** 显示文本 */
  label: string;
  /** 填入值（通常等于 label；可分离如「米」label / 「1米」value） */
  value: string;
}

export interface QuickOptionsBarProps {
  /** 预置选项（不传/空 = 不渲染整条） */
  options: QuickOption[];
  /** 已使用值（禁用点击，避免重复新增） */
  usedValues?: string[];
  /** 点击选项回调 */
  onPick: (option: QuickOption) => void;
  /** 前置标签（默认「常用:」） */
  prefix?: string;
  /** 禁用 */
  disabled?: boolean;
}

export function QuickOptionsBar({
  options,
  usedValues = [],
  onPick,
  prefix = '常用:',
  disabled,
}: QuickOptionsBarProps) {
  if (!options.length) return null;
  return (
    <div
      style={{
        padding: '4px 0 0',
        display: 'flex',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        gap: 4,
        borderTop: '1px dashed var(--border-neutral-l1)',
        marginTop: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          alignSelf: 'center',
          marginRight: 4,
        }}
      >
        {prefix}
      </span>
      {options.map((opt) => {
        const used = usedValues.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (used || disabled) return;
              onPick(opt);
            }}
            disabled={used || disabled}
            style={{
              padding: '2px 6px',
              fontSize: 'var(--body-sm-font-size)',
              border: '1px solid var(--border-neutral-l2)',
              borderRadius: 'var(--radius-2)',
              background: 'var(--bg-base-tertiary)',
              cursor: used || disabled ? 'not-allowed' : 'pointer',
              color: used ? 'var(--text-quaternary)' : 'var(--text-default)',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default QuickOptionsBar;
