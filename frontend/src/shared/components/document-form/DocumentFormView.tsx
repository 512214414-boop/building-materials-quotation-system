/**
 * 单据视图渲染引擎
 * 根据模板类型分发渲染、集成工具栏、支持连续/单页预览模式
 */

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Button, Space, Segmented } from 'antd';
import {
  PrinterOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type {
  DocumentMeta,
  DocumentFormLine,
  DocumentFooter,
  DocumentHeader,
  TemplateKey,
  FormViewMode,
  CellClickEvent,
} from './types';
import { TEMPLATE_CONFIGS, DEFAULT_TEMPLATE, DEFAULT_VIEW_MODE, STORAGE_KEYS } from './constants';
import { useFormPagination } from './useFormPagination';
import { A5PortraitTemplate } from './A5PortraitTemplate';
import { A4PortraitTemplate } from './A4PortraitTemplate';
import { A5LandscapeTemplate } from './A5LandscapeTemplate';

// ═══════════════════════════════════════════════════════════════
// Props 定义
// ═══════════════════════════════════════════════════════════════

export interface DocumentFormViewProps {
  /** 单据元信息 */
  document: DocumentMeta;
  /** 数据行 */
  lines: DocumentFormLine[];
  /** 页脚信息 */
  footer: DocumentFooter;
  /** 抬头信息 */
  header?: DocumentHeader;
  /** 初始模板 */
  defaultTemplate?: TemplateKey;
  /** 初始浏览模式 */
  defaultViewMode?: FormViewMode;
  /** 是否可编辑 */
  editable?: boolean;
  /** 单元格点击回调 */
  onCellClick?: (e: CellClickEvent) => void;
  /** 打印回调 */
  onPrint?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// 样式常量
// ═══════════════════════════════════════════════════════════════

const CONTAINER_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-base-secondary)',
};

const TOOLBAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  background: 'var(--bg-base-default)',
  borderBottom: '1px solid var(--border-neutral-l1)',
  flexShrink: 0,
};

const CANVAS_STYLE: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '24px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const PAGE_WRAPPER_STYLE: CSSProperties = {
  marginBottom: 16,
};

// ═══════════════════════════════════════════════════════════════
// 组件实现
// ═══════════════════════════════════════════════════════════════

