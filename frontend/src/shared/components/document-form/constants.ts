/**
 * 单据模板常量配置
 * 硬编码尺寸、行容量、文案等
 */

import type { TemplateConfig, DocumentHeader, TemplateKey, FormViewMode } from './types';

/**
 * 三种单据模板配置
 * 基于96dpi像素尺寸计算
 */
export const TEMPLATE_CONFIGS: Record<TemplateKey, TemplateConfig> = {
  // A4 竖版：210mm × 297mm = 794px × 1123px @ 96dpi
  a4Portrait: {
    key: 'a4Portrait',
    name: 'A4 竖版',
    width: 794,
    height: 1123,
    rowCapacity: 26, // 约25-28行，取中间值
    rowHeight: 30,
    fontSize: 11,
    headerFontSize: 12,
    hasSidebar: false,
    hasSignatureArea: true,
  },
  
  // A5 横版：210mm × 148mm = 794px × 559px @ 96dpi
  a5Landscape: {
    key: 'a5Landscape',
    name: 'A5 横版',
    width: 794,
    height: 559,
    rowCapacity: 10, // 约10-12行
    rowHeight: 28,
    fontSize: 10,
    headerFontSize: 11,
    hasSidebar: true,
    hasSignatureArea: true,
  },
  
  // A5 竖版：148mm × 210mm = 559px × 794px @ 96dpi
  a5Portrait: {
    key: 'a5Portrait',
    name: 'A5 竖版',
    width: 559,
    height: 794,
    rowCapacity: 17, // 约16-18行
    rowHeight: 28,
    fontSize: 10,
    headerFontSize: 11,
    hasSidebar: false,
    hasSignatureArea: true,
  },
};

/**
 * 默认公司信息（硬编码）
 */
export const DEFAULT_COMPANY_HEADER: DocumentHeader = {
  title: '销货单',
  companyName: '重庆鸿翔建材配送中心',
  businessScope: '管材管件、电线电缆、开关插座、油漆涂料、五金工具、水暖卫浴、灯具照明',
  address: '重庆市xx区xx路xx号',
  phones: ['023-12345678', '138xxxx8888'],
};

/**
 * 温馨提示文案
 */
export const TIP_TEXT = '温馨提示：本销货单签字盖章具有法律效益，如有质量问题请在收货后48小时内提出。';

/**
 * 单据表格列定义（七列）
 */
export const TABLE_COLUMNS = [
  { key: 'seq', label: '序', width: 28 },
  { key: 'productRef', label: '产品名称/规格', width: 'auto' },
  { key: 'qty', label: '数量', width: 32 },
  { key: 'unit', label: '单位', width: 28 },
  { key: 'price', label: '单价', width: 40 },
  { key: 'amount', label: '金额', width: 48 },
  { key: 'remark', label: '备注', width: 60 },
] as const;

/**
 * 纸张尺寸映射（用于打印）
 */
export const PAPER_SIZE_MAP: Record<TemplateKey, string> = {
  a4Portrait: 'A4 portrait',
  a5Landscape: 'A5 landscape',
  a5Portrait: 'A5 portrait',
};

/**
 * 默认模板选择（A5竖版最常用）
 */
export const DEFAULT_TEMPLATE: TemplateKey = 'a5Portrait';

/**
 * 默认浏览模式
 */
export const DEFAULT_VIEW_MODE: FormViewMode = 'continuous';

/**
 * localStorage 键名
 */
export const STORAGE_KEYS = {
  template: 'document-form-template',
  viewMode: 'document-form-viewMode',
} as const;