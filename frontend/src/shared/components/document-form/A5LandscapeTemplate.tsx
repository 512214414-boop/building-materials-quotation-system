/**
 * A5 横版单据模板
 * 尺寸：210mm × 148mm（794px × 559px @ 96dpi）
 * 容量：约 10-12 行数据行
 * 用途：随车配送、客户签收
 * 特点：左右布局，右侧宣传区（竖排文字）
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
import { TEMPLATE_CONFIGS } from './constants';

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
  width: TEMPLATE_CONFIGS.a5Landscape.width,
  height: TEMPLATE_CONFIGS.a5Landscape.height,
  background: 'var(--print-bg-paper)',
  boxShadow: 'var(--shadow-panel)',
  margin: '0 auto',
  padding: 12,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  display: 'flex',
  gap: 0,
};

const MAIN_STYLE: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

const SIDEBAR_STYLE: CSSProperties = {
  width: 50,
  background: 'var(--print-bg-paper-alt)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid var(--border-neutral-l1)',
  margin: '-12px',
  marginLeft: 12,
  padding: 12,
};

const SIDEBAR_TEXT_STYLE: CSSProperties = {
  writingMode: 'vertical-rl',
  fontSize: 11,
  color: 'var(--print-text-tertiary)',
  letterSpacing: 4,
};

const HEADER_STYLE: CSSProperties = {
  textAlign: 'center',
  borderBottom: '1px solid var(--print-border-strong)',
  paddingBottom: 2,
};

const COMPANY_NAME_STYLE: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

const BUSINESS_SCOPE_STYLE: CSSProperties = {
  fontSize: 8,
  color: 'var(--print-text-tertiary)',
  marginTop: 1,
};

const CONTACT_STYLE: CSSProperties = {
  fontSize: 8,
  padding: '1px 0',
  borderBottom: '1px solid var(--print-border-strong)',
  display: 'flex',
  justifyContent: 'space-between',
};

const META_STYLE: CSSProperties = {
  fontSize: 9,
  padding: '2px 0',
  borderBottom: '1px solid var(--print-border-strong)',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 9,
  margin: '4px 0',
};

const FOOTER_STYLE: CSSProperties = {
  fontSize: 8,
  borderTop: '1px solid var(--print-border-strong)',
  paddingTop: 2,
};

// ═══════════════════════════════════════════════════════════════
// 组件实现
// ═══════════════════════════════════════════════════════════════

export function A5LandscapeTemplate({
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
        <td style={{ textAlign: 'center', padding: '4px 2px' }}>
          {line.seq}
        </td>

        {/* 产品名称/规格列 */}
        <td
          style={{
            textAlign: 'left',
            padding: '4px 2px',
            paddingLeft: 2,
            fontSize: 8,
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
            padding: '4px 2px',
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'qty')}
        >
          {line.qty ?? '—'}
        </td>

        {/* 单位列 */}
        <td style={{ textAlign: 'center', padding: '4px 2px' }}>
          {line.unit || '—'}
        </td>

        {/* 单价列 */}
        <td
          style={{
            textAlign: 'center',
            padding: '4px 2px',
            cursor: editable ? 'text' : 'default',
          }}
          onClick={() => handleCellClick(line, 'price')}
        >
          {formatPrice(line.price)}
        </td>

        {/* 金额列 */}
        <td style={{ textAlign: 'center', padding: '4px 2px' }}>
          {formatAmount(line.amount)}
        </td>

        {/* 备注列 */}
        <td
          style={{
            textAlign: 'left',
            padding: '4px 2px',
            fontSize: 8,
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
    <div style={PAGE_STYLE} className="doc-page-a5-landscape">
      {/* 左侧主内容区 */}
      <div style={MAIN_STYLE}>
        {/* ═══════════════════════════════════════════ */}
        {/* 一、公司抬头 + 经营范围（紧凑版）            */}
        {/* ═══════════════════════════════════════════ */}
        <div style={HEADER_STYLE}>
          <div style={COMPANY_NAME_STYLE}>
            {header.companyName} · {header.title}
          </div>
          <div style={BUSINESS_SCOPE_STYLE}>
            经营范围：{header.businessScope}
          </div>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 二、公司联系方式（紧凑版，一行）              */}
        {/* ═══════════════════════════════════════════ */}
        <div style={CONTACT_STYLE}>
          <span>地址：{header.address}</span>
          <span>电话：{phoneText}</span>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 三、订单信息 + 客户信息（一行）                */}
        {/* ═══════════════════════════════════════════ */}
        <div style={META_STYLE}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span>
              单号：<strong>{document.documentNo}</strong>
            </span>
            <span>日期：{document.date}</span>
            <span>
              客户：<strong>{document.customerName}</strong>
            </span>
            <span>电话：{document.customerPhone || '—'}</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 四、表格区（必须有备注列）                    */}
        {/* ═══════════════════════════════════════════ */}
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={{ width: 24, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                序
              </th>
              <th style={{ width: 120, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                产品名称/规格
              </th>
              <th style={{ width: 28, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                数量
              </th>
              <th style={{ width: 24, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                单位
              </th>
              <th style={{ width: 40, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                单价
              </th>
              <th style={{ width: 48, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                金额
              </th>
              <th style={{ width: 50, border: '1px solid var(--print-border-strong)', padding: '4px 2px' }}>
                备注
              </th>
            </tr>
          </thead>
          <tbody>
            {page.lines.map((line) => renderTableRow(line))}
          </tbody>
        </table>

        {/* ═══════════════════════════════════════════ */}
        {/* 五、页脚区（多页统计逻辑）                    */}
        {/* ═══════════════════════════════════════════ */}
        <div style={FOOTER_STYLE}>
          {/* 非末页：本页小计 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 2,
            }}
          >
            <span>
              <strong>本页小计：{formatAmount(page.subtotal)}</strong>
            </span>
            <span style={{ color: 'var(--print-text-tertiary)' }}>
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
                marginBottom: 2,
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
              alignItems: 'center',
            }}
          >
            <span>制单：{footer.creatorName}</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span>收货人签字：</span>
              <span
                style={{
                  display: 'inline-block',
                  width: 50,
                  borderBottom: '1px solid var(--print-border-strong)',
                  marginLeft: 2,
                }}
              />
            </div>
          </div>

          {/* 页码 */}
          <div
            style={{
              textAlign: 'center',
              padding: '2px 0',
              marginTop: 2,
              color: 'var(--print-text-tertiary)',
            }}
          >
            第{page.pageIndex + 1}页/共{page.totalPages}页
          </div>
        </div>
      </div>

      {/* 右侧宣传区（竖排文字） */}
      <div style={SIDEBAR_STYLE}>
        <div style={SIDEBAR_TEXT_STYLE}>{header.businessScope}</div>
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
        `}</style>
      )}
    </div>
  );
}

export default A5LandscapeTemplate;