export function DocumentFormView({
  document,
  lines,
  footer,
  header,
  defaultTemplate,
  defaultViewMode,
  editable = false,
  onCellClick,
  onPrint,
}: DocumentFormViewProps) {
  // ═══════════════════════════════════════════════════════════════
  // 状态管理（localStorage 记忆）
  // ═══════════════════════════════════════════════════════════════

  const getStoredTemplate = (): TemplateKey => {
    if (defaultTemplate) return defaultTemplate;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.template);
      if (stored && stored in TEMPLATE_CONFIGS) {
        return stored as TemplateKey;
      }
    } catch {
      // ignore
    }
    return DEFAULT_TEMPLATE;
  };

  const getStoredViewMode = (): FormViewMode => {
    if (defaultViewMode) return defaultViewMode;
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.viewMode);
      if (stored === 'continuous' || stored === 'singlePage') {
        return stored;
      }
    } catch {
      // ignore
    }
    return DEFAULT_VIEW_MODE;
  };

  const [template, setTemplate] = useState<TemplateKey>(getStoredTemplate);
  const [viewMode, setViewMode] = useState<FormViewMode>(getStoredViewMode);
  const [currentPage, setCurrentPage] = useState(0);
  const [printPreview, setPrintPreview] = useState(false);

  // 保存用户偏好到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.template, template);
    } catch {
      // ignore
    }
  }, [template]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.viewMode, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  // ═══════════════════════════════════════════════════════════════
  // 分页逻辑
  // ═══════════════════════════════════════════════════════════════

  const config = TEMPLATE_CONFIGS[template];

  const { pages, totalPages } = useFormPagination({
    lines,
    config,
  });

  // 当前页索引校验
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  // ═══════════════════════════════════════════════════════════════
  // 回调处理
  // ═══════════════════════════════════════════════════════════════

  const handleCellClick = useCallback(
    (e: CellClickEvent) => {
      if (onCellClick) {
        onCellClick(e);
      }
    },
    [onCellClick],
  );

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
    } else {
      // 默认打印行为
      window.print();
    }
  }, [onPrint]);

  const handleSwitchTemplate = useCallback((t: TemplateKey) => {
    setTemplate(t);
  }, []);

  const handleSwitchViewMode = useCallback((m: FormViewMode) => {
    setViewMode(m);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // 模板分发渲染
  // ═══════════════════════════════════════════════════════════════

  const renderTemplate = (page: typeof pages[0]) => {
    const templateProps = {
      page,
      document,
      footer,
      header: header || {
        title: '采购清单',
        companyName: '建材报价系统',
        businessScope: '建材采购与配送',
        address: '重庆市',
        phones: ['023-12345678'],
      },
      editable: editable && !printPreview,
      onCellClick: handleCellClick,
    };

    switch (template) {
      case 'a4Portrait':
        return <A4PortraitTemplate {...templateProps} />;
      case 'a5Landscape':
        return <A5LandscapeTemplate {...templateProps} />;
      case 'a5Portrait':
      default:
        return <A5PortraitTemplate {...templateProps} />;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={CONTAINER_STYLE}>
      {/* ═══════════════════════════════════════════ */}
      {/* 工具栏（打印预览时隐藏）                      */}
      {/* ═══════════════════════════════════════════ */}
      {!printPreview && (
        <div style={TOOLBAR_STYLE}>
          {/* 左侧：模板切换 */}
          <Space>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>模板：</span>
            <Segmented
              size="small"
              value={template}
              onChange={(value) => handleSwitchTemplate(value as TemplateKey)}
              options={[
                { value: 'a5Portrait', label: 'A5 竖版' },
                { value: 'a4Portrait', label: 'A4 竖版' },
                { value: 'a5Landscape', label: 'A5 横版' },
              ]}
            />
          </Space>

          {/* 中间：浏览模式切换 */}
          <Space>
            <Segmented
              size="small"
              value={viewMode}
              onChange={(value) => handleSwitchViewMode(value as FormViewMode)}
              options={[
                {
                  value: 'continuous',
                  icon: <AppstoreOutlined />,
                  label: '连续',
                },
                {
                  value: 'singlePage',
                  icon: <FileTextOutlined />,
                  label: '单页',
                },
              ]}
            />
          </Space>

          {/* 右侧：打印操作 */}
          <Space>
            <Button
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => setPrintPreview(true)}
            >
              打印预览
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              打印
            </Button>
          </Space>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* 画布区域                                      */}
      {/* ═══════════════════════════════════════════ */}
      <div style={CANVAS_STYLE}>
        {/* 连续预览模式：多页垂直排列 */}
        {viewMode === 'continuous' && (
          <>
            {pages.map((page) => (
              <div key={page.pageIndex} style={PAGE_WRAPPER_STYLE}>
                {renderTemplate(page)}
              </div>
            ))}
          </>
        )}

        {/* 单页聚焦模式：当前页居中 + 翻页按钮 */}
        {viewMode === 'singlePage' && pages[currentPage] && (
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {/* 左翻页按钮 */}
            {currentPage > 0 && (
              <Button
                type="text"
                size="large"
                icon={<LeftOutlined />}
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                }}
                onClick={() => setCurrentPage(currentPage - 1)}
              />
            )}

            {/* 当前页 */}
            <div style={PAGE_WRAPPER_STYLE}>
              {renderTemplate(pages[currentPage])}
            </div>

            {/* 右翻页按钮 */}
            {currentPage < totalPages - 1 && (
              <Button
                type="text"
                size="large"
                icon={<RightOutlined />}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                }}
                onClick={() => setCurrentPage(currentPage + 1)}
              />
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 打印预览模式：退出按钮                        */}
      {/* ═══════════════════════════════════════════ */}
      {printPreview && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <Button
            type="primary"
            onClick={() => setPrintPreview(false)}
          >
            退出预览
          </Button>
        </div>
      )}
    </div>
  );
}

export default DocumentFormView;