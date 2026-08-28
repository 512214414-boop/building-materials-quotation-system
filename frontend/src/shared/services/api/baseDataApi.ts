// v9.0 基础数据管理 API（SPU 合并 + 品牌单字段 + 单位挂 SPU + 价格分表 + SKU 检索宽表）
//
// v9.0 设计原则（根本性重构）：
//   1. SPU 合并：product 表含 name + specModel（产品名称+规格型号合并为一条 SPU 记录）
//      移除 spec 表、brand_spec_rel 表（规格已并入 SPU，无需关联表）
//   2. 品牌单字段：brand（brandName+seriesName 合并为单字段 name）
//      同一品牌的不同系列视为不同 SPU（价格单位可能不同）
//   3. 单位挂 SPU：unit.productId（单位从属于 SPU）
//      isBase / isDisplay 在单位表（Boolean 标记，同一 SPU 各有且仅有一个）
//      换算率从 unit 表移至 brand_unit_conversion 中间表（brandId, unitId, conversionRate）
//   4. SKU = SPU + 品牌 + 单位：三者组合唯一确定（无 specId）
//      sale_price: @@unique([brandId, unitId, priceType])
//      purchase_price: @@unique([brandId, unitId, supplierId])
//   5. 价格分表存储：sale_price（售价，priceType 字符串）+ purchase_price（进价，supplierId 外键 + isDefault）
//   6. SKU 检索宽表：product_sku_search 扁平宽表，含 specModel + 品牌优先排序
//   7. 产品归属分类：v15.3 统一引用类语义——分类空输入由后端按 name ensure「未分类」真实记录（存在复用/不存在新建）
//   8. 图片依附品牌：product_image.brandId → brand.id
//
// v9.0 相对 v8.0 的变化：
//   - unit.conversionRate 移除 → 新增 brand_unit_conversion 中间表（brandId, unitId, conversionRate）
//   - purchase_price.supplierName 字符串 → supplierId BigInt 外键 + isDefault Boolean
//   - suppliers 表 → supplier 表（新结构：id, name, contacts JSON, businessScope, address, remark, status）
//   - SkuOptionUnit 移除 conversionRate → SkuOptionResult 新增 conversions 数组
//   - SkuOptionUnit.purchasePrices 新增 supplierId + isDefault
//   - SaveProductInput.brands 新增 conversions，purchasePrices 用 supplierId
//   - SuggestField 新增 'supplier'
//
// 路由（员工端 /api/staff/...）：
//   - /staff/categories（分类，扁平结构）
//   - /staff/products（产品 SPU = name + specModel）+ /staff/products/search + /staff/products/sku/options + /staff/products/suggest
//   - /staff/products/save + /staff/products/quick-create + /staff/products/convert-qty
//   - /staff/brands（品牌，单字段 name）
//   - /staff/units（单位，挂 SPU，isBase/isDisplay）+ /staff/units/:id/base + /staff/units/:id/display
//   - /staff/sale-prices（销售价，priceType 字符串）
//   - /staff/purchase-prices（进价，supplierId 外键 + isDefault）
//   - /staff/product-images（产品图片，依附品牌）
//   - /staff/suppliers（供应商档案，新结构：id, name, contacts, businessScope, address, remark, status）
//   - /staff/customers（客户档案，保留）
// 公开端：
//   - /api/categories（公开分类列表）
//   - /api/products/search（公开产品搜索，剥离进价）
//   - /api/products/sku/options（公开 SKU 选项，剥离进价）
//   - /api/products/suggest（公开输入框检索）
//
// serialize 规则（后端 response.ts）：
//   - snake_case → camelCase（product_name → productName）
//   - _count → count（剥离前导下划线后再转 camelCase）
//   - BigInt → string
//   - Decimal → string（通过 toJSON）
//   - Date 保持原样（JSON.stringify 转 ISO 字符串）
//   - 显式 .toNumber() 转换的 Decimal 在响应中为 number（如 SkuSearchRow.retailPrice）

import request from '../request.js';
import type { PaginationResult } from '../request.js';

// v1.5.6.3 快速建档默认值（与后端 productService.DEFAULT_SPEC_MODEL / DEFAULT_UNIT_NAME 双端一致）
//   用户「边用边录真正必填只有产品名称，空值补默认」指令：
//   - 规格型号空 → 「通用」；单位空 → 「件」；分类空 → 后端按 name ensure「未分类」记录
//   前端与后端同口径补默认，禁止只改一端
export const DEFAULT_SPEC_MODEL = '通用';
export const DEFAULT_UNIT_NAME = '件';

// ============================================================
// §1 视图类型（camelCase，与后端 serialize 后结构对齐）
// ============================================================

/**
 * 分类视图（v8.0：扁平结构，无 parentId/parent/children）。
 * 与后端 category 表 serialize 后结构对齐。
 * listCategories / getCategory 返回时携带 count.products。
 */
export interface CategoryView {
  id: number;
  name: string;
  sortOrder: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  /** 关联产品数（listCategories / getCategory 返回时携带） */
  count?: { products: number };
}

/**
 * v14.0 产品主体视图（product 表纯产品名 + spec 规格变体）。
 * 产品 → 规格变体 → 品牌/单位 三级层级：
 *   - product 只存产品名（如「PPR热水管」），规格型号在 spec 表
 *   - 同一产品多个规格（specs），每个规格的品牌/单位独立
 * categoryId 为有效分类记录 id：分类空输入时由后端按 name ensure「未分类」记录（存在复用/不存在新建）。
 */
export interface ProductView {
  /** BigInt 序列化为 string */
  id: string;
  name: string;
  /** 分类 ID（有效记录 id；「未分类」按 name 解析，无 0 魔数） */
  categoryId: number;
  /** v8.0：备注信息（别名、俗称，如「6分管」） */
  remark: string;
  /** 状态 1上架 0下架 */
  status: number;
  createdAt: string;
  updatedAt: string;
  /** 关联分类（list/get/create/update 返回时携带） */
  category?: { id: number; name: string; sortOrder: number; status: number } | null;
  /** v14.0：规格变体列表（getProduct 详情返回时携带，含每个规格的品牌/单位/价格） */
  specs?: SpecView[];
  /** v14.0：关联计数（list 返回时携带：{ specs }） */
  count?: { specs: number };
  /** v14.0：当前编辑规格 ID（getProduct 详情返回时携带，取首个规格） */
  specId?: string;
  /** v14.0：当前编辑规格型号（getProduct 详情返回时携带，取首个规格） */
  specModel?: string;
  /** v22.0：产品售卖品牌列表（product_brand，弹窗品牌 tab） */
  productBrands?: ProductBrandView[];
  /** v22.0：同 specModel 下各品牌行（getProduct 详情；API 仍暴露 specBrandId = spec.id） */
  brands?: BrandView[];
  /** v14.0：当前规格的单位列表（getProduct 详情返回时携带） */
  units?: UnitView[];
  /**
   * v14.0：当前规格下所有售价（getProduct 详情返回时携带）。
   * 一次性返回当前规格所有品牌关联下的 sale_prices，用于品牌×单位价格矩阵反填。
   */
  salePrices?: SalePriceView[];
  /**
   * v14.0：当前规格下所有进价（getProduct 详情返回时携带）。
   * 一次性返回当前规格所有品牌关联下的 purchase_prices，用于品牌×单位价格矩阵反填。
   */
  purchasePrices?: PurchasePriceView[];
}

/**
 * v22.0 规格变体视图（spec 表：产品 → 品牌 → 系列/规格）。
 * 每条 spec 已含 brandId；同 specModel 跨品牌为多条 spec。
 */
export interface SpecView {
  /** BigInt 序列化为 string */
  id: string;
  /** 所属产品 ID */
  productId: string;
  /** 系列/规格（如「dn25*3.5」「25」「4分」） */
  specModel: string;
  /** 同 specModel 下品牌行数（getProduct specs 摘要） */
  count?: { brands: number; units: number };
}

/** v22.0 产品×品牌关联（product_brand 表） */
export interface ProductBrandView {
  id: string;
  brandId: string;
  sortOrder: number;
  status: number;
  brand?: { id: string; name: string; status: number };
}

/**
 * v22.0 品牌行视图（spec 表一行 = 产品×品牌×系列/规格）。
 * API 兼容：id / specBrandId 均为 spec.id；brandId 为全局品牌档案。
 */
export interface BrandView {
  /** spec.id（API 别名 specBrandId，兼容旧调用方） */
  id: string;
  /** 全局品牌档案 ID（BigInt 序列化为 string） */
  brandId: string;
  /** 所属规格 ID（= id） */
  specId: string;
  /** 品牌名称（来自全局品牌档案 brand.name） */
  name: string;
  /** 该规格备注（执行标准/层数等，存 spec.remark） */
  remark: string;
  sortOrder: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  /** 关联品牌档案（getBrand/list 返回时携带） */
  brand?: { id: string; name: string; status: number };
  /** 图片列表（依附 spec） */
  images?: ProductImageView[];
  /** v9.0：规格×品牌单位换算列表（brand_unit_conversion 中间表） */
  conversions?: BrandConversion[];
  /**
   * v14.2 修正：listBrands/getBrand 返回的是全局品牌档案（brand 表）视图，
   * 关联计数 = specBrands（被多少规格×品牌引用），非 spec_brand 维度的价格/图片数
   */
  count?: {
    specBrands: number;
  };
}

/**
 * v14.0 单位视图（unit 表，isBase/isDisplay）。
 * 从属于规格变体（unit.specId）。
 * 换算率已移至 brand_unit_conversion 中间表（specBrandId, unitId, conversionRate），不再在 unit 表上。
 * isBase：同一规格有且仅有一个基础单位（库存核算基准）。
 * isDisplay：同一规格有且仅有一个默认显示单位（列表默认展示；无则取基础单位）。
 * @@unique([specId, unitName]) 同一规格下单位名不重复。
 */
export interface UnitView {
  /** BigInt 序列化为 string */
  id: string;
  /** v14.0：所属规格变体（原 productId 改 specId） */
  specId: string;
  unitName: string;
  /** v9.0：是否基础单位（同一规格有且仅有一个 true，库存核算基准） */
  isBase: boolean;
  /** v9.0：是否默认显示单位（同一规格有且仅有一个 true，列表默认展示；无则取基础单位） */
  isDisplay: boolean;
  /** 状态 1启用 0禁用（软删除） */
  status: number;
  createdAt: string;
  /** 关联规格（list/get 返回时携带） */
  spec?: {
    id: string;
    specModel: string;
    product?: { id: string; name: string; categoryId: number };
  };
  /** 关联计数（list 返回时携带） */
  count?: {
    salePrices: number;
    purchasePrices: number;
  };
}

/**
 * v14.0 销售价视图（sale_price 表，specBrandId 维度）。
 * priceTypeId 为 BigInt 外键，关联 price_type 字典表（全局共享）。
 * 唯一约束：@@unique([specBrandId, unitId, priceTypeId])
 * v9.1：新增 isDefault 字段，与 purchase_price.isDefault 对等
 *   - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
 *   - 列表"售价"列默认显示 isDefault=true 的价格
 * v9.2：priceType 字符串字段已删除，改为 priceTypeId 外键 + priceType 关联对象
 */
