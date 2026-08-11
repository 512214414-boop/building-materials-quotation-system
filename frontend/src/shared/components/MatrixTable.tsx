// MatrixTable — 多记录字段矩阵面板（唯一共享实现，同质同构收敛）
//
// ============================================================
// §A 组件定位
// ============================================================
// 表格工程范式「多记录字段（一列一条完整记录 + ▾ 展开矩阵面板）」的统一实现。
// 售价/进价明细面板、联系信息矩阵等所有"表头行 + 数据行（默认星标 + 各列输入 +
// 删除）+ 末尾常驻空行"形态的多记录面板，全部复用本组件，差异仅通过 props 注入：
//   - 列结构：名称列 + 可选中间列(midCols) + 值列 + 默认星标列 + 操作列
//   - 名称列内容、值列渲染、中间列渲染由调用方注入（ReactNode）
//   - 默认星标列固定在后（名称/midCols/值 → 默认 → 操作），全系统一致，
//     与产品管理售价/进价面板形态完全统一（v1.5 收敛：删除 defaultFirst 双形态）
//   - 末尾空行可配置（addMidCells / showAddButton）：售价/进价用新增按钮，
//     联系信息用空行直接输入自动追加
//
// 复用方式：同一组件承载所有多记录字段矩阵面板，禁止各功能硬编码重写
// （代码冗余 + 形态不一致）。
//
// ============================================================
// §B 行为规范（已统一，无需调用方关心）
// ============================================================
//   - 表头行 + 数据行 + 末尾常驻空行
//   - 面板宽度固定，内容超出横向滚动（overflowX: auto + touch）
//   - 默认星标：至多一条 default；用户未指定 → 调用方 normalize 取第一条
//   - 行级删除；所有控件统一 size sm，行高严格对齐（.ds-grid-row/.ds-grid-header）
//   - 差异（表头文字/名称列/值列/空行交互）全部由 props 注入

