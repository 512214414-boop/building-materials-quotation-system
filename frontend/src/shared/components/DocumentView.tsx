/**
 * 单据视图组件 - 用于打印预览和单据展示
 *
 * 核心设计原则：
 * 1. 所见即所得：屏幕显示与打印效果完全一致
 * 2. 紧凑排版：订单信息一行、客户信息一行、最大化数据行空间
 * 3. 多页统计：非末页显示"本页小计"，末页显示"总计（大写）"
 * 4. 完整信息：公司抬头+经营范围+联系方式+订单信息+客户信息+表格（含备注列）+页脚
 *
 * 支持三种模板：
 * - A4 竖版：794×1123px，25-28行
 * - A5 横版：794×559px，10-12行
 * - A5 竖版：559×794px，16-18行
 */

import { useMemo } from 'react';
import type { StaffDocumentLine } from '../services/api/documentApi.js';

export type PaperSize = 'a4-portrait' | 'a5-landscape' | 'a5-portrait';

export interface DocumentViewProps {
  /** 单据数据 */
  document: {
    id: string;
    documentNo: string;
    createdAt: string;
    status: string;
    customerName?: string | null;
    customerPhone?: string | null;
    deliveryAddress?: string | null;
    totalAmount?: number;
    remark?: string | null;
  };
  /** 单据明细行 */
  lines: StaffDocumentLine[];
  /** 纸张尺寸 */
  paperSize?: PaperSize;
  /** 是否为打印模式（隐藏编辑UI） */
  printMode?: boolean;
  /** 公司信息（固定印刷部分） */
  companyInfo?: {
    name: string;
    businessScope: string;
    address: string;
    phones: string[];
  };
}

// 默认公司信息
const DEFAULT_COMPANY_INFO = {
  name: '某某建材批发部',
  businessScope: '主营：水电材料、五金交电、装饰材料、建筑辅料',
  address: '某市某区某路123号',
  phones: ['138-0000-0001', '0571-88888888'],
};

// 纸张尺寸配置
const PAPER_CONFIG = {
  'a4-portrait': { width: 794, height: 1123, rowsPerPage: 26 },
  'a5-landscape': { width: 794, height: 559, rowsPerPage: 11 },
  'a5-portrait': { width: 559, height: 794, rowsPerPage: 17 },
};

/**
 * 数字转大写金额
 */
function numberToChinese(num: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];

  if (num === 0) return '零元整';

  const str = num.toFixed(2).replace('.', '');
  let result = '';
  let zeroFlag = false;

  for (let i = 0; i < str.length; i++) {
    const digit = parseInt(str[i]);
    const pos = str.length - i - 1;

    if (digit === 0) {
      zeroFlag = true;
      if (pos === 4 || pos === 8) {
        result += units[pos];
      }
    } else {
      if (zeroFlag) {
        result += '零';
        zeroFlag = false;
      }
      result += digits[digit] + units[pos];
    }
  }

  result += '元整';
  return result;
}

/**
 * 计算分页数据
 */
function calculatePages(
  lines: StaffDocumentLine[],
  rowsPerPage: number
): Array<{ lines: StaffDocumentLine[]; subtotal: number; isLastPage: boolean }> {
  const pages: Array<{ lines: StaffDocumentLine[]; subtotal: number; isLastPage: boolean }> = [];

  for (let i = 0; i < lines.length; i += rowsPerPage) {
    const pageLines = lines.slice(i, i + rowsPerPage);
    const subtotal = pageLines.reduce((sum, line) => {
      const amount = parseFloat(line.amount || '0');
      return sum + amount;
    }, 0);
    const isLastPage = i + rowsPerPage >= lines.length;

    pages.push({ lines: pageLines, subtotal, isLastPage });
  }

  // 至少有一页（空单据也要显示）
  if (pages.length === 0) {
    pages.push({ lines: [], subtotal: 0, isLastPage: true });
  }

  return pages;
}

/**
 * 单个单据页面组件
 */
