/**
 * A4 竖版单据模板
 * 尺寸：210mm × 297mm（794px × 1123px @ 96dpi）
 * 容量：约 25-28 行数据行
 * 用途：大宗批发、明细较多的订单
 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type {
  DocumentFormPage,
  DocumentFormLine,
  DocumentMeta,
  DocumentFooter,
  DocumentHeader,
  CellClickEvent,
} from './types';
import { TEMPLATE_CONFIGS, TIP_TEXT } from './constants';

// ═══════════════════════════════════════════════════════════════
// Props 定义
// ═══════════════════════════════════════════════════════════════

export interface DocumentTemplateProps {
  /** 单页数据 */
  page: DocumentFormPage;
  /** 单据元信息 */
  document: DocumentMeta;
  /** 页脚信息 */
  footer: DocumentFooter;
  /** 抬头信息 */
  header: DocumentHeader;
  /** 是否可编辑 */
  editable: boolean;
  /** 单元格点击回调 */
  onCellClick: (e: CellClickEvent) => void;
}

// ═══════════════════════════════════════════════════════════════
// 样式常量
// ═══════════════════════════════════════════════════════════════

const PAGE_STYLE: CSSProperties = {
  width: TEMPLATE_CONFIGS.a4Portrait.width,
  minHeight: TEMPLATE_CONFIGS.a4Portrait.height,
  background: 'var(--print-bg-paper)',
  boxShadow: 'var(--shadow-panel)',
  margin: '0 auto',
  padding: 16,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
};

const HEADER_STYLE: CSSProperties = {
  textAlign: 'center',
  borderBottom: '2px solid var(--print-border-strong)',
  paddingBottom: 4,
};

const COMPANY_NAME_STYLE: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
};

const TITLE_STYLE: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginTop: 2,
};

const BUSINESS_SCOPE_STYLE: CSSProperties = {
  fontSize: 10,
  color: 'var(--print-text-tertiary)',
  marginTop: 2,
};

const CONTACT_STYLE: CSSProperties = {
  fontSize: 10,
  padding: '3px 0',
  borderBottom: '1px solid var(--print-border-strong)',
  display: 'flex',
  justifyContent: 'space-between',
};

const META_STYLE: CSSProperties = {
  fontSize: 11,
  padding: '4px 0',
  borderBottom: '1px solid var(--print-border-strong)',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 10,
  margin: '6px 0',
};

const FOOTER_STYLE: CSSProperties = {
  fontSize: 10,
  borderTop: '1px solid var(--print-border-strong)',
  paddingTop: 4,
};

// ═══════════════════════════════════════════════════════════════
// 组件实现
// ═══════════════════════════════════════════════════════════════

