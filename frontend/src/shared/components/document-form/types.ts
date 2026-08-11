/**
 * 单据视图类型定义
 * 用于采购清单等单据的真实纸张视图
 */

// 单据模板类型
export type TemplateKey = 'a4Portrait' | 'a5Landscape' | 'a5Portrait';

// 浏览模式
export type FormViewMode = 'continuous' | 'singlePage';

// 单据行数据（用于分页后）
export interface DocumentFormLine {
  id: string;
  seq: number; // 全局序号
  isEmpty: boolean; // 是否为空白行
  productRef?: string; // 产品名称+规格+品牌
  productId?: string;
  brandId?: string;
  unitId?: string;
  qty?: number;
  unit?: string;
  price?: number;
  amount?: number;
  remark?: string;
}

// 单据页数据
export interface DocumentFormPage {
  pageIndex: number; // 从0开始
  totalPages: number;
  lines: DocumentFormLine[];
  subtotal: number; // 本页小计
  isLastPage: boolean;
}

// 单据抬头信息
export interface DocumentHeader {
  title: string; // 单据标题（如"销货单"）
  companyName: string; // 公司名称
  businessScope: string; // 经营范围
  address: string; // 公司地址
  phones: string[]; // 公司电话
}

// 单据订单信息
export interface DocumentMeta {
  documentNo: string; // 单号
  customerName: string; // 客户名称
  customerPhone?: string; // 客户电话
  customerAddress?: string; // 客户地址
  date: string; // 日期
  remark?: string; // 备注
}

// 单据页脚信息
export interface DocumentFooter {
  total: number; // 总计金额
  totalChinese: string; // 大写金额
  creatorName: string; // 制单人
  tip?: string; // 温馨提示
}

// 模板配置
export interface TemplateConfig {
  key: TemplateKey;
  name: string;
  width: number; // px
  height: number; // px
  rowCapacity: number; // 数据行容量
  rowHeight: number; // 数据行高度
  fontSize: number; // 数据行字体大小
  headerFontSize: number; // 表头字体大小
  hasSidebar?: boolean; // 是否有侧边栏（A5横版）
  hasSignatureArea?: boolean; // 是否有签字栏
}

// 单据单元格点击事件
export interface CellClickEvent {
  lineId: string;
  field: 'productRef' | 'qty' | 'unit' | 'price' | 'remark';
  value: any;
  isEmpty: boolean;
}