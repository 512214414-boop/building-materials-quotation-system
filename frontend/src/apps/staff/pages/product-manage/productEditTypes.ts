// 产品编辑弹窗表单类型（容器与区块共享，状态仍在容器）
/** 单位项（挂 SPU，所有品牌共享，v9.0：换算率移至 BrandItem.conversions） */
export interface UnitItem {
  rowKey: string;
  /** 编辑时已有单位 ID（BigInt 序列化 string） */
  id?: string;
  unitName: string;
  isBase: boolean;
  isDisplay: boolean;
}

/** 图片项（依附品牌；v11.0 生产级：多版本 + 元数据） */
export interface ImageItem {
  rowKey: string;
  /** 编辑时已有图片 ID */
  id?: string;
  /** 主图 URL（原图 1280px，详情页用） */
  imageUrl: string;
  /** v11.0：中图 URL（600x600，编辑弹窗用） */
  mediumUrl?: string;
  /** v11.0：缩略图 URL（200x200，列表卡片用） */
  thumbnailUrl?: string;
  /** v11.0：原图宽（px） */
  width?: number;
  /** v11.0：原图高（px） */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash?: string;
  sortOrder: number;
  /** 是否主图 */
  isMain: boolean;
}

/** 品牌项（v14.0：全局档案引用，通过 spec_brand 中间表挂规格；v9.0：新增 conversions） */
export interface BrandItem {
  rowKey: string;
  /** 编辑时已有品牌关联 ID（spec_brand.id，规格内品牌关联的唯一键） */
  id?: string;
  /** v14.2：全局品牌档案 ID（brand.id，name 唯一）——选择复用/快捷新建/失焦解析后显式绑定 */
  brandId?: string;
  name: string;
  images: ImageItem[];
  /** v9.0：品牌单位换算率（key=unitRowKey, value=conversionRate 字符串） */
  conversions: Record<string, string>;
}