import { Fragment } from 'react';
import { DeleteOutlined, PlusOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import QuickOptionsBar, { type QuickOption } from './QuickOptionsBar.js';

// ============================================================
// §1 类型定义
// ============================================================

/** 矩阵数据行配置（由调用方注入各列内容与回调） */
export interface MatrixRowConfig {
  rowKey: string;
  /**
   * v2.0：切换选中的业务 key（默认 = rowKey）。
   * 选中高亮与 onRowSelect 回传均用 selectKey——业务 key（价格类型 ID/供应商 ID/单位 ID）
   * 与行 rowKey（渲染标识，可能带前缀）解耦，调用方无需解析 rowKey 取业务值。
   */
  selectKey?: string;
  /** 名称列内容（由调用方注入：售价用 SuggestInput、进价用 SuggestInput、联系信息用 DsInput） */
  nameCell: React.ReactNode;
  /** 名称列与值列之间的中间列内容（与 midCols 表头对齐；进价明细：面价/点位） */
  midCells?: React.ReactNode[];
  /** 值列内容（未提供 priceRender 时渲染数字输入框） */
  price: string;
  /** 值列变更回调 */
  onPriceChange: (val: string) => void;
  /** 值列自定义渲染（进价行用只读「进价 = 面价 × 点位」替代输入框；联系信息用普通输入） */
  priceRender?: React.ReactNode;
  /** 是否默认记录 */
  isDefault: boolean;
  /** 默认切换回调 */
  onIsDefaultChange: () => void;
  /** 默认按钮 title */
  defaultTitle: string;
  /** 默认按钮是否禁用 */
  defaultDisabled?: boolean;
  /** 删除回调 */
  onDelete: () => void;
  /** 删除按钮 title */
  deleteTitle: string;
  /** 删除按钮是否禁用（联系信息：空行/仅剩一行时禁用） */
  deleteDisabled?: boolean;
  /** 隐藏删除按钮（推算/只读信息行） */
  hideDelete?: boolean;
}

export interface MatrixTableProps {
  /** 表头名称列文字 */
  headerName: string;
  /** 表头值列文字 */
  headerPrice: string;
  /** 名称列与值列之间的中间列表头（进价明细：面价/点位） */
  midCols?: string[];
  /** 数据行配置 */
  rows: MatrixRowConfig[];
  /** 末尾空行：名称列内容 */
  addNameCell: React.ReactNode;
  /** 末尾空行：值列内容 */
  addPriceCell: React.ReactNode;
  /** 末尾空行：中间列内容（与 midCols 对齐；联系信息方式列） */
  addMidCells?: React.ReactNode[];
  /** 末尾空行：新增提交回调（联系信息可传空，用空行直接输入自动追加） */
  onAddCommit?: () => void;
  /** 末尾空行：新增按钮是否禁用 */
  addDisabled?: boolean;
  /** 值列字体颜色（进价红色） */
  priceColor?: string;
  disabled?: boolean;
  /** 是否显示末尾「新增」按钮（售价/进价 true；联系信息 false = 空行直接输入自动追加） */
  showAddButton?: boolean;
  /** 自定义网格模板（不传则按 midCols 默认生成） */
  template?: string;
  /**
   * v1.9：预置快速选项（数据补全·预置快速选项，通用配置——不传不渲染）。
   * 点击把预置值填入当前空行对应字段并触发新增；与业务解耦，跨面板复用。
   */
  quickOptions?: QuickOption[];
  /** 快速选项已使用值（禁用点击，避免重复新增） */
  quickOptionsUsed?: string[];
  /** 快速选项点击回调（由使用方决定填入哪个字段并触发新增） */
  onQuickPick?: (option: QuickOption) => void;
  /**
   * v2.0：多记录字段「切换选中（本地态）」构成元素——单元格切换显示哪条记录。
   * 提供 onRowSelect 时，行点击切换当前选中（本地态，不落库），选中行高亮；
   * 行内输入控件/按钮点击不触发切换（保持编辑交互）。单位/售价/进价/联系信息面板共用。
   */
  selectedRowKey?: string;
  /** 行点击切换回调（本地态；提供则行可点击切换，未提供则行为不可点） */
  onRowSelect?: (rowKey: string) => void;
  /** 行是否禁止切换（如售价面板未录价的价格类型行不可切换显示） */
  rowSelectDisabled?: (rowKey: string) => boolean;
}

// ============================================================
// §2 组件实现
// ============================================================

export default function MatrixTable({
  headerName,
  headerPrice,
  midCols,
  rows,
  addNameCell,
  addPriceCell,
  addMidCells,
  onAddCommit,
  addDisabled,
  priceColor,
  disabled,
  showAddButton = true,
  template,
  quickOptions,
  quickOptionsUsed,
  onQuickPick,
  selectedRowKey,
  onRowSelect,
  rowSelectDisabled,
}: MatrixTableProps) {
  // 网格模板：名称(1fr) [midCols(56px)] 值(80px) 默认(28px) 操作(24px)
  // v1.5：默认星标列固定在后，全系统一致（删除 defaultFirst 双形态）
  const defaultTemplate =
    `minmax(100px, 1fr)${midCols?.length ? ` ${midCols.map(() => '56px').join(' ')}` : ''} 80px` +
    ' 28px 24px';
  const gridTemplate = template ?? defaultTemplate;

  // 默认列（星标）
  const renderDefaultBtn = (row: MatrixRowConfig) => (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <DsButton
        size="sm"
        variant={row.isDefault ? 'primary' : 'secondary'}
        icon={row.isDefault ? <StarFilled /> : <StarOutlined />}
        onClick={row.onIsDefaultChange}
        disabled={disabled || row.defaultDisabled}
        style={{
          padding: '0 4px',
          height: 20,
          fontSize: 10,
          background: row.isDefault ? 'var(--text-brand)' : 'transparent',
          borderColor: row.isDefault ? 'var(--text-brand)' : 'var(--border-neutral-l2)',
          color: row.isDefault ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
        }}
        title={row.defaultTitle}
      />
    </div>
  );

  // 操作列（删除）
  const renderDeleteBtn = (row: MatrixRowConfig) => (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {row.hideDelete ? null : (
        <DsButton
          size="sm"
          variant="ghost"
          danger
          icon={<DeleteOutlined />}
          onClick={row.onDelete}
          disabled={disabled || row.deleteDisabled}
          title={row.deleteTitle}
        />
      )}
    </div>
  );

  // 表头行：名称 / midCols / 值 / 默认 / 操作（默认列固定在后）
  const headerCells: React.ReactNode[] = [];
  headerCells.push(<span key="name" style={{ textAlign: 'left', paddingLeft: 8 }}>{headerName}</span>);
  midCols?.forEach((h) => headerCells.push(<span key={h} style={{ textAlign: 'center' }}>{h}</span>));
  headerCells.push(<span key="price" style={{ textAlign: 'center' }}>{headerPrice}</span>);
  headerCells.push(<span key="default" style={{ textAlign: 'center' }}>默认</span>);
  headerCells.push(<span key="op" style={{ textAlign: 'center' }}>操作</span>);

  // 数据行：名称 / midCols / 值 / 默认 / 操作（默认列固定在后）
  // v1.4 修复【共享组件级缺陷】：数组元素全部补唯一 key（React key 警告），
  //   默认/删除按钮、名称列、值列、空行列全部 Fragment 包裹带 key，不新增 DOM 层级
  const rowCells = (row: MatrixRowConfig): React.ReactNode[] => {
    const cells: React.ReactNode[] = [];
    cells.push(<Fragment key="name">{row.nameCell}</Fragment>);
    row.midCells?.forEach((cell, i) => (
      cells.push(<div key={`mid_${i}`} style={{ display: 'flex', justifyContent: 'center' }}>{cell}</div>)
    ));
    cells.push(
      <Fragment key="price">
        {row.priceRender ?? (
          <DsInput
            size="sm"
            variant="price"
            numericColor={priceColor}
            value={row.price}
            onChange={(e) => row.onPriceChange(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={disabled}
          />
        )}
      </Fragment>,
    );
    cells.push(<Fragment key="default">{renderDefaultBtn(row)}</Fragment>);
    cells.push(<Fragment key="op">{renderDeleteBtn(row)}</Fragment>);
    return cells;
  };

  // 末尾空行
  const addCells: React.ReactNode[] = [];
  addCells.push(<Fragment key="name">{addNameCell}</Fragment>);
  if (addMidCells?.length) {
    addMidCells.forEach((cell, i) => (
      addCells.push(<div key={`mid_${i}`} style={{ display: 'flex', justifyContent: 'center' }}>{cell}</div>)
    ));
  } else {
    midCols?.forEach((h) => addCells.push(<span key={h} />));
  }
  addCells.push(<Fragment key="price">{addPriceCell}</Fragment>);
  addCells.push(<span key="default" />);
  addCells.push(
    <Fragment key="op">
      {showAddButton ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DsButton
            size="sm"
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={onAddCommit}
            disabled={addDisabled || disabled}
            title="新增"
          />
        </div>
      ) : (
        <span />
      )}
    </Fragment>,
  );

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div className="ds-grid-header" style={{ gridTemplateColumns: gridTemplate }}>
        {headerCells}
      </div>
      {rows.map((row) => {
        // v2.0：多记录字段「切换选中（本地态）」——行点击切换当前显示记录
        //   选中匹配与回传均用 selectKey（业务 key），与 rowKey（渲染标识）解耦
        const rowSelectKey = row.selectKey ?? row.rowKey;
        const selectDisabled = rowSelectDisabled?.(row.rowKey) ?? false;
        const isSelected = !!onRowSelect && rowSelectKey === selectedRowKey && !selectDisabled;
        return (
          <div
            key={row.rowKey}
            className="ds-grid-row"
            style={{
              gridTemplateColumns: gridTemplate,
              cursor: onRowSelect && !selectDisabled ? 'pointer' : undefined,
              background: isSelected ? 'var(--bg-overlay-l1)' : undefined,
            }}
            onClick={(e) => {
              if (!onRowSelect || selectDisabled) return;
              // 输入控件/按钮/下拉内点击不触发切换（保持行内编辑交互）
              const t = e.target as HTMLElement;
              if (
                t.closest(
                  'input, textarea, button, a, [role="combobox"], .ant-select, .ant-picker',
                )
              ) {
                return;
              }
              onRowSelect(rowSelectKey);
            }}
            title={
              onRowSelect && !selectDisabled
                ? isSelected
                  ? '当前显示记录'
                  : '点击切换显示'
                : undefined
            }
          >
            {rowCells(row)}
          </div>
        );
      })}
      <div className="ds-grid-row" style={{ gridTemplateColumns: gridTemplate }}>
        {addCells}
      </div>
      {/* v1.9：预置快速选项（通用配置，不传不渲染） */}
      {quickOptions && onQuickPick && (
        <QuickOptionsBar
          options={quickOptions}
          usedValues={quickOptionsUsed ?? []}
          disabled={disabled}
          onPick={onQuickPick}
        />
      )}
    </div>
  );
}
