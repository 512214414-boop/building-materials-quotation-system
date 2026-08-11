/**
 * 单据打印预览页面
 *
 * 功能:
 * 1. 视图切换: 单据视图 / 表格视图
 * 2. 纸张切换: A4竖版 / A5横版 / A5竖版
 * 3. 浏览模式: 连续预览 / 单页聚焦
 * 4. 打印预览: 纯净纸张模式
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Radio, Space, Spin } from 'antd';
import { PrinterOutlined, FileTextOutlined, TableOutlined } from '@ant-design/icons';
import DsButton from '../../../shared/components/DsButton.js';
import DocumentView, { type PaperSize } from '../../../shared/components/DocumentView.js';
import { useDocumentStore } from '../../../shared/stores/document.js';
import { listLines, type StaffDocumentLine } from '../../../shared/services/api/documentApi.js';

type ViewMode = 'document' | 'table';

export default function DocumentPrintView() {
  const { documentId } = useParams<{ documentId: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>('document');
  const [paperSize, setPaperSize] = useState<PaperSize>('a4-portrait');
  const [printMode, setPrintMode] = useState(false);

  const { activeDocument, open, loading } = useDocumentStore();
  const [lines, setLines] = useState<StaffDocumentLine[]>([]);

  // 加载单据数据
  useEffect(() => {
    if (documentId && !activeDocument) {
      open(documentId);
    }
  }, [documentId, activeDocument, open]);

  // 加载单据行数据
  useEffect(() => {
    if (documentId) {
      listLines(documentId).then(setLines).catch(console.error);
    }
  }, [documentId]);

  // 打印功能
  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setPrintMode(false);
    }, 100);
  };

  // 如果没有数据,显示加载状态
  if (!activeDocument || loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  // v11.0 解耦：使用 customerName/customerPhone 快照字段
  const customerName = activeDocument.customerName ?? undefined;
  const customerPhone = activeDocument.customerPhone ?? undefined;

  return (
    <div className="document-print-view">
      {/* 控制栏 */}
      {!printMode && (
        <div
          style={{
            padding: '16px 24px',
            background: 'var(--bg-base-secondary)',
            borderBottom: '1px solid var(--border-neutral-l2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* 视图切换 */}
          <Space>
            <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <Radio.Button value="document">
                <FileTextOutlined /> 单据视图
              </Radio.Button>
              <Radio.Button value="table">
                <TableOutlined /> 表格视图
              </Radio.Button>
            </Radio.Group>

            {viewMode === 'document' && (
              <Radio.Group value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
                <Radio.Button value="a4-portrait">A4 竖版</Radio.Button>
                <Radio.Button value="a5-landscape">A5 横版</Radio.Button>
                <Radio.Button value="a5-portrait">A5 竖版</Radio.Button>
              </Radio.Group>
            )}
          </Space>

          {/* 打印按钮 */}
          <DsButton variant="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            打印预览
          </DsButton>
        </div>
      )}

      {/* 内容区 */}
      <div className="content-area">
        {viewMode === 'document' ? (
          <DocumentView
            document={{
              id: activeDocument.id,
              documentNo: activeDocument.documentNo,
              createdAt: activeDocument.createdAt,
              status: activeDocument.status,
              customerName: customerName,
              customerPhone: customerPhone,
              deliveryAddress: activeDocument.deliveryAddress ?? undefined,
            }}
            lines={lines}
            paperSize={paperSize}
            printMode={printMode}
          />
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            表格视图功能开发中...
          </div>
        )}
      </div>

      {/* 打印样式 — @media print 中 !important 是覆盖屏幕样式的标准做法 */}
      <style>{`
        @media print {
          .document-print-view > div:first-child {
            display: none !important;
          }
          .document-print-view {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}