export interface SalePriceView {
  /** BigInt 序列化为 string */
  id: string;
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  /** v14.0：全局品牌 ID（BigInt 序列化为 string，冗余展示用） */
  brandId?: string;
  /** BigInt 序列化为 string */
  unitId: string;
  /** v9.2：价格类型字典 ID（BigInt 序列化为 string，关联 price_type.id） */
  priceTypeId: string;
  /** 售价（Decimal 序列化为 string） */
  price: string;
  status: number;
  /** v9.1：是否默认展示售价（同 SKU 下互斥，与 purchase_price.isDefault 对等） */
  isDefault: boolean;
  /** 点位：规格例外 → 组默认 → 1 */
  point?: number | null;
  /** 实际售价 = 面价 × 点位 */
  effectivePrice?: number | null;
  /** 点位来自规格例外 */
  specPoint?: boolean;
  /** 关联规格×品牌（list/get 返回时携带） */
  specBrand?: {
    id: string;
    specId: string;
    brandId: string;
    brand?: { name: string };
  };
  /** 关联单位（list/get 返回时携带） */
  unit?: { id: string; unitName: string; specId: string };
  /** v9.2：关联价格类型字典对象（getProduct 详情返回时携带） */
  priceType?: { id: string; name: string };
}

/**
 * v9.2 价格类型字典视图（price_type 表，全局共享）。
 * 所有产品售价矩阵按字典展开。
 * 唯一约束：name 全局唯一。
 * status 1启用 0停用。
 */
export interface PriceTypeView {
  /** BigInt 序列化为 string */
  id: string;
  name: string;
  sortOrder: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  /** 关联计数（list 返回时携带：{ salePrices }） */
  count?: { salePrices: number };
}

/** v9.2 价格类型字典创建入参 */
export interface CreatePriceTypeInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

/** v9.2 价格类型字典更新入参 */
export interface UpdatePriceTypeInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

/**
 * v14.0 进价视图（purchase_price 表，specBrandId 维度）。
 * supplierId 为 BigInt 外键指向 supplier 表，supplierName 通过关联获取。
 * isDefault 标记该供应商是否为该 SKU 的默认供应商。
 * 唯一约束：@@unique([specBrandId, unitId, supplierId])
 * 公开端 isStaff=false 时被剥离。
 */
export interface PurchasePriceView {
  /** BigInt 序列化为 string */
  id: string;
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  /** v14.0：全局品牌 ID（BigInt 序列化为 string，冗余展示用） */
  brandId?: string;
  /** BigInt 序列化为 string */
  unitId: string;
  /** v9.0：供应商 ID 外键（BigInt 序列化为 string） */
  supplierId: string;
  /** v9.0：供应商名称（通过 supplierId 关联 supplier 表获取） */
  supplierName: string;
  /** v9.0：是否默认供应商 */
  isDefault: boolean;
  /** 进价（Decimal 序列化为 string；v12.0：语义为「面价」，录入值） */
  price: string;
  status: number;
  /** v12.0：该组点位（来自 supplier_point_rule，无规则默认 1） */
  point?: number | null;
  /** v12.0：进价 = 面价 × 点位（无点位规则时 = 面价） */
  effectivePrice?: number | null;
  /** 点位来自规格例外 */
  specPoint?: boolean;
  /** 关联规格×品牌（list/get 返回时携带） */
  specBrand?: {
    id: string;
    brand?: { name: string };
    spec?: {
      specModel: string;
      product?: { id: string; name: string; categoryId: number; category?: { name: string } };
    };
  };
  /** 关联单位（list/get 返回时携带） */
  unit?: { id: string; unitName: string; specId: string };
  /** v9.0：关联供应商（list/get 返回时携带） */
  supplier?: { id: string; name: string };
}

/**
 * v14.0 产品图片视图（product_image 表，依附规格×品牌 spec_brand）。
 * 一个规格×品牌可有多个图片，其中一张为主图（isMain=1）。
 */
export interface ProductImageView {
  /** BigInt 序列化为 string */
  id: string;
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  /** 主图 URL（原图 maxSize 1280，详情页用） */
  imageUrl: string;
  /** v11.0：中图 URL（600x600，编辑弹窗用） */
  mediumUrl: string;
  /** v11.0：缩略图 URL（200x200，列表卡片用） */
  thumbnailUrl: string;
  /** v11.0：原图宽（px） */
  width: number;
  /** v11.0：原图高（px） */
  height: number;
  /** v11.0：原图字节数 */
  size: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash: string;
  sortOrder: number;
  /** 是否主图 1是 0否 */
  isMain: number;
  createdAt: string;
}

/**
 * v9.0 供应商视图（supplier 表，新结构）。
 * suppliers 归属单据体系，不在产品数据层 7 张表内，但保留 API。
 * contacts 为 JSON 数组，每个元素包含 name/phone/role。
 */
/** 供应商联系信息（数组，一人可多条方式）：联系人 + 方式 + 联系方式
 * 例：{ name: '王小二', method: '微信', value: 'gshhbdnd' } / { name: '李大翠', method: '电话', value: '15364768585' } */
export interface SupplierContact {
  /** 联系人 */
  name: string;
  /** 联系方式（微信/电话/座机/邮箱等） */
  method: string;
  /** 具体联系方式 */
  value: string;
  /** 是否默认联系人（同构多记录字段统一模型：每条可标记默认；用户未指定时按第一条） */
  isDefault?: boolean;
}

export interface SupplierView {
  id: string;
  name: string;
  contacts: SupplierContact[] | null;
  /** 多地址（v20 拆表） */
  addresses?: SupplierAddressView[];
  /** 经营品类（v20 拆表，关联 category） */
  businessCategories?: { categoryId: number; categoryName: string }[];
  /** 经营品牌（v21 拆表，关联 brand） */
  businessBrands?: { brandId: string; brandName: string }[];
  /** 兼容展示：品类名 + 品牌名拼接 */
  businessScope: string | null;
  address: string | null;
  remark: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
  count?: { purchasePrices: number };
}

export interface SupplierAddressView {
  id?: string;
  addressTypeId?: string | null;
  addressTypeName?: string | null;
  addressText: string;
  lng?: number | null;
  lat?: number | null;
  coordSource?: 'geocoded' | 'manual' | null;
  isDefault?: boolean;
  sortOrder?: number;
  remark?: string | null;
}

/**
 * 联系方式方式字典视图（v1.7.1.5 新增，对齐 price_type 全局字典范式）。
 * 供应商联系信息 contacts[].method 使用本字典的值（微信/电话/邮箱/QQ…），
 * 全局共享、可自由维护（自由输入新增 + 已有值点选），name 唯一。
 */
export interface ContactMethodView {
  /** BigInt 序列化为 string */
  id: string;
  name: string;
  sortOrder: number;
  /** 状态 1启用 0禁用 */
  status: number;
  createdAt: string;
  updatedAt: string;
}

/** 联系方式方式字典创建入参 */
export interface CreateContactMethodInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

/** 联系方式方式字典更新入参 */
export interface UpdateContactMethodInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

export interface CustomerContactView {
  id?: string;
  name: string;
  method: string;
  value: string;
  isDefault?: boolean;
}

export interface CustomerInvoiceRow {
  id?: string;
  invoiceTitle?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccount?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
}

/** 客户类型字典名称 */
export type CustomerType = string;

/** v2.9 开票信息 JSON 结构（历史兼容；现网以 customer_invoice 多行为准） */
export interface CustomerInvoiceInfo {
  taxNumber?: string;
  invoiceTitle?: string;
  bankName?: string;
  bankAccount?: string;
  address?: string;
  phone?: string;
}

/**
 * 客户视图（与后端 customers 表 serialize 后结构对齐）。
 * listCustomers 返回时包含 count.customerAddresses。
 */
export interface CustomerView {
  id: string;
  phone: string | null;
  name: string | null;
  wechat: string | null;
  company: string | null;
  note: string | null;
  status: string;
  customerType: string;
  /** Decimal(5,2)，serialize 后为 string。默认折扣率（0-100，100=不打折） */
  discountRate: string;
  /** 开票信息 JSON（历史兼容） */
  invoiceInfo: CustomerInvoiceInfo | null;
  contacts?: CustomerContactView[];
  invoices?: CustomerInvoiceRow[];
  createdAt: string;
  updatedAt: string;
  /** 关联子表数（仅 listCustomers 返回时携带） */
  count?: { customerAddresses: number; contacts?: number; invoices?: number } | number;
}

/**
 * v9.4 客户地址视图（与后端 customer_addresses 表 serialize 后结构对齐）。
 * 用于客户管理下钻式子表（DrillState level 2）行内编辑。
 */
