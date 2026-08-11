// DsDrawer — 设计系统抽屉
//
// 用途：一对多关系中「多」这一侧的子明细展示容器
// 设计：
//   - 顶部：返回按钮 + 面包屑导航 + 关闭按钮
//   - 主体：子表格区域（由 children 提供）
//   - 宽度：支持层级递减（默认 1200，可配置 1000/800）
//   - 多层抽屉：通过 mask={false} + offset 实现「逐层递进」视觉效果
import { Drawer } from 'antd';
import type { DrawerProps } from 'antd';
import { ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface DsDrawerProps extends Omit<DrawerProps, 'title'> {
  /** 抽屉层级（1=第一层，2=第二层，3=第三层）；用于计算宽度和偏移 */
  level?: 1 | 2 | 3;
  /** 面包屑导航节点数组，如 ['产品管理', '客厅地砖', '东鹏（利润率20%）'] */
  breadcrumb?: ReactNode[];
  /** 自定义宽度（覆盖 level 默认值） */
  width?: number | string;
  /** 主体内容 */
  children?: ReactNode;
  /** 顶部右侧额外操作区（如「新增行」按钮） */
  extra?: ReactNode;
}

const LEVEL_WIDTH: Record<1 | 2 | 3, number> = {
  1: 1200,
  2: 1000,
  3: 800,
};

const LEVEL_OFFSET: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 64,
  3: 128,
};

export function DsDrawer({
  level = 1,
  breadcrumb = [],
  width,
  children,
  extra,
  onClose,
  ...rest
}: DsDrawerProps) {
  const resolvedWidth = width ?? LEVEL_WIDTH[level];
  const offset = LEVEL_OFFSET[level];

  // 面包屑渲染：节点之间用 / 分隔
  // v10.1：横向滚动全覆盖原则，禁止 flex-wrap: wrap
  const breadcrumbNode =
    breadcrumb.length > 0 ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          fontSize: 'var(--body-xs-font-size)',
          color: 'var(--text-tertiary)',
          lineHeight: 1.4,
          flex: 1,
          minWidth: 0,
        }}
      >
        {breadcrumb.map((node, idx) => (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: idx === breadcrumb.length - 1 ? 600 : 400,
              color: idx === breadcrumb.length - 1 ? 'var(--text-default)' : 'var(--text-tertiary)',
            }}
          >
            {idx > 0 && <span style={{ color: 'var(--text-quaternary)' }}>/</span>}
            {node}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <Drawer
      {...rest}
      open={rest.open}
      onClose={onClose}
      width={resolvedWidth}
      // 多层抽屉：第2层起无遮罩，避免遮住上一层
      mask={level === 1 ? rest.mask ?? true : false}
      // 多层抽屉：第2层起向右偏移，露出上一层左侧
      style={level > 1 ? { marginLeft: offset, marginRight: offset } : undefined}
      closable={false}
      destroyOnHidden
      styles={{
        header: { display: 'none' },
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
        ...rest.styles,
      }}
    >
      {/* 顶部栏：返回按钮 + 面包屑 + 关闭按钮 */}
      {/* v10.1：移动端紧凑化，padding 8px，gap 8px */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          paddingTop: 'calc(6px + var(--safe-area-top))',
          borderBottom: '1px solid var(--border-neutral-l1)',
          background: 'var(--bg-base-secondary)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={(e) => onClose?.(e as any)}
          style={{
            background: 'none',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-4)',
            padding: '4px 8px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 'var(--body-sm-font-size)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="返回上一级"
        >
          <ArrowLeftOutlined />
          返回
        </button>
        {breadcrumbNode}
        <div style={{ flex: 1 }} />
        {extra}
        <button
          type="button"
          onClick={(e) => onClose?.(e as any)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            padding: 4,
            display: 'inline-flex',
            alignItems: 'center',
          }}
          title="关闭"
        >
          <CloseOutlined />
        </button>
      </div>
      {/* 主体内容 */}
      {/* v10.1：移动端 padding 8px，桌面端 12px */}
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>{children}</div>
    </Drawer>
  );
}

export default DsDrawer;