export function A4PortraitTemplate({
  page,
  document,
  footer,
  header,
  editable,
  onCellClick,
}: DocumentTemplateProps) {

  // 格式化电话
  const phoneText = useMemo(() => {
    return header.phones.join(' / ');
  }, [header.phones]);

  // 格式化金额
  const formatAmount = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '—';
    return `¥${amount.toFixed(2)}`;
  };

  // 格式化单价
  const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return '—';
    return `¥${price}`;
  };

  // 处理单元格点击
  const handleCellClick = (
    line: DocumentFormLine,
    field: CellClickEvent['field'],
  ) => {
    if (!editable) return;
    onCellClick({
      lineId: line.id,
      field,
      value: line[field],
      isEmpty: line.isEmpty,
    });
  };

  // 渲染表格行
  const renderTableRow = (line: DocumentFormLine) => {
    const isEmptyRow = line.isEmpty;

    return (
      <tr
        key={line.id}
        className={isEmptyRow ? 'empty-row' : ''}
        style={{
          color: isEmptyRow ? 'var(--print-text-placeholder)' : 'inherit',
        }}
      >
        {/* 序号列 */}
        <td style={{ textAlign: 'center', padding: '6px 4px' }}>
          {editable && !isEmptyRow && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                // TODO: 显示更多菜单（删除/复制）
              }}
              style={{
                cursor: 'pointer',
                fontSize: 14,
                marginRight: 4,
                opacity: 0,
                transition: 'opacity 0.2s',
              }}
              className="more-menu-btn"
            >
              ⋮
            </span>
          )}
          {line.seq}
        </td>

        {/* 产品名称/规格列 */}
        <td
          style={{
            textAlign: 'left',
            padding: '6px 4px',
            paddingLeft: 4,
            fontSize: 10,
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'productRef')}
        >
          {line.productRef || '—'}
        </td>

        {/* 数量列 */}
        <td
          style={{
            textAlign: 'center',
            padding: '6px 4px',
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'qty')}
        >
          {line.qty ?? '—'}
        </td>

        {/* 单位列 */}
        <td style={{ textAlign: 'center', padding: '6px 4px' }}>
          {line.unit || '—'}
        </td>

        {/* 单价列 */}
        <td
          style={{
            textAlign: 'center',
            padding: '6px 4px',
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'price')}
        >
          {formatPrice(line.price)}
        </td>

        {/* 金额列 */}
        <td style={{ textAlign: 'center', padding: '6px 4px' }}>
          {formatAmount(line.amount)}
        </td>

        {/* 备注列 */}
        <td
          style={{
            textAlign: 'left',
            padding: '6px 4px',
            fontSize: 9,
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'remark')}
        >
          {line.remark || '—'}
        </td>
      </tr>
    );
  };

  return (
    <div style={PAGE_STYLE} className="doc-page-a4-portrait">
      {/* ═══════════════════════════════════════════ */}
      {/* 一、公司抬头 + 经营范围（固定印刷）          */}
      {/* ═══════════════════════════════════════════ */}
      <div style={HEADER_STYLE}>
        <div style={COMPANY_NAME_STYLE}>{header.companyName}</div>
        <div style={TITLE_STYLE}>{header.title}</div>
        <div style={BUSINESS_SCOPE_STYLE}>
          经营范围：{header.businessScope}
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 二、公司联系方式（固定印刷，一行）            */}
      {/* ═══════════════════════════════════════════ */}
      <div style={CONTACT_STYLE}>
        <span>地址：{header.address}</span>
        <span>电话：{phoneText}</span>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 三、订单信息（第一行，最前）                  */}
      {/* ═══════════════════════════════════════════ */}
      {/* 四、客户信息（第二行，紧随）                  */}
      {/* ═══════════════════════════════════════════ */}
      <div style={META_STYLE}>
        {/* 第1行：订单信息（单号 + 日期） */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 3 }}>
          <span>
            单号：
            <strong
              style={{
                borderBottom: '1px solid var(--print-border-strong)',
                padding: '0 8px',
              }}
            >
              {document.documentNo}
            </strong>
          </span>
          <span>
            日期：
            <strong
              style={{
                borderBottom: '1px solid var(--print-border-strong)',
                padding: '0 8px',
              }}
            >
              {document.date}
            </strong>
          </span>
        </div>

        {/* 第2行：客户信息（客户 + 电话 + 地址） */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>
            客户：
            <strong
              style={{
                borderBottom: '1px solid var(--print-border-strong)',
                padding: '0 10px',
              }}
            >
              {document.customerName}
            </strong>
          </span>
          <span>
            电话：
            <strong
              style={{
                borderBottom: '1px solid var(--print-border-strong)',
                padding: '0 8px',
              }}
            >
              {document.customerPhone || '—'}
            </strong>
          </span>
          <span>地址：{document.customerAddress || '—'}</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 五、表格区（最大化空间，七列含备注）          */}
      {/* ═══════════════════════════════════════════ */}
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={{ width: 30, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              序号
            </th>
            <th style={{ width: 200, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              产品名称/规格
            </th>
            <th style={{ width: 40, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              数量
            </th>
            <th style={{ width: 36, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              单位
            </th>
            <th style={{ width: 50, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              单价
            </th>
            <th style={{ width: 60, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              金额
            </th>
            <th style={{ width: 80, border: '1px solid var(--print-border-strong)', padding: '6px 4px' }}>
              备注
            </th>
          </tr>
        </thead>
        <tbody>
          {page.lines.map((line) => renderTableRow(line))}
        </tbody>
      </table>

      {/* ═══════════════════════════════════════════ */}
      {/* 六、页脚区（多页统计逻辑）                    */}
      {/* ═══════════════════════════════════════════ */}
      <div style={FOOTER_STYLE}>
        {/* 本页小计 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <span>
            <strong>本页小计：{formatAmount(page.subtotal)}</strong>
          </span>
          <span style={{ fontSize: 9, color: 'var(--print-text-tertiary)' }}>
            （共{page.totalPages}页{!page.isLastPage ? '，续下页' : ''}）
          </span>
        </div>

        {/* 末页：总计 + 大写 */}
        {page.isLastPage && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <span>
              <strong>总计：{formatAmount(footer.total)}</strong>
            </span>
            <span>
              <strong>大写：{footer.totalChinese}</strong>
            </span>
          </div>
        )}

        {/* 签字栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 9, color: 'var(--print-text-tertiary)' }}>
            {footer.tip || TIP_TEXT}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 10 }}>收货人签字：</span>
            <span
              style={{
                display: 'inline-block',
                width: 100,
                borderBottom: '1px solid var(--print-border-strong)',
                marginLeft: 4,
              }}
            />
          </div>
        </div>

        {/* 页码 */}
        <div
          style={{
            textAlign: 'center',
            padding: '4px 0',
            marginTop: 4,
            color: 'var(--print-text-tertiary)',
          }}
        >
          第{page.pageIndex + 1}页/共{page.totalPages}页
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 编辑态样式（hover 提示）                      */}
      {/* ═══════════════════════════════════════════ */}
      {editable && (
        <style>{`
          .empty-row:hover td {
            background: var(--print-bg-highlight);
            cursor: text;
          }
          .more-menu-btn {
            opacity: 0;
            transition: opacity 0.2s;
          }
          tr:hover .more-menu-btn {
            opacity: 1;
          }
        `}</style>
      )}
    </div>
  );
}

export default A4PortraitTemplate;