function DocumentPage({
  document,
  lines,
  subtotal,
  isLastPage,
  totalAmount,
  paperSize,
  printMode,
  companyInfo,
  pageNo,
  totalPages,
}: {
  document: DocumentViewProps['document'];
  lines: StaffDocumentLine[];
  subtotal: number;
  isLastPage: boolean;
  totalAmount: number;
  paperSize: PaperSize;
  printMode: boolean;
  companyInfo: NonNullable<DocumentViewProps['companyInfo']>;
  pageNo: number;
  totalPages: number;
}) {
  const config = PAPER_CONFIG[paperSize];
  const isA5Landscape = paperSize === 'a5-landscape';

  return (
    <div
      className="doc-page"
      style={{
        width: `${config.width}px`,
        minHeight: `${config.height}px`,
        background: 'var(--print-bg-paper)',
        boxShadow: printMode ? 'none' : 'var(--shadow-panel)',
        margin: '0 auto',
        padding: isA5Landscape ? '12px' : '16px',
        position: 'relative',
        pageBreakAfter: 'always',
      }}
    >
      {/* 公司抬头 */}
      <div
        style={{
          textAlign: 'center',
          fontSize: isA5Landscape ? '16px' : '20px',
          fontWeight: 700,
          padding: '8px 0',
          borderBottom: '2px solid var(--print-border-strong)',
          marginBottom: '8px',
        }}
      >
        {companyInfo.name} · 销货单
      </div>

      {/* 经营范围 */}
      <div
        style={{
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--print-text-tertiary)',
          marginBottom: '8px',
        }}
      >
        {companyInfo.businessScope}
      </div>

      {/* 公司联系方式 */}
      <div
        style={{
          fontSize: '11px',
          textAlign: 'center',
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--print-border-light)',
        }}
      >
        地址：{companyInfo.address} &nbsp;&nbsp; 电话：{companyInfo.phones.join(' / ')}
      </div>

      {/* 订单信息（一行） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          padding: '6px 0',
          borderBottom: '1px solid var(--print-border-light)',
        }}
      >
        <span>单号：{document.documentNo}</span>
        <span>日期：{new Date(document.createdAt).toLocaleDateString('zh-CN')}</span>
      </div>

      {/* 客户信息（一行） */}
      <div
        style={{
          fontSize: '12px',
          padding: '6px 0',
          borderBottom: '1px solid var(--print-border-light)',
        }}
      >
        客户：{document.customerName || '散客'} &nbsp;&nbsp;
        {document.customerPhone && `电话：${document.customerPhone} &nbsp;&nbsp;`}
        {document.deliveryAddress && `地址：${document.deliveryAddress}`}
      </div>

      {/* 表格区（七列） */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px',
          marginTop: '8px',
        }}
      >
        <thead>
          <tr>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '40px' }}>序号</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '200px', textAlign: 'left' }}>产品名称/规格</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '50px' }}>数量</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '50px' }}>单位</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '60px' }}>单价</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '70px' }}>金额</th>
            <th style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', width: '80px' }}>备注</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line.id || idx}>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'left' }}>
                {line.productRef || '—'}
                {line.brand?.name && <span style={{ color: 'var(--print-text-tertiary)', fontSize: '10px' }}> · {line.brand.name}</span>}
              </td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'center' }}>{line.qty || '—'}</td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'center' }}>{line.unit || '—'}</td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'center' }}>
                {line.unitPrice ? `¥${parseFloat(line.unitPrice).toFixed(2)}` : '—'}
              </td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', textAlign: 'center' }}>
                {line.amount ? `¥${parseFloat(line.amount).toFixed(2)}` : '—'}
              </td>
              <td style={{ border: '1px solid var(--print-border-strong)', padding: '4px 6px', fontSize: '9px' }}>{line.remark || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 页脚区 */}
      <div style={{ fontSize: '10px', marginTop: '8px', borderTop: '1px solid var(--print-border-strong)', paddingTop: '8px' }}>
        {/* 本页小计 + 总计 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span>
            <strong>本页小计：¥{subtotal.toFixed(2)}</strong>
          </span>
          {isLastPage && totalAmount > 0 && (
            <span>
              <strong>总计：¥{totalAmount.toFixed(2)}（大写：{numberToChinese(totalAmount)}）</strong>
            </span>
          )}
          {!isLastPage && <span style={{ fontSize: '9px', color: 'var(--print-text-tertiary)' }}>（共{totalPages}页，续下页）</span>}
        </div>

        {/* 温馨提示 + 签字栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
          <div style={{ fontSize: '9px', color: 'var(--print-text-tertiary)' }}>
            温馨提示：本销货单签字盖章具有法律效益，如有质量问题请在收货后48小时内提出。
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center' }}>
            <span>收货人签字：</span>
            <span
              style={{
                display: 'inline-block',
                width: '100px',
                borderBottom: '1px solid var(--print-border-strong)',
                marginLeft: '4px',
              }}
            ></span>
          </div>
        </div>

        {/* 页码 */}
        <div style={{ textAlign: 'center', padding: '4px 0', color: 'var(--print-text-tertiary)' }}>
          第{pageNo}页/共{totalPages}页
        </div>
      </div>
    </div>
  );
}

/**
 * 单据视图主组件
 */
export default function DocumentView({
  document,
  lines,
  paperSize = 'a4-portrait',
  printMode = false,
  companyInfo = DEFAULT_COMPANY_INFO,
}: DocumentViewProps) {
  const config = PAPER_CONFIG[paperSize];

  // 计算分页数据
  const pages = useMemo(() => {
    return calculatePages(lines, config.rowsPerPage);
  }, [lines, config.rowsPerPage]);

  // 计算总金额
  const totalAmount = useMemo(() => {
    return lines.reduce((sum, line) => {
      const amount = parseFloat(line.amount || '0');
      return sum + amount;
    }, 0);
  }, [lines]);

  return (
    <div
      className="document-view"
      data-shared-badge="C51"
      style={{
        background: printMode ? 'var(--print-bg-paper)' : 'var(--print-bg-subtle)',
        padding: printMode ? '0' : '24px',
      }}
    >
      {pages.map((page, idx) => (
        <DocumentPage
          key={idx}
          document={document}
          lines={page.lines}
          subtotal={page.subtotal}
          isLastPage={page.isLastPage}
          totalAmount={totalAmount}
          paperSize={paperSize}
          printMode={printMode}
          companyInfo={companyInfo}
          pageNo={idx + 1}
          totalPages={pages.length}
        />
      ))}
    </div>
  );
}