export interface CustomerAddressView {
  /** BigInt 序列化为 string */
  id: string;
  /** BigInt 序列化为 string，所属客户 ID */
  customerId: string;
  /** 地址标签（如「家」「公司」「工地」） */
  label: string | null;
  /** 联系人姓名 */
  contact: string;
  /** 联系人电话 */
  phone: string;
  /** 省 */
  province: string | null;
  /** 市 */
  city: string | null;
  /** 区/县 */
  district: string | null;
  /** 详细地址 */
  detail: string;
  /** 是否默认地址（同一客户下有且仅有一个 true） */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// §2 输入类型
// ============================================================

// --- 分类（v8.0：扁平结构，无 parentId） ---
export interface CreateCategoryInput {
  name: string;
  sortOrder?: number;
  status?: number;
}
export interface UpdateCategoryInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

// --- 产品主体（v14.0：纯产品名 + 规格变体在 spec 表） ---
export interface CreateProductInput {
  name: string;
  /** v14.0：规格型号（可空，创建产品时一并创建首个规格；后端补默认「通用」） */
  specModel?: string;
  /** 分类 ID（有效记录 id；「未分类」按 name 解析，无 0 魔数） */
  categoryId?: number;
  /** v8.0：备注信息 */
  remark?: string;
  status?: number;
}
export interface UpdateProductInput {
  name?: string;
  categoryId?: number;
  remark?: string;
  status?: number;
}

// --- 品牌（v14.0：全局档案，name 唯一，无 productId） ---
export interface CreateBrandInput {
  /** v14.0：品牌名称（全局唯一） */
  name: string;
  status?: number;
}
export interface UpdateBrandInput {
  name?: string;
  status?: number;
}

// --- 单位（v14.0：挂规格，isBase/isDisplay，换算率移至 brand_unit_conversion） ---
export interface CreateUnitInput {
  /** v14.0：所属规格变体（BigInt 序列化为 string） */
  specId: string;
  unitName: string;
  status?: number;
  /** v9.0：是否设为该规格基础单位（互斥） */
  isBase?: boolean;
  /** v9.0：是否设为该规格默认显示单位（互斥） */
  isDisplay?: boolean;
  /** v1.9：目标规格×品牌关联（空行新增时换算率一次录入；未指定则所有品牌关联换算率默认 1） */
  specBrandId?: string;
  /** v1.9：目标规格×品牌换算率（仅 specBrandId 指定时生效；基础单位恒为 1） */
  conversionRate?: number;
}
export interface UpdateUnitInput {
  unitName?: string;
  status?: number;
  /** v9.0：可切换基础单位标记 */
  isBase?: boolean;
  /** v9.0：可切换默认显示单位标记 */
  isDisplay?: boolean;
}

// --- 销售价（v14.0：SKU = specBrand + unit，priceTypeId 外键 + isDefault 默认标记） ---
export interface CreateSalePriceInput {
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  /** BigInt 序列化为 string */
  unitId: string;
  /** v9.2：价格类型字典 ID（BigInt 序列化为 string，关联 price_type.id） */
  priceTypeId: string;
  /** 售价 */
  price: number | string;
  /** v9.1：是否默认展示售价（同 SKU 下互斥，与 purchase_price.isDefault 对等） */
  isDefault?: boolean;
  status?: number;
}
export interface UpdateSalePriceInput {
  price?: number | string;
  /** 这条售价换绑价格类型（不改全局类型名） */
  priceTypeId?: string;
  /** v9.1：可切换默认售价标记（同 SKU 下互斥） */
  isDefault?: boolean;
  status?: number;
}

// --- 进价（v14.0：SKU = specBrand + unit，supplierId 外键 + isDefault） ---
export interface CreatePurchasePriceInput {
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  /** BigInt 序列化为 string */
  unitId: string;
  /** v9.0：供应商 ID 外键（BigInt 序列化为 string） */
  supplierId: string;
  /** v9.0：是否默认供应商 */
  isDefault?: boolean;
  /** 进价 */
  price: number | string;
  status?: number;
}
export interface UpdatePurchasePriceInput {
  price?: number | string;
  /** 这条进价换绑供应商（不改全局供应商名） */
  supplierId?: string;
  isDefault?: boolean;
  status?: number;
}

// --- 产品图片（v14.0：依附规格×品牌；v11.0 生产级重构：多版本 + 元数据） ---
export interface CreateProductImageInput {
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string） */
  specBrandId: string;
  imageUrl: string;
  /** v11.0：中图 URL */
  mediumUrl?: string;
  /** v11.0：缩略图 URL */
  thumbnailUrl?: string;
  /** v11.0：原图宽 */
  width?: number;
  /** v11.0：原图高 */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 hash */
  hash?: string;
  sortOrder?: number;
  /** 是否主图 1是 0否 */
  isMain?: number;
}
export interface UpdateProductImageInput {
  imageUrl?: string;
  sortOrder?: number;
  isMain?: number;
}

// --- 产品建档/编辑事务输入（saveProduct，v9.0） ---
export interface ProductUnitInput {
  /** 编辑时传入已有单位 ID（BigInt 序列化为 string） */
  id?: string;
  unitName: string;
  isBase?: boolean;
  isDisplay?: boolean;
  status?: number;
}

/** v9.0 品牌单位换算输入（brand_unit_conversion 中间表） */
export interface BrandConversionInput {
  /** units 数组中的索引 */
  unitIdx: number;
  /** 换算率（基础单位强制为 1） */
  conversionRate: number | string;
}

export interface ProductImageInput {
  imageUrl: string;
  /** v11.0：中图 URL（编辑弹窗用） */
  mediumUrl?: string;
  /** v11.0：缩略图 URL（列表卡片用） */
  thumbnailUrl?: string;
  /** v11.0：原图宽 */
  width?: number;
  /** v11.0：原图高 */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash?: string;
  sortOrder?: number;
  isMain?: number;
}

export interface ProductBrandInput {
  /** v14.0：编辑时传入已有 spec_brand 关联 ID（BigInt 序列化为 string），新建关联时为空 */
  id?: string;
  /** v14.0：品牌名称（全局品牌档案 name，输入档案中不存在 → 快捷新增） */
  name: string;
  sortOrder?: number;
  status?: number;
  /** 图片列表（依附规格×品牌） */
  images?: ProductImageInput[];
  /** v9.0：规格×品牌单位换算列表（brand_unit_conversion 中间表） */
  conversions?: BrandConversionInput[];
}

export interface ProductSalePriceInput {
  /** brands 数组中的索引 */
  brandIdx: number;
  /** units 数组中的索引 */
  unitIdx: number;
  /**
   * v13.1 价格类型可空：业务允许「只填价格、售价类型后补」，
   * 不传/空时后端补全系统默认价格类型「零售价」（见后端 businessDefaults.ts）
   */
  priceTypeId?: string;
  price: number | string;
  /** v9.1：是否默认售价（同 SKU 下互斥，与 ProductPurchasePriceInput.isDefault 对等） */
  isDefault?: boolean;
}

export interface ProductPurchasePriceInput {
  brandIdx: number;
  unitIdx: number;
  /**
   * v13.0 供应商可空：业务允许「只录价格、供应商后补」，
   * 不传/空时后端补全系统默认供应商「面价渠道」（见后端 businessDefaults.ts）
   */
  supplierId?: string;
  /** v9.0：是否默认供应商 */
  isDefault: boolean;
  price: number | string;
}

/**
 * v14.0 产品建档/编辑事务输入（POST /api/staff/products/save）。
 * 产品 → 规格变体 → 品牌/单位 三级：
 *   1. 创建/更新 product（纯产品名）
 *   2. 创建/更新 spec（规格变体：specId 传入则编辑既有规格，为空则新建）
 *   3. 处理品牌关联（品牌名 → 全局品牌档案 name 唯一 → 规格×品牌关联）
 *   4. 处理 unit 列表（挂规格，isBase/isDisplay 互斥）
 *   5. 处理 brand_unit_conversion 换算率（规格×品牌×单位）
 *   6. 保存售价（specBrandId 维度）/ 进价（supplierId 外键 + isDefault）
 *   7. 保存图片（依附规格×品牌）
 *   8. 刷新 product_sku_search 宽表
 */
export interface SaveProductInput {
  /** 编辑时传入产品 ID（BigInt 序列化为 string），为空则新建产品 */
  id?: string;
  /** v14.0：编辑时传入规格 ID（BigInt 序列化为 string；切换规格编辑时传入，新建规格/产品时为空） */
  specId?: string;
  name: string;
  /** v8.0：规格型号（必填） */
  specModel: string;
  /** 分类 ID（有效记录 id；「未分类」按 name 解析，无 0 魔数） */
  categoryId?: number;
  /** 产品俗称（product.remark） */
  remark?: string;
  /** 当前这条规格的备注（spec.remark，执行标准） */
  specRemark?: string;
  status?: number;
  /** v8.0：单位列表（挂规格） */
  units: ProductUnitInput[];
  /** v14.0：品牌关联列表（name = 全局品牌档案名，含图片） */
  brands: ProductBrandInput[];
  /** v8.0：售价列表（brandIdx + unitIdx 索引） */
  salePrices?: ProductSalePriceInput[];
  /** v8.0：进价列表（brandIdx + unitIdx 索引） */
  purchasePrices?: ProductPurchasePriceInput[];
}

// --- 快速建档（v9.0） ---
export interface QuickCreateProductInput {
  productName: string;
  /** v1.5.6.3：规格型号（可空，后端补默认「通用」） */
  specModel?: string;
  remark?: string;
  /** v1.5.6.3：单位（可空，后端补默认「件」） */
  unitName?: string;
  /** v8.0：品牌名称（单字段，可选，空则「无品牌」） */
  brandName?: string;
  /** 分类 ID（有效记录 id；「未分类」按 name 解析，无 0 魔数） */
  categoryId?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  /** v11.7：true 时跳过相似档案候选，强制新建（用户已确认候选都不合适） */
  forceNew?: boolean;
}

/** v14.0 快速建档返回结果（产品 → 规格变体 → 品牌/单位 三级） */
export interface QuickCreateProductResult {
  product: ProductView;
  /** v14.0：规格变体（挂在产品下） */
  spec: SpecView;
  /** v14.0：规格×品牌关联 */
  specBrand: {
    id: string;
    specId: string;
    brandId: string;
    remark: string;
    sortOrder: number;
    status: number;
    name?: string;
  };
  /** v14.0：全局品牌档案 */
  brand: { id: string; name: string; status: number };
  unit: UnitView;
  /**
   * v11.8：true=精确命中已有档案直接复用（非新建）；false=本次实际新建。
   * 前端据此给用户「已使用现有档案」消息通知，让灵活写行为可感知。
   */
  reused?: boolean;
}

/**
 * v11.7 快速建档响应：
 *   ok —— 精确命中已复用 或 已新建（无歧义，静默完成）
 *   suggestion —— 存在相似档案（匹配度 ≥ 阈值），需用户决策「复用 or 仍要新建」
 */
export type QuickCreateProductResponse =
  | { status: 'ok'; result: QuickCreateProductResult }
  | {
      status: 'suggestion';
      candidates: Array<QuickCreateProductResult & { matchScore: number }>;
    };

// --- 供应商（v9.0：新结构） ---
export interface CreateSupplierInput {
  name?: string;
  contacts?: SupplierContact[];
  businessScope?: string;
  categoryIds?: number[];
  brandIds?: string[];
  address?: string;
  addresses?: SupplierAddressView[];
  remark?: string;
  status?: number;
}
export interface QuickAddSupplierInput {
  name: string;
}
export interface UpdateSupplierInput {
  name?: string;
  contacts?: SupplierContact[];
  businessScope?: string;
  categoryIds?: number[];
  brandIds?: string[];
  address?: string;
  addresses?: SupplierAddressView[];
  remark?: string;
  status?: number;
}

// --- 客户（保留） ---
export interface QuickAddCustomerInput {
  phone?: string;
  name?: string;
  wechat?: string;
  company?: string;
  note?: string;
  customerType?: string;
  discountRate?: number;
  invoiceInfo?: CustomerInvoiceInfo;
  contacts?: CustomerContactView[];
  invoices?: CustomerInvoiceRow[];
}
export interface UpdateCustomerInput {
  phone?: string;
  name?: string;
  wechat?: string;
  company?: string;
  note?: string;
  status?: 'active' | 'disabled';
  customerType?: string;
  discountRate?: number;
  invoiceInfo?: CustomerInvoiceInfo;
  contacts?: CustomerContactView[];
  invoices?: CustomerInvoiceRow[];
}

// --- 客户地址（v9.4 下钻式子表 CRUD） ---
export interface CreateCustomerAddressInput {
  label?: string;
  contact: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
  isDefault?: boolean;
}
export interface UpdateCustomerAddressInput {
  /** 可空——空串/清空时传 null（与 CustomerAddressView 数据语义一致） */
  label?: string | null;
  contact?: string;
  phone?: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  detail?: string;
  isDefault?: boolean;
}
export interface CustomerSearchItem {
  id: string;
  phone: string | null;
  name: string | null;
  wechat: string | null;
  company: string | null;
  status: string;
  customerType: string;
  /** Decimal(5,2)，serialize 后为 string */
  discountRate: string;
  invoiceInfo: CustomerInvoiceInfo | null;
  createdAt: string;
  updatedAt: string;
  contacts?: CustomerContactView[];
  invoices?: CustomerInvoiceRow[];
  count?: { customerAddresses: number; contacts?: number; invoices?: number } | number;
  hitAddress?: { detail: string; contact: string; phone: string; label: string | null } | null;
  hitContact?: { id: string; name: string; method: string; value: string } | null;
  hitInvoice?: { invoiceTitle: string; taxNumber: string } | null;
}

// ============================================================
// §3 检索类型（v8.0 SKU 检索宽表 + SKU 选项 + 输入框检索）
// ============================================================

/**
 * v14.0 SKU 检索宽表行（product_sku_search serialize 后结构）。
 * 每个「规格×品牌」一行宽表记录（specBrandId 唯一）。
 * 第一段查询：keywords 全文匹配，返回 SKU 列表（含默认单位+最低价+主图）。
 * 品牌关键词优先排序：若关键词匹配到品牌名，对应品牌的 SKU 行排在前面。
 * 注意：retailPrice / purchasePriceDefault 在后端通过 .toNumber() 转为 number。
 */
export interface SkuSearchRow {
  type: 'sku';
  /** BigInt 序列化为 string */
  id: string;
  /** BigInt 序列化为 string */
  productId: string;
  productName: string;
  /** v14.0：规格变体 ID（BigInt 序列化为 string） */
  specId: string;
  /** v14.0：规格型号（来自 spec.specModel） */
  specModel: string;
  /** 分类 ID（Int） */
  categoryId: string;
  categoryName: string;
  /** v14.0：规格×品牌关联 ID（BigInt 序列化为 string，行唯一键） */
  specBrandId: string;
  /** BigInt 序列化为 string（全局品牌档案 ID） */
  brandId: string;
  /** v14.0：品牌名称（来自全局品牌档案 brand.name） */
  brandName: string;
  /** 规格备注（来自 spec.remark，执行标准） */
  remark: string;
  /** 产品俗称（来自 product.remark） */
  productRemark?: string;
  /** 供应商视图命中的渠道 */
  hitSupplierId?: string | null;
  hitSupplierName?: string | null;
  /** proven=已进价；scoped=经营范围盖住但还没进价 */
  hitChannelTier?: 'proven' | 'scoped' | null;
  /** 默认显示单位 ID（取 isDisplay=true，空则取 isBase=true） */
  defaultUnitId: string | null;
  defaultUnitName: string | null;
  /** 默认零售价（默认单位下的最低售价类型价格，后端 .toNumber() → number） */
  retailPrice: number | null;
  /** 默认进价（默认单位下的最低供应商进价，后端 .toNumber() → number；公开端剥离为 null） */
  purchasePriceDefault: number | null;
  /** 规格×品牌第一张主图（原图 URL，详情/预览用） */
  mainImageUrl: string | null;
  /** v1.5.6.2：主图缩略图 URL（列表图标/客户端卡片用，避免加载 1280px 原图） */
  mainImageThumbUrl: string | null;
  /** 综合状态：产品启用且规格×品牌启用且品牌启用 → 1 */
  status: number;
  updateTime: string;
}

/**
 * 搜索结果首条：创建提示（不计入分页）。
 * 点击后打开建档弹窗，预填关键词。
 */
export interface CreationPrompt {
  type: 'creation_prompt';
  keyword: string;
}

/** 产品搜索结果 */
export interface SearchProductResult {
  /** 首条固定为 CreationPrompt，其余为 SkuSearchRow */
  list: Array<SkuSearchRow | CreationPrompt>;
  total: number;
  page: number;
  size: number;
}

/**
 * v9.2 SKU 选项接口返回的单位行（getSkuOptions）。
 * 按 brandId 返回该品牌下所有单位及其全部售价/进价，用于列表下拉切换。
 * 注意：price 在后端通过 .toNumber() 转为 number。
 * v9.0：换算率从 unit 移至 SkuOptionResult.conversions（品牌×单位中间表）。
 * v9.1：售价列表新增 isDefault 标记；minSalePrice → defaultSalePrice（按 isDefault 取，兜底最低）
 * v9.2：售价列表项 priceType 字符串 → priceTypeId（bigint）+ priceTypeName（string）
 *       defaultSalePriceType 拆为 defaultSalePriceTypeId + defaultSalePriceTypeName
 */
export interface SkuOptionUnit {
  /** BigInt 序列化为 string */
  unitId: string;
  unitName: string;
  /** 是否基础单位 */
  isBase: boolean;
  /** v8.0：是否默认显示单位 */
  isDisplay: boolean;
  /** v9.2：售价列表（按 priceType.sortOrder 排序，含 isDefault 标记） */
  salePrices: Array<{
    /** v10.14：售价记录 ID（用于 updateSalePrice 修改 isDefault） */
    id: string;
    /** v9.2：价格类型字典 ID（bigint） */
    priceTypeId: string;
    /** v9.2：价格类型名称（来自 price_type.name） */
    priceTypeName: string;
    price: number;
    /** v9.1：是否默认售价类型（同 SKU 下互斥） */
    isDefault: boolean;
    /** 组默认或规格例外点位；无则 1 */
    point?: number;
    /** 实际售价 = 面价 × 点位 */
    effectivePrice?: number;
    /** 点位来自规格例外 */
    specPoint?: boolean;
  }>;
  /** v9.1：默认售价（取 isDefault=true；无则兜底取最低价） */
  defaultSalePrice: number | null;
  /** v1.5.6.3：推算售价（该单位未录价时：基准单位已录默认售价 × 该单位换算率，不写库） */
  derivedSalePrice: number | null;
  /** v9.2：默认售价对应的价格类型 ID */
  defaultSalePriceTypeId: string | null;
  /** v9.2：默认售价对应的价格类型名称 */
  defaultSalePriceTypeName: string | null;
  /** v9.0：进价列表（按 supplierId 排序；公开端剥离为空数组） */
  purchasePrices: Array<{
    /** v10.14：进价记录 ID（用于 updatePurchasePrice 修改 isDefault） */
    id: string;
    supplierId: string;
    supplierName: string;
    /** v12.0：面价（录入值） */
    price: number;
    isDefault: boolean;
    /** v12.0：该组点位（来自 supplier_point_rule，无规则默认 1） */
    point?: number | null;
    /** v12.0：进价 = 面价 × 点位（无点位规则时 = 面价） */
    effectivePrice?: number | null;
    /** 点位来自规格例外 */
    specPoint?: boolean;
  }>;
  /** v9.0：默认进价（取 isDefault=true；无则兜底取最低价；公开端剥离为 null） */
  defaultPurchasePrice: number | null;
  /** v1.5.6.3：推算进价（该单位未录进价时：基准单位已录默认进价 × 该单位换算率，不写库） */
  derivedPurchasePrice: number | null;
  /** v9.0：默认进价对应的供应商 ID（公开端剥离为 null） */
  defaultPurchaseSupplierId: string | null;
  /** v9.0：默认进价对应的供应商名称（公开端剥离为 null） */
  defaultPurchaseSupplierName: string | null;
  /** 这一条规格×品牌下该单位的换算（1 该单位 = N 基准） */
  conversions?: BrandConversion[];
}

/** v9.0 品牌单位换算（brand_unit_conversion 中间表） */
export interface BrandConversion {
  /** BigInt 序列化为 string */
  unitId: string;
  /** 换算率（后端 .toNumber() → number，基础单位为 1） */
  conversionRate: number;
}

/** SKU 选项接口返回结构 */
export interface SkuOptionResult {
  units: SkuOptionUnit[];
  /** v9.0：品牌单位换算列表（brand_unit_conversion 中间表） */
  conversions: BrandConversion[];
}

/**
 * v8.0 输入框检索选项（suggest）。
 * 支持三种类型：新建 / 选择默认值 / 选取已有项。
 */
export interface SuggestOption {
  type: 'create' | 'default' | 'existing';
  label: string;
  value: string;
  /** 已有项的 ID（category 为 number，其他为 BigInt 序列化的 string） */
  id?: string | number;
  /** 候选推荐标签（如 已进价 / 经营范围），有则覆盖右侧 type 标签 */
  badge?: string;
}

/**
 * 输入框快捷辅助录入组件字段枚举（v9.4 命名统一）
 *
 * 字段数据来源类型与快速新建策略（顶层通用规则）：
 *   关联字段（值存 ID 来自关联表，需先建档拿 ID）：
 *     - 'category'  → 启用快速新建（quickAddCategory）
 *     - 'supplier'  → 启用快速新建（quickAddSupplier）
 *     - 'priceType' → 启用快速新建（createPriceType）
 *     - 'product'   → 不启用（新建逻辑复杂，由独立 Picker 处理）
 *     - 'brand'     → 不启用（随 saveProduct 事务创建，无独立 quickAdd）
 *     - 'unit'      → 不启用（随 saveProduct 事务创建，无独立 quickAdd）
 *   直接字段（值直接存当前表，无唯一约束）：
 *     - 'specModel' → 不启用（仅检索辅助）
 *     - 'remark'    → 不启用（仅检索辅助）
 */
export type SuggestField =
  | 'product'
  | 'brand'
  | 'specModel'
  | 'unit'
  | 'category'
  | 'priceType'
  | 'supplier'
  | 'remark'
  | 'contactMethod';

// ============================================================
// §4 分类管理（/api/staff/categories）—— v8.0 扁平结构
// ============================================================

/** 分类列表（不分页，含关联产品计数） */
export function listCategories(): Promise<CategoryView[]> {
  return request.get<unknown, CategoryView[]>('/api/staff/categories');
}

/** 分类详情（含关联产品计数） */
export function getCategory(id: number): Promise<CategoryView> {
  return request.get<unknown, CategoryView>(`/api/staff/categories/${id}`);
}

export function createCategory(data: CreateCategoryInput): Promise<CategoryView> {
  return request.post<unknown, CategoryView>('/api/staff/categories', data);
}

export function updateCategory(id: number, data: UpdateCategoryInput): Promise<CategoryView> {
  return request.patch<unknown, CategoryView>(`/api/staff/categories/${id}`, data);
}

export function deleteCategory(id: number): Promise<{ id: number }> {
  return request.delete<unknown, { id: number }>(`/api/staff/categories/${id}`);
}

/**
 * 快速新建分类（同名幂等：已存在则返回既存）。
 * v8.0：扁平结构，无 parentId 参数。
 * 后端：POST /api/staff/categories/quick-add
 */
export function quickAddCategory(name: string): Promise<CategoryView> {
  return request.post<unknown, CategoryView>('/api/staff/categories/quick-add', { name });
}

/** 客户端公开分类列表（无鉴权，调用 /api/categories） */
export function listPublicCategories(): Promise<CategoryView[]> {
  return request.get<unknown, CategoryView[]>('/api/categories');
}

// ============================================================
// §5 产品主体（/api/staff/products）—— v8.0 SPU = name + specModel
// ============================================================

/** 产品列表（分页，含分类 + 关联计数） */
export function listProducts(query: {
  keyword?: string;
  categoryId?: number;
  status?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<PaginationResult<ProductView>> {
  return request.get<unknown, PaginationResult<ProductView>>('/api/staff/products', {
    params: query,
  });
}

/** v14.0 产品详情（当前规格扁平化：specId/specModel/brands/units/salePrices/purchasePrices + specs 列表）
 *  @param specId 可选：定位当前编辑规格（不传取首个规格） */
export function getProduct(id: string, specId?: string, brandId?: string): Promise<ProductView> {
  const params: Record<string, string> = {};
  if (specId) params.specId = specId;
  if (brandId) params.brandId = brandId;
  return request.get<unknown, ProductView>(`/api/staff/products/${id}`, {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
}

/** v22.0 系列/规格快切：同产品（可选限定品牌）的规格列表 */
export interface SiblingSpec {
  id: string;
  specModel: string;
  status: number;
  brandCount: number;
  /** 该 specModel 下的品牌（brandId 过滤时通常仅一条） */
  brands?: { id: string; name: string }[];
  isCurrent: boolean;
}

export function getSiblingSpecs(id: string, specId?: string, brandId?: string): Promise<SiblingSpec[]> {
  const params: Record<string, string> = {};
  if (specId) params.specId = specId;
  if (brandId) params.brandId = brandId;
  return request.get<unknown, SiblingSpec[]>(`/api/staff/products/${id}/sibling-specs`, {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
}

export function createProduct(data: CreateProductInput): Promise<ProductView> {
  return request.post<unknown, ProductView>('/api/staff/products', data);
}

export function updateProduct(id: string, data: UpdateProductInput): Promise<ProductView> {
  return request.patch<unknown, ProductView>(`/api/staff/products/${id}`, data);
}

/**
 * v11.0 删除产品（解耦改造）
 *
 * 行为变更：
 *   - 即便被 document_lines 引用也允许物理删除
 *   - 前端二次确认后调用本接口
 *   - 解耦后 document_lines 不级联（仅保留 productId 字段，不影响单据展示）
 *   - 级联清理产品库内部表：brand / unit / sale_price / purchase_price / product_image / brand_unit_conversion / product_sku_search
 *
 * 返回值：包含 deletedDocLineRefs 字段（被引用的单据行数），用于前端审计/日志展示
 */
export function deleteProduct(
  id: string,
  options?: { purgeOrphanFiles?: boolean },
): Promise<{ id: string; deletedDocLineRefs: number }> {
  const qs =
    options?.purgeOrphanFiles === false ? '?purgeOrphanFiles=0' : '';
  return request.delete<unknown, { id: string; deletedDocLineRefs: number }>(
    `/api/staff/products/${id}${qs}`,
  );
}

export interface ProductDeletePreviewImage {
  imageUrl: string;
  thumbnailUrl: string;
  productLinkCount: number;
  refCount: number;
  remainingRefCount: number;
  otherProducts: {
    productId: string;
    productName: string;
    brandName: string;
    specModel: string;
  }[];
}

export interface ProductDeletePreview {
  productId: string;
  productName: string;
  brandCount: number;
  unitCount: number;
  docLineCount: number;
  imageCount: number;
  images: ProductDeletePreviewImage[];
}

/** 删除前预览：品牌/单位/单据引用/图片共享影响 */
export function getProductDeletePreview(id: string): Promise<ProductDeletePreview> {
  return request.get<unknown, ProductDeletePreview>(
    `/api/staff/products/${id}/delete-preview`,
  );
}

/**
 * v11.0 停用产品
 * 入口：POST /api/staff/products/:id/deactivate
 * 行为：product.status=0 + 同步 product_sku_search.status=0
 * 搜索接口默认过滤停用产品
 */
export function deactivateProduct(id: string): Promise<{ id: string; status: number }> {
  return request.post<unknown, { id: string; status: number }>(
    `/api/staff/products/${id}/deactivate`,
  );
}

/**
 * v11.0 启用产品
 * 入口：POST /api/staff/products/:id/activate
 * 行为：product.status=1 + 同步 product_sku_search.status
 * 重新进入检索结果
 */
export function activateProduct(id: string): Promise<{ id: string; status: number }> {
  return request.post<unknown, { id: string; status: number }>(
    `/api/staff/products/${id}/activate`,
  );
}

export function batchDeactivateProducts(
  ids: string[],
): Promise<{ count: number; status: number }> {
  return request.post<unknown, { count: number; status: number }>(
    '/api/staff/products/batch-deactivate',
    { ids },
  );
}

export function batchActivateProducts(
  ids: string[],
): Promise<{ count: number; status: number }> {
  return request.post<unknown, { count: number; status: number }>(
    '/api/staff/products/batch-activate',
    { ids },
  );
}

/**
 * v11.0 查询产品被单据引用计数
 * 入口：GET /api/staff/products/:id/doc-refs
 * 用途：前端删除按钮二次确认弹窗显示「该产品已被 N 个单据引用」
 */
export function getProductDocRefs(id: string): Promise<{ productId: string; docLineCount: number }> {
  return request.get<unknown, { productId: string; docLineCount: number }>(
    `/api/staff/products/${id}/doc-refs`,
  );
}

// --- v14.0 规格变体（spec 独立表） ---

/** v14.0 更新规格变体（改名，同产品下规格唯一） */
export function updateSpec(id: string, data: { specModel?: string; status?: number }): Promise<SpecView> {
  return request.patch<unknown, SpecView>(`/api/staff/specs/${id}`, data);
}

/** v14.0 删除规格变体（级联清理其下品牌关联/单位/价格/图片/换算/宽表；单据快照保留） */
export function deleteSpec(id: string): Promise<{ id: string; deletedDocLineRefs: number }> {
  return request.delete<unknown, { id: string; deletedDocLineRefs: number }>(`/api/staff/specs/${id}`);
}

/** v14.0 查询规格被单据引用计数（删除规格二次确认用） */
export function getSpecDocRefs(id: string): Promise<{ specId: string; docLineCount: number }> {
  return request.get<unknown, { specId: string; docLineCount: number }>(
    `/api/staff/specs/${id}/doc-refs`,
  );
}

/** 选品空行加规格 / 挂品牌后回填检索行用 */
export interface PickerSkuCreated {
  specId: string;
  specModel: string;
  specBrandId: string;
  brandId: string;
  brandName: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  defaultUnitId: string | null;
  defaultUnitName: string | null;
}

export function attachBrandToProduct(productId: string, brandName: string): Promise<PickerSkuCreated[]> {
  return request.post<unknown, PickerSkuCreated[]>(`/api/staff/products/${productId}/brands`, { brandName });
}

export function ensureSpecOnProductBrand(
  productId: string,
  specModel: string,
  brandName: string,
): Promise<PickerSkuCreated> {
  return request.post<unknown, PickerSkuCreated>(`/api/staff/products/${productId}/specs`, {
    specModel,
    brandName,
  });
}

export function rebindSpecBrand(specBrandId: string, brandName: string): Promise<PickerSkuCreated> {
  return request.patch<unknown, PickerSkuCreated>(`/api/staff/spec-brands/${specBrandId}`, { brandName });
}

/** 产品管理备注列：改这一条规格×品牌的 remark */
export function updateSpecBrandRemark(specBrandId: string, remark: string): Promise<PickerSkuCreated> {
  return request.patch<unknown, PickerSkuCreated>(`/api/staff/spec-brands/${specBrandId}`, { remark });
}

export function rebindSpecUnit(
  specId: string,
  unitId: string,
  unitName: string,
): Promise<{ id: string; unitName: string; specId: string | null; isBase: boolean; isDisplay: boolean }> {
  return request.patch<
    unknown,
    { id: string; unitName: string; specId: string | null; isBase: boolean; isDisplay: boolean }
  >(`/api/staff/specs/${specId}/units/${unitId}`, { unitName });
}

export function upsertSpecBrandConversion(
  specBrandId: string,
  unitId: string,
  conversionRate: number,
): Promise<{ specBrandId: string; unitId: string; conversionRate: number }> {
  return request.patch<unknown, { specBrandId: string; unitId: string; conversionRate: number }>(
    `/api/staff/spec-brands/${specBrandId}/units/${unitId}/conversion`,
    { conversionRate },
  );
}

/** 选品改全局：品牌/单位/分类/售价类型/供应商。目标名已存在则并到那个 ID，不报「已存在」。 */
export type DictChangeKind = 'brand' | 'unit' | 'category' | 'priceType' | 'supplier';

export interface DictChangeExample {
  title: string;
  sub?: string;
}

export interface DictChangeResult {
  kind: DictChangeKind;
  mode: 'rename' | 'merge';
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  total: number;
  examples: DictChangeExample[];
  blocking?: string[];
  summary: string;
  deletedSource: boolean;
}

export function previewDictChange(data: {
  kind: DictChangeKind;
  fromId: string;
  toName: string;
}): Promise<DictChangeResult> {
  return request.post<unknown, DictChangeResult>('/api/staff/dict-change/preview', data);
}

export function applyDictChange(data: {
  kind: DictChangeKind;
  fromId: string;
  toName: string;
}): Promise<DictChangeResult> {
  return request.post<unknown, DictChangeResult>('/api/staff/dict-change', data);
}

export function upsertSaleSpecPoint(data: {
  specBrandId: string;
  priceTypeId: string;
  point: number;
}): Promise<{ specBrandId: string; priceTypeId: string; point: number }> {
  return request.put<unknown, { specBrandId: string; priceTypeId: string; point: number }>(
    '/api/staff/sale-spec-points',
    data,
  );
}

export function upsertPurchaseSpecPoint(data: {
  specBrandId: string;
  supplierId: string;
  point: number;
}): Promise<{ specBrandId: string; supplierId: string; point: number }> {
  return request.put<unknown, { specBrandId: string; supplierId: string; point: number }>(
    '/api/staff/purchase-spec-points',
    data,
  );
}

export interface PointChangePreviewInput {
  side: 'sale' | 'purchase';
  brandName: string;
  categoryName: string;
  newPoint: number;
  priceTypeId?: string;
  supplierId?: string;
}

export interface PointChangePreview {
  side: 'sale' | 'purchase';
  oldPoint: number;
  newPoint: number;
  total: number;
  skippedExceptions: number;
  examples: { title: string; sub?: string }[];
  summary: string;
}

export function previewPointChange(data: PointChangePreviewInput): Promise<PointChangePreview> {
  return request.post<unknown, PointChangePreview>('/api/staff/point-changes/preview', data);
}

export function upsertSaleGroupPoint(data: {
  priceTypeId: string;
  brandName: string;
  categoryName: string;
  point: number;
}): Promise<{ priceTypeId: string; brandName: string; categoryName: string; point: number }> {
  return request.put<unknown, { priceTypeId: string; brandName: string; categoryName: string; point: number }>(
    '/api/staff/sale-group-points',
    data,
  );
}

export function upsertPurchaseGroupPoint(data: {
  supplierId: string;
  brandName: string;
  categoryName: string;
  point: number;
}): Promise<{ supplierId: string; brandName: string; categoryName: string; point: number }> {
  return request.put<unknown, { supplierId: string; brandName: string; categoryName: string; point: number }>(
    '/api/staff/purchase-group-points',
    data,
  );
}

// ============================================================
// §6 品牌管理（/api/staff/brands）—— v14.0 全局档案（name 全局唯一）
// 品牌独立档案，规格通过 spec_brand 中间表引用；改名 → 所有引用全局生效
// 快捷新增：POST /api/staff/brands/quick-add（同名幂等复用）
// ============================================================

/**
 * v14.2：全局品牌档案视图（brand 表，name 全局唯一）。
 * 区别于 BrandView（spec_brand 关联视图）：本视图 id = 全局档案 id（brand.id），
 * 由 listBrands/getBrand/createBrand/quickAddBrand/updateBrand 返回；
 * count.specBrands = 被多少「规格×品牌」引用。
 */
export interface GlobalBrandView {
  id: string;
  name: string;
  status: number;
  createdAt: string;
  updatedAt: string;
  count?: { specBrands: number };
}

/** 品牌列表（分页，含关联计数） */
export function listBrands(query: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<PaginationResult<GlobalBrandView>> {
  return request.get<unknown, PaginationResult<GlobalBrandView>>('/api/staff/brands', {
    params: query,
  });
}

/** 品牌详情（含关联计数） */
export function getBrand(id: string): Promise<GlobalBrandView> {
  return request.get<unknown, GlobalBrandView>(`/api/staff/brands/${id}`);
}

export function createBrand(data: CreateBrandInput): Promise<GlobalBrandView> {
  return request.post<unknown, GlobalBrandView>('/api/staff/brands', data);
}

/**
 * v14.0：品牌快捷新建（name 全局唯一，同名幂等复用）
 * 专用于规格编辑弹窗「输入品牌档案中不存在 → 快捷新增」入口
 */
export function quickAddBrand(name: string): Promise<GlobalBrandView> {
  return request.post<unknown, GlobalBrandView>('/api/staff/brands/quick-add', { name });
}

export function updateBrand(id: string, data: UpdateBrandInput): Promise<GlobalBrandView> {
  return request.patch<unknown, GlobalBrandView>(`/api/staff/brands/${id}`, data);
}

/** v14.0 删除品牌（被任何规格引用时拒绝，需先解除关联） */
export function deleteBrand(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/brands/${id}`);
}

// ============================================================
// §7 单位（/api/staff/units）—— v9.0 挂 SPU，isBase/isDisplay（换算率移至 brand_unit_conversion）
// ============================================================

/** 单位列表（分页，含关联产品 + 关联计数） */
export function listUnits(query: {
  /** v14.0：规格变体 ID（挂规格后单位从属于 SKU，按规格过滤） */
  specId?: string;
  productId?: string;
  unitName?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<UnitView>> {
  return request.get<unknown, PaginationResult<UnitView>>('/api/staff/units', {
    params: query,
  });
}

/** 单位详情（含关联产品） */
export function getUnit(id: string): Promise<UnitView> {
  return request.get<unknown, UnitView>(`/api/staff/units/${id}`);
}

/**
 * v9.0 创建单位
 * - isBase=true：自动设为该 SPU 基础单位（互斥清除其他基础单位）
 * - isDisplay=true：自动设为该 SPU 默认显示单位（互斥清除其他默认显示单位）
 * - 该 SPU 第一个单位自动设为基础+默认（若未显式指定）
 */
export function createUnit(data: CreateUnitInput): Promise<UnitView> {
  return request.post<unknown, UnitView>('/api/staff/units', data);
}

export function updateUnit(id: string, data: UpdateUnitInput): Promise<UnitView> {
  return request.patch<unknown, UnitView>(`/api/staff/units/${id}`, data);
}

/**
 * v8.0 删除单位
 * - 若已被售价/进价引用 → 软删除（status=0）
 * - 基础单位不可删除，除非先更换基础单位
 */
export function deleteUnit(
  id: string,
  specId?: string,
): Promise<{ id: string; softDeleted: boolean }> {
  return request.delete<unknown, { id: string; softDeleted: boolean }>(
    `/api/staff/units/${id}`,
    { params: specId ? { specId } : undefined },
  );
}

/** 全局单位字典快速新建（边用边建·A 类槽）：只传 unitName，幂等，不挂 spec。 */
export function quickAddUnit(unitName: string): Promise<
  UnitView & { reused: boolean }
> {
  return request.post<unknown, UnitView & { reused: boolean }>(
    '/api/staff/units/quick-add',
    { unitName },
  );
}

/**
 * v9.0 设置单位为基础单位（互斥：同规格仅一个基础单位）。
 * 后端：POST /api/staff/units/:id/base
 */
export function setUnitBase(
  id: string,
  specId?: string,
): Promise<{ unitId: string; isBase: boolean }> {
  return request.post<unknown, { unitId: string; isBase: boolean }>(
    `/api/staff/units/${id}/base`,
    specId ? { specId } : undefined,
  );
}

/**
 * v8.0 设置单位默认显示单位标记（互斥：同规格仅一个默认显示单位）。
 * 后端：POST /api/staff/units/:id/display
 */
export function setUnitDisplay(
  id: string,
  isDisplay: boolean,
  specId?: string,
): Promise<{ unitId: string; isDisplay: boolean }> {
  return request.post<unknown, { unitId: string; isDisplay: boolean }>(
    `/api/staff/units/${id}/display`,
    specId ? { isDisplay, specId } : { isDisplay },
  );
}

// ============================================================
// §8 销售价（/api/staff/sale-prices）—— v9.2 priceTypeId 外键
// 基于 SKU = brand + unit，@@unique([brandId, unitId, priceTypeId])
// ============================================================

/** 销售价列表（分页，可按 brandId/unitId/priceTypeId 过滤） */
export function listSalePrices(query: {
  specBrandId?: string;
  unitId?: string;
  priceTypeId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<SalePriceView>> {
  return request.get<unknown, PaginationResult<SalePriceView>>(
    '/api/staff/sale-prices',
    { params: query },
  );
}

/** 销售价详情 */
export function getSalePrice(id: string): Promise<SalePriceView> {
  return request.get<unknown, SalePriceView>(`/api/staff/sale-prices/${id}`);
}

export function createSalePrice(data: CreateSalePriceInput): Promise<SalePriceView> {
  return request.post<unknown, SalePriceView>('/api/staff/sale-prices', data);
}

export function updateSalePrice(
  id: string,
  data: UpdateSalePriceInput,
): Promise<SalePriceView> {
  return request.patch<unknown, SalePriceView>(`/api/staff/sale-prices/${id}`, data);
}

export function deleteSalePrice(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/sale-prices/${id}`);
}

// ============================================================
// §8.1 价格类型字典（/api/staff/price-types）—— v9.2 新增，全局共享
// 所有产品售价矩阵按字典展开，name 全局唯一
// ============================================================

/** 价格类型字典列表（不分页，含关联售价计数） */
export function listPriceTypes(): Promise<PriceTypeView[]> {
  return request.get<unknown, PriceTypeView[]>('/api/staff/price-types');
}

/** 价格类型字典详情（含关联售价计数） */
export function getPriceType(id: string): Promise<PriceTypeView> {
  return request.get<unknown, PriceTypeView>(`/api/staff/price-types/${id}`);
}

export function createPriceType(data: CreatePriceTypeInput): Promise<PriceTypeView> {
  return request.post<unknown, PriceTypeView>('/api/staff/price-types', data);
}

export function updatePriceType(
  id: string,
  data: UpdatePriceTypeInput,
): Promise<PriceTypeView> {
  return request.patch<unknown, PriceTypeView>(`/api/staff/price-types/${id}`, data);
}

export function deletePriceType(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/price-types/${id}`);
}

// ============================================================
// §9 进价（/api/staff/purchase-prices）—— v14.0 specBrandId 维度
// 基于 SKU = 规格×品牌，@@unique([specBrandId, unitId, supplierId])
// ============================================================

/** 进价列表（分页，可按 specBrandId/unitId/supplierId 过滤） */
export function listPurchasePrices(query: {
  specBrandId?: string;
  unitId?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<PurchasePriceView>> {
  return request.get<unknown, PaginationResult<PurchasePriceView>>(
    '/api/staff/purchase-prices',
    { params: query },
  );
}

/** 进价详情 */
export function getPurchasePrice(id: string): Promise<PurchasePriceView> {
  return request.get<unknown, PurchasePriceView>(`/api/staff/purchase-prices/${id}`);
}

export function createPurchasePrice(
  data: CreatePurchasePriceInput,
): Promise<PurchasePriceView> {
  return request.post<unknown, PurchasePriceView>('/api/staff/purchase-prices', data);
}

export function updatePurchasePrice(
  id: string,
  data: UpdatePurchasePriceInput,
): Promise<PurchasePriceView> {
  return request.patch<unknown, PurchasePriceView>(
    `/api/staff/purchase-prices/${id}`,
    data,
  );
}

export function deletePurchasePrice(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/purchase-prices/${id}`);
}

// ============================================================
// §9.5 批量改价（/api/staff/purchase-prices/batch-*）—— v11.3 新增
// 需求：供应商面价表 = 面价 × 点位；点位调整时按「供应商 + 品牌名 + 分类名」圈组批量重算进价
// 点位规则挂供应商维度（supplier_point_rule），品牌名/分类名粒度由人控制
// ============================================================

/** 点位规则视图（供应商 + 品牌名 + 分类名 → 点位） */
export interface PointRuleView {
  /** BigInt 序列化为 string */
  id: string;
  /** BigInt 序列化为 string */
  supplierId: string;
  supplierName: string;
  brandName: string;
  categoryName: string;
  /** 点位（如 0.58 = 面价×58%） */
  point: number;
}

/** 批量改价请求体（点位换算，新进价 = 旧进价 × 新点位 ÷ 旧点位） */
export interface BatchAdjustInput {
  /** BigInt 序列化为 string */
  supplierId: string;
  brandName: string;
  categoryName: string;
  /** 旧点位（有规则自动带出，无规则需手动输入） */
  oldPoint?: number;
  /** 新点位 */
  newPoint?: number;
}

/** 批量改价示例行（预览用） */
export interface BatchAdjustRow {
  purchasePriceId: string;
  brandName: string;
  productName: string;
  specModel: string;
  unitName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
}

/** 批量改价预览结果（v12.0：进价 = 面价 × 点位，展示旧/新点位） */
export interface BatchAdjustPreviewResult {
  total: number;
  examples: BatchAdjustRow[];
  /** v12.0：旧点位（规则带出，无规则默认 1） */
  oldPoint: number | null;
  /** v12.0：新点位（用户输入） */
  newPoint: number;
}

/** 读取某组点位规则（旧点位自动带出） */
export function getPointRule(params: {
  supplierId: string;
  brandName: string;
  categoryName: string;
}): Promise<PointRuleView | null> {
  return request.get<unknown, PointRuleView | null>('/api/staff/purchase-prices/point-rule', {
    params,
  });
}

/** 批量改价预览 */
export function batchAdjustPreview(data: BatchAdjustInput): Promise<BatchAdjustPreviewResult> {
  return request.post<unknown, BatchAdjustPreviewResult>(
    '/api/staff/purchase-prices/batch-preview',
    data,
  );
}

/** 执行批量改价 */
export function batchAdjustPurchasePrices(
  data: BatchAdjustInput,
): Promise<{ updated: number; ratio: number }> {
  return request.post<unknown, { updated: number; ratio: number }>(
    '/api/staff/purchase-prices/batch-adjust',
    data,
  );
}

// ============================================================
// §10 产品图片（/api/staff/product-images）—— v8.0 依附品牌
// ============================================================

/** 产品图片列表（可按 brandId 过滤） */
export function listProductImages(query: {
  brandId?: string;
}): Promise<ProductImageView[]> {
  return request.get<unknown, ProductImageView[]>('/api/staff/product-images', {
    params: query,
  });
}

/**
 * v1.5.4 产品图片库条目：按 hash 去重后的代表图片 + 引用数
 * 用于「从图片库选择」复用已有图片（内容寻址，物理文件不重复存储）
 * v1.5.5：附带品牌/产品/分类信息，供前端「关键词检索 + 按分类分组显示」
 */
export interface ProductImageLibraryItem {
  /** 代表记录 ID（BigInt 序列化 string） */
  id: string;
  /** 代表记录所属品牌 ID */
  brandId: string;
  imageUrl: string;
  mediumUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  size: number;
  hash: string;
  isMain: number;
  /** 被多少个品牌引用（同 hash 复用） */
  refCount: number;
  /** v1.5.5：代表记录所属品牌名 */
  brandName: string;
  /** v1.5.5：所属产品名 */
  productName: string;
  /** v1.5.5：所属产品规格型号 */
  specModel: string;
  /** v1.5.5：所属产品分类 ID（有效记录 id；「未分类」按 name 解析） */
  categoryId: number;
  /** v1.5.5：所属产品分类名 */
  categoryName: string;
}

/** v1.5.4：获取产品图片库（按 hash 去重 + 引用数） */
export function listProductImageLibrary(): Promise<ProductImageLibraryItem[]> {
  return request.get<unknown, ProductImageLibraryItem[]>('/api/staff/product-images/library');
}

export function createProductImage(data: CreateProductImageInput): Promise<ProductImageView> {
  return request.post<unknown, ProductImageView>('/api/staff/product-images', data);
}

export function updateProductImage(
  id: string,
  data: UpdateProductImageInput,
): Promise<ProductImageView> {
  return request.patch<unknown, ProductImageView>(`/api/staff/product-images/${id}`, data);
}

export function deleteProductImage(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/product-images/${id}`);
}

/** 上传产品图片（multipart/form-data，字段名 file） */
/**
 * v11.0 生产级：后端 imageProcessor 用 sharp 生成三版本 WebP + SHA-256 hash
 * 返回完整元数据，前端 saveProduct 时一并提交
 */
export interface UploadProductImageResult {
  imageUrl: string;
  mediumUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  size: number;
  hash: string;
  /** 是否复用了已有文件（同 hash 内容寻址） */
  reused: boolean;
}

export function uploadProductImage(file: File): Promise<UploadProductImageResult> {
  const formData = new FormData();
  formData.append('file', file);
  return request.post<unknown, UploadProductImageResult>(
    '/api/staff/product-images/upload',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}

// ============================================================
// §11 产品搜索（/api/staff/products/search）—— v8.0 SKU 检索宽表
// 第一段：查 product_sku_search.keywords 全文匹配 → SKU 列表
// 首条固定为 creation_prompt，不计入分页
// v8.0：品牌关键词优先排序 — 若关键词匹配到品牌名，对应品牌的 SKU 行排在前面
// 员工端：返回完整 SKU 含 purchasePriceDefault
// 公开端：剥离 purchasePriceDefault（isStaff=false 时返回 null）
// ============================================================

/**
 * v8.0 产品搜索（员工端，含进价）。
 * 后端：GET /api/staff/products/search
 *
 * @param query.keyword 搜索关键词（按空格分词 AND 匹配 keywords）
 * @param query.categoryId 分类筛选
 * @param query.brandId 品牌筛选（宽表 brandId，索引）
 * @param query.productId 产品筛选（宽表 productId，索引）
 * @param query.specModel 规格型号精确筛选（宽表 specModel，索引）
 * @param query.status 状态筛选
 * @param query.page 页码（默认 1）
 * @param query.size 每页数量（默认 20，后端夹紧到 [1, 50]）
 */
export function searchProducts(query: {
  keyword?: string;
  categoryId?: number;
  brandId?: string;
  brandName?: string;
  productId?: string;
  productName?: string;
  specModel?: string;
  specExact?: boolean | 0 | 1;
  status?: number;
  page?: number;
  size?: number;
  /** 选用入口层，默认 name */
  entryView?: string;
}): Promise<SearchProductResult> {
  return request.get<unknown, SearchProductResult>('/api/staff/products/search', {
    params: query,
  });
}

/**
 * 档案列表表头级联候选（当前结果里的产品名 / 品牌 / 规格，不是全局字典）。
 * 后端：GET /api/staff/products/search/facets
 */
export function listSkuSearchFacets(query: {
  field: 'product' | 'brand' | 'spec';
  keyword?: string;
  q?: string;
  categoryId?: number;
  brandId?: string;
  brandName?: string;
  productId?: string;
  productName?: string;
  specModel?: string;
  specExact?: boolean;
  status?: number;
}): Promise<SuggestOption[]> {
  return request
    .get<unknown, { options: SuggestOption[] }>('/api/staff/products/search/facets', {
      params: query,
    })
    .then((res) => res.options ?? []);
}

export function listSupplierFacets(query: {
  field: 'name' | 'category' | 'brand' | 'scope';
  keyword?: string;
  q?: string;
  status?: number | 'all';
  name?: string;
  nameExact?: boolean;
  nameId?: string;
  categoryId?: number;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  scopeName?: string;
}): Promise<SuggestOption[]> {
  return request
    .get<unknown, { options: SuggestOption[] }>('/api/staff/suppliers/facets', { params: query })
    .then((res) => res.options ?? []);
}

export function listCustomerFacets(query: {
  field: 'name' | 'phone';
  keyword?: string;
  q?: string;
  status?: string;
  name?: string;
  nameExact?: boolean;
  nameId?: string;
  phone?: string;
  phoneExact?: boolean;
  phoneId?: string;
}): Promise<SuggestOption[]> {
  return request
    .get<unknown, { options: SuggestOption[] }>('/api/staff/customers/facets', { params: query })
    .then((res) => res.options ?? []);
}

/**
 * v8.0 公开产品搜索（剥离进价）。
 * 后端：GET /api/products/search
 * 公开端自动将 purchasePriceDefault 置为 null。
 */
export function searchProductsPublic(query: {
  keyword?: string;
  categoryId?: number;
  status?: number;
  page?: number;
  size?: number;
}): Promise<SearchProductResult> {
  return request.get<unknown, SearchProductResult>('/api/products/search', {
    params: query,
  });
}

// ============================================================
// §12 SKU 选项（/api/staff/products/sku/options）—— v8.0 新增
// 第二段查询：按 brandId 返回该品牌下所有单位及全部售价/进价
// 用于列表下拉切换（单位/售价/进价）
// 公开端：剥离 purchasePrices / minPurchasePrice / minPurchaseSupplier
// ============================================================

/**
 * v14.0 SKU 选项（员工端，含进价）。
 * 后端：GET /api/staff/products/sku/options
 * v14.0：入参 specBrandId（规格×品牌关联 ID，SKU = 规格变体 × 品牌 × 单位）
 */
export function getSkuOptions(specBrandId: string): Promise<SkuOptionResult> {
  return request.get<unknown, SkuOptionResult>('/api/staff/products/sku/options', {
    params: { specBrandId },
  });
}

/**
 * v11.14 按 specId + brandId 解析 specBrandId（单据行只落 specId/brandId，
 * 换单位查价格/换算率需定位 spec×品牌组合）。
 * 后端：GET /api/staff/products/spec-brands/resolve?specId=&brandId=
 * @returns specBrandId；组合不存在返回 null
 */
export function resolveSpecBrand(specId: string, brandId: string): Promise<{ specBrandId: string | null }> {
  return request.get<unknown, { specBrandId: string | null }>('/api/staff/products/spec-brands/resolve', {
    params: { specId, brandId },
  });
}

/**
 * v14.0 公开 SKU 选项（剥离进价）。
 * 后端：GET /api/products/sku/options
 * 公开端自动将 purchasePrices 置为空数组，minPurchasePrice/minPurchaseSupplier 置为 null。
 */
export function getSkuOptionsPublic(specBrandId: string): Promise<SkuOptionResult> {
  return request.get<unknown, SkuOptionResult>('/api/products/sku/options', {
    params: { specBrandId },
  });
}

// ============================================================
// §13 输入框检索（/api/staff/products/suggest）—— v8.0 新增
// 所有输入框（产品/品牌/规格型号/单位/分类/价格类型/供应商名）边输入边检索
// 返回下拉列表，支持「新建」「选择默认值」「选取已有项」
// - priceType：从 sale_price.priceType 去重检索
// - supplierName：从 purchase_price.supplierName 去重检索
// - v8.0：specModel 从 product.specModel 去重检索（替代 spec 字段）
// ============================================================

/**
 * v8.0 输入框检索（员工端）。
 * 后端：GET /api/staff/products/suggest
 *
 * @param field 字段类型：product/brand/specModel/unit/category/priceType/supplierName
 * @param keyword 搜索关键词
 * @param options.productId 上下文产品 ID（brand/specModel/unit 检索时按产品过滤）
 */
export function suggest(
  field: SuggestField,
  keyword: string,
  options?: { productId?: string },
): Promise<{ options: SuggestOption[] }> {
  return request.get<unknown, { options: SuggestOption[] }>(
    '/api/staff/products/suggest',
    { params: { field, keyword, ...options } },
  );
}

/**
 * v8.0 公开输入框检索。
 * 后端：GET /api/products/suggest
 */
export function suggestPublic(
  field: SuggestField,
  keyword: string,
  options?: { productId?: string },
): Promise<{ options: SuggestOption[] }> {
  return request.get<unknown, { options: SuggestOption[] }>('/api/products/suggest', {
    params: { field, keyword, ...options },
  });
}

// ============================================================
// §14 产品建档/编辑（/api/staff/products/save）—— v9.0 事务
// 后端事务流程：
//   1. 创建/更新 product（SPU = name + specModel）
//   2. 创建/更新 brand（单字段 name，无品牌则「无品牌」）
//   3. 处理 unit 列表（挂 SPU，isBase/isDisplay 互斥）
//   4. 处理 brand_unit_conversion 换算率（品牌×单位中间表）
//   5. 保存售价（priceType 字符串）/ 进价（supplierId 外键 + isDefault）
//   6. 保存图片（依附品牌）
//   7. 刷新 product_sku_search 宽表
// ============================================================

/**
 * v8.0 产品建档/编辑事务入口。
 * 后端：POST /api/staff/products/save
 * - input.id 为空 → 新建
 * - input.id 不为空 → 编辑
 */
export function saveProduct(data: SaveProductInput): Promise<ProductView> {
  return request.post<unknown, ProductView>('/api/staff/products/save', data);
}

// ============================================================
// §15 快速建档（/api/staff/products/quick-create）—— v8.0 新增
// 最小必填：产品名 + 规格型号 + 一个单位
// 幂等：同名产品/同品牌/同单位均不重复创建
// 自动：未指定分类 → 按 name ensure「未分类」记录；未指定品牌 → 「普通品牌」
// 返回 { product, brand, unit }（v8.0：无 spec）
// ============================================================

/**
 * v8.0 快速建档（v11.7 增加相似档案候选提示）。
 * 后端：POST /api/staff/products/quick-create
 * 返回 v11.7 响应：{ status: 'ok', result } / { status: 'suggestion', candidates }
 */
export function quickCreateProduct(
  data: QuickCreateProductInput,
): Promise<QuickCreateProductResponse> {
  return request.post<unknown, QuickCreateProductResponse>(
    '/api/staff/products/quick-create',
    data,
  );
}

// ============================================================
// §16 单位换算辅助（/api/staff/products/convert-qty）—— v8.0 保留
// 用于配货环节「1根=4米，配1包零几根」计算
// 入参：qty + fromConversionRate + toConversionRate
// 出参：换算后数量（保留4位小数）
// ============================================================

/**
 * v8.0 单位换算。
 * 后端：POST /api/staff/products/convert-qty
 * 计算公式：result = (qty × fromConversionRate) / toConversionRate
 */
export function convertQty(
  qty: number,
  fromConversionRate: number | string,
  toConversionRate: number | string,
): Promise<{ qty: number }> {
  return request.post<unknown, { qty: number }>('/api/staff/products/convert-qty', {
    qty,
    fromConversionRate,
    toConversionRate,
  });
}

// ============================================================
// §17 供应商管理（/api/staff/suppliers）—— 保留（单据体系引用）
// ============================================================

/** 供应商列表（后端 paginate() 返回 { list, pagination }） */
export function listSuppliers(query: {
  keyword?: string;
  status?: number | 'all';
  name?: string;
  nameExact?: boolean;
  nameId?: string;
  categoryId?: number;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  /** 表头「经营范围」手输非标：分类名或品牌名命中即可 */
  scopeName?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<SupplierView>> {
  return request.get<unknown, PaginationResult<SupplierView>>('/api/staff/suppliers', {
    params: query,
  });
}

export type SupplierCandidateTier = 'proven' | 'scoped' | 'other';

export interface SupplierCandidateView {
  id: string;
  name: string;
  tier: SupplierCandidateTier;
}

export interface SupplierCandidatesResult {
  proven: SupplierCandidateView[];
  scoped: SupplierCandidateView[];
  others: SupplierCandidateView[];
}

/** 进价/选品：按 SKU 推荐供应渠道（已进价 → 经营范围 → 其余） */
export function listSupplierCandidates(query: {
  categoryId?: number;
  brandId?: string;
  unitId?: string;
  keyword?: string;
}): Promise<SupplierCandidatesResult> {
  return request.get<unknown, SupplierCandidatesResult>('/api/staff/suppliers/candidates', {
    params: query,
  });
}

export type SupplierPickerEntryView = 'loose' | 'name' | 'contact' | 'address';

export interface SupplierSearchHit {
  id: string;
  name: string;
  phone: string | null;
  hitLine: string | null;
}

export function searchSuppliers(
  keyword: string,
  limit = 10,
  entryView: SupplierPickerEntryView = 'loose',
): Promise<SupplierSearchHit[]> {
  return request.get<unknown, SupplierSearchHit[]>('/api/staff/suppliers/search', {
    params: { keyword, limit, entryView },
  });
}

/** 供应商详情（含关联计数） */
export function getSupplier(id: string): Promise<SupplierView> {
  return request.get<unknown, SupplierView>(`/api/staff/suppliers/${id}`);
}

export function createSupplier(data: CreateSupplierInput): Promise<SupplierView> {
  return request.post<unknown, SupplierView>('/api/staff/suppliers', data);
}

export function quickAddSupplier(data: QuickAddSupplierInput): Promise<SupplierView> {
  return request.post<unknown, SupplierView>('/api/staff/suppliers/quick-add', data);
}

export function updateSupplier(id: string, data: UpdateSupplierInput): Promise<SupplierView> {
  return request.patch<unknown, SupplierView>(`/api/staff/suppliers/${id}`, data);
}

export function setSupplierStatus(
  id: string,
  status: number,
): Promise<SupplierView> {
  return request.post<unknown, SupplierView>(`/api/staff/suppliers/${id}/status`, {
    status,
  });
}

export function batchSetSupplierStatus(
  ids: string[],
  status: number,
): Promise<{ count: number; status: number }> {
  return request.post<unknown, { count: number; status: number }>(
    '/api/staff/suppliers/batch-status',
    { ids, status },
  );
}

/**
 * v11.0 解耦：查询供应商引用计数（删除确认时调用）
 * 返回 purchasePriceCount / allocationCount / costCount / totalRefs
 */
export function getSupplierRefCounts(id: string): Promise<{
  supplierId: string;
  purchasePriceCount: number;
  allocationCount: number;
  costCount: number;
  totalRefs: number;
}> {
  return request.get(`/api/staff/suppliers/${id}/ref-counts`);
}

/**
 * v11.0 解耦：删除供应商（物理删除，允许被引用）
 * 解耦后业务记录通过 supplierName 快照字段独立存在，档案删除不影响业务展示
 * 返回 supplierId + supplierName + deletedRefCounts
 */
export function deleteSupplier(id: string): Promise<{
  supplierId: string;
  supplierName: string;
  deletedRefCounts: {
    purchasePriceCount: number;
    allocationCount: number;
    costCount: number;
    totalRefs: number;
  };
}> {
  return request.delete(`/api/staff/suppliers/${id}`);
}

// ============================================================
// §17.1 联系方式方式字典（/api/staff/contact-methods）—— v1.7.1.5 新增
// 对齐 price_type 全局字典范式：供应商联系信息方式可自由维护
// （自由输入新增 + 已有值点选），不靠代码级改动加值
// ============================================================

/** 方式字典全量列表（按 sortOrder 升序） */
export function listContactMethods(): Promise<ContactMethodView[]> {
  return request.get<unknown, ContactMethodView[]>('/api/staff/contact-methods');
}

export function createContactMethod(data: CreateContactMethodInput): Promise<ContactMethodView> {
  return request.post<unknown, ContactMethodView>('/api/staff/contact-methods', data);
}

export function updateContactMethod(
  id: string,
  data: UpdateContactMethodInput,
): Promise<ContactMethodView> {
  return request.patch<unknown, ContactMethodView>(`/api/staff/contact-methods/${id}`, data);
}

export function deleteContactMethod(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/contact-methods/${id}`);
}

export interface CustomerTypeView {
  id: string;
  name: string;
  sortOrder: number;
  status: number;
}

export function listCustomerTypes(): Promise<CustomerTypeView[]> {
  return request.get<unknown, CustomerTypeView[]>('/api/staff/customer-types');
}

export function createCustomerType(data: { name: string }): Promise<CustomerTypeView> {
  return request.post<unknown, CustomerTypeView>('/api/staff/customer-types', data);
}

export function updateCustomerType(
  id: string,
  data: { name?: string; status?: number },
): Promise<CustomerTypeView> {
  return request.patch<unknown, CustomerTypeView>(`/api/staff/customer-types/${id}`, data);
}

export function deleteCustomerType(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/customer-types/${id}`);
}

export interface AddressTypeView {
  id: string;
  name: string;
  sortOrder: number;
  status: number;
}

export function listAddressTypes(): Promise<AddressTypeView[]> {
  return request.get<unknown, AddressTypeView[]>('/api/staff/address-types');
}

export function quickAddAddressType(name: string): Promise<AddressTypeView & { reused: boolean }> {
  return request.post<unknown, AddressTypeView & { reused: boolean }>(
    '/api/staff/address-types/quick-add',
    { name },
  );
}

export function updateAddressType(
  id: string,
  data: { name?: string; sortOrder?: number; status?: number },
): Promise<AddressTypeView> {
  return request.patch<unknown, AddressTypeView>(`/api/staff/address-types/${id}`, data);
}

export function deleteAddressType(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/address-types/${id}`);
}

export function addressTypeRefCount(
  id: string,
): Promise<{ suppliers: number }> {
  return request.get<unknown, { suppliers: number }>(
    `/api/staff/address-types/${id}/ref-counts`,
  );
}

// ============================================================
// §18 客户管理（员工端，/api/staff/customers）—— 保留
// ============================================================

/** 客户列表（后端 paginate() 返回 { list, pagination }，每条记录含 count 字段） */
export function listCustomers(query: {
  keyword?: string;
  status?: string;
  name?: string;
  nameExact?: boolean;
  nameId?: string;
  phone?: string;
  phoneExact?: boolean;
  phoneId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<CustomerView>> {
  return request.get<unknown, PaginationResult<CustomerView>>('/api/staff/customers', {
    params: query,
  });
}

/** 客户匹配检索（前 N 条，用于新建单据时的快速匹配） */
export function searchCustomers(
  keyword: string,
  limit = 10,
  entryView: 'loose' | 'name' | 'contact' | 'address' | 'invoice' = 'loose',
): Promise<CustomerSearchItem[]> {
  return request.get<unknown, CustomerSearchItem[]>('/api/staff/customers/search', {
    params: { keyword, limit, entryView },
  });
}

/** 客户详情（含地址列表） */
export function getCustomer(
  id: string,
): Promise<CustomerView & { customerAddresses?: CustomerAddressView[] }> {
  return request.get<unknown, CustomerView & { customerAddresses?: CustomerAddressView[] }>(
    `/api/staff/customers/${id}`,
  );
}

/** 快速新建客户：phone 与 name 至少填一个 */
export function quickAddCustomer(data: QuickAddCustomerInput): Promise<CustomerView> {
  return request.post<unknown, CustomerView>('/api/staff/customers/quick-add', data);
}

/** 更新客户档案（phone 变更时后端校验 unique，冲突时抛错） */
export function updateCustomer(id: string, data: UpdateCustomerInput): Promise<CustomerView> {
  return request.patch<unknown, CustomerView>(`/api/staff/customers/${id}`, data);
}

/**
 * v11.0 解耦：设置客户状态（active/disabled）
 * 停用后不可作为新单据客户，已存在单据不受影响（使用快照字段）
 */
export function setCustomerStatus(
  id: string,
  status: 'active' | 'disabled',
): Promise<CustomerView> {
  return request.post(`/api/staff/customers/${id}/status`, { status });
}

/**
 * v11.0 解耦：查询客户引用计数（删除确认时调用）
 * 返回 documentCount / auditLogCount / totalRefs
 */
export function getCustomerRefCounts(id: string): Promise<{
  customerId: string;
  documentCount: number;
  auditLogCount: number;
  totalRefs: number;
}> {
  return request.get(`/api/staff/customers/${id}/ref-counts`);
}

/**
 * v11.0 解耦：删除客户（物理删除，允许被引用）
 * 解耦后单据通过 customerName/customerPhone/customerCompany 快照字段独立存在
 * 客户档案删除后，单据展示/统计不受影响
 */
export function deleteCustomer(id: string): Promise<{
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  deletedRefCounts: {
    documentCount: number;
    auditLogCount: number;
    totalRefs: number;
  };
}> {
  return request.delete(`/api/staff/customers/${id}`);
}

// ============================================================
// §18.1 客户地址（v9.4 下钻式子表 CRUD，/api/staff/customers/:id/addresses）
// ============================================================

/** 列出客户的所有地址（按 isDefault 优先 + updatedAt 倒序） */
export function listCustomerAddresses(customerId: string): Promise<CustomerAddressView[]> {
  return request.get<unknown, CustomerAddressView[]>(
    `/api/staff/customers/${customerId}/addresses`,
  );
}

/** 新增客户地址（isDefault=true 时后端自动清除其他默认） */
export function createCustomerAddress(
  customerId: string,
  data: CreateCustomerAddressInput,
): Promise<CustomerAddressView> {
  return request.post<unknown, CustomerAddressView>(
    `/api/staff/customers/${customerId}/addresses`,
    data,
  );
}

/** 更新客户地址（部分字段更新，支持行内编辑场景） */
export function updateCustomerAddress(
  customerId: string,
  id: string,
  data: UpdateCustomerAddressInput,
): Promise<CustomerAddressView> {
  return request.patch<unknown, CustomerAddressView>(
    `/api/staff/customers/${customerId}/addresses/${id}`,
    data,
  );
}

/** 删除客户地址 */
export function deleteCustomerAddress(
  customerId: string,
  id: string,
): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(
    `/api/staff/customers/${customerId}/addresses/${id}`,
  );
}
