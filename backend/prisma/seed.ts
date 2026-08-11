// v9.0 种子数据初始化（扁平分类 + SPU 合并模型 + 品牌单字段 + 单位挂 SPU + 品牌单位换算 + 价格分表 + SKU 检索宽表）
//
// v9.0 核心设计：
//   1. SPU 合并：product 表含 name + specModel（产品名称+规格型号合并为一条 SPU 记录）
//      移除 spec 表、brand_spec_rel 表
//   2. 品牌单字段：brand（brandName+seriesName 合并为单字段 name）
//      同一品牌的不同系列视为不同 SPU
//   3. 单位挂 SPU：unit.productId（单位从属于 SPU）
//      isBase / isDisplay 在单位表（Boolean 标记，同一 SPU 各有且仅有一个）
//   4. 品牌单位换算（v9.0 新增）：brand_unit_conversion 按 brand+unit 独立存储换算系数
//      移除 unit.conversionRate（原 v8.0 同 SPU 共享换算率，v9.0 按品牌独立）
//   5. SKU = SPU + 品牌 + 单位：三者组合唯一确定（无 specId）
//      sale_price: @@unique([brandId, unitId, priceType])
//      purchase_price: @@unique([brandId, unitId, supplierId])
//   6. 价格分表存储：sale_price（售价，priceType 字符串）+ purchase_price（进价，supplierId 外键）
//   7. SKU 检索宽表：product_sku_search 每个 brand 一行宽表记录，含 specModel + 品牌优先排序
//   8. supplier 独立表（v9.0 重构）：suppliers → supplier
//      contacts Json + businessScope + address + remark + Int status
//      purchase_price.supplierName → supplierId（外键关联 supplier 表）
//
// 导入顺序（严格按外键依赖）：
//   1. 清空旧业务数据（逆序删除，幂等执行）
//   2. 角色/员工/系统配置/客户/授权码（基础配置，保留现有）
//   3. 扁平分类 category
//   4. 供应商 supplier（v9.0：在产品数据之前创建，因 purchase_price 需引用 supplierId）
//   5. 产品主体 product（SPU = name + specModel）
//   6. 品牌 brand（单字段 name，从属 SPU）
//   7. 单位 unit（挂 SPU，含 isBase/isDisplay，换算率迁至 brand_unit_conversion）
//   8. 品牌单位换算 brand_unit_conversion（v9.0 新增）
//   9. 售价 sale_price（priceType 字符串，SKU = brandId + unitId + priceType）
//  10. 进价 purchase_price（supplierId 外键 + isDefault，SKU = brandId + unitId + supplierId）
//  11. 同步 SKU 检索宽表 product_sku_search（调用 syncSkuSearchByBrand，复用运行时逻辑）

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateCustomerCode, generateUserCode } from '../src/utils/code-generator.js';
import { syncSkuSearchByBrand } from '../src/services/productService.js';

const prisma = new PrismaClient();

// 导航叶子权限默认矩阵（运行时以 DB 为准）
const masterNone = {
  demand_pending: 'rw',
  quote_confirmed: 'rw',
  payment_settled: 'rw',
  allocation_in_progress: 'rw',
  delivery_completed: 'rw',
  cost_verified: 'rw',
  after_sales: 'rw',
  sales_summary: 'rw',
  archive: 'rw',
  product_manage: 'ro',
  customer_manage: 'ro',
  supplier_manage: 'ro',
  auth_code_manage: 'ro',
  access_request_manage: 'ro',
  user_manage: 'ro',
  audit_log_manage: 'ro',
  role_manage: 'ro',
} as const;

const systemNone = {
  demand_pending: 'ro',
  quote_confirmed: 'ro',
  payment_settled: 'ro',
  allocation_in_progress: 'ro',
  delivery_completed: 'ro',
  cost_verified: 'ro',
  after_sales: 'ro',
  sales_summary: 'ro',
  product_manage: 'rw',
  customer_manage: 'rw',
  supplier_manage: 'rw',
  auth_code_manage: 'rw',
  access_request_manage: 'rw',
  user_manage: 'rw',
  audit_log_manage: 'rw',
  role_manage: 'rw',
} as const;

const VIEW_PERMISSIONS = {
  sales: {
    demand_pending: 'rw',
    quote_confirmed: 'rw',
    payment_settled: 'ro',
    allocation_in_progress: 'ro',
    delivery_completed: 'ro',
    cost_verified: 'rw',
    after_sales: 'rw',
    sales_summary: 'ro',
    archive: 'ro',
    product_manage: 'ro',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    auth_code_manage: 'ro',
    access_request_manage: 'none',
    user_manage: 'none',
    audit_log_manage: 'none',
    role_manage: 'none',
  },
  allocator: {
    demand_pending: 'ro',
    quote_confirmed: 'ro',
    payment_settled: 'ro',
    allocation_in_progress: 'rw',
    delivery_completed: 'rw',
    cost_verified: 'ro',
    after_sales: 'ro',
    sales_summary: 'ro',
    archive: 'ro',
    product_manage: 'ro',
    customer_manage: 'ro',
    supplier_manage: 'ro',
    auth_code_manage: 'none',
    access_request_manage: 'none',
    user_manage: 'none',
    audit_log_manage: 'none',
    role_manage: 'none',
  },
  cashier: {
    demand_pending: 'ro',
    quote_confirmed: 'ro',
    payment_settled: 'rw',
    allocation_in_progress: 'ro',
    delivery_completed: 'ro',
    cost_verified: 'ro',
    after_sales: 'ro',
    sales_summary: 'rw',
    archive: 'ro',
    product_manage: 'none',
    customer_manage: 'ro',
    supplier_manage: 'ro',
    auth_code_manage: 'none',
    access_request_manage: 'none',
    user_manage: 'none',
    audit_log_manage: 'none',
    role_manage: 'none',
  },
  delivery: {
    demand_pending: 'ro',
    quote_confirmed: 'ro',
    payment_settled: 'ro',
    allocation_in_progress: 'ro',
    delivery_completed: 'rw',
    cost_verified: 'ro',
    after_sales: 'ro',
    sales_summary: 'ro',
    archive: 'ro',
    product_manage: 'none',
    customer_manage: 'ro',
    supplier_manage: 'ro',
    auth_code_manage: 'none',
    access_request_manage: 'none',
    user_manage: 'none',
    audit_log_manage: 'none',
    role_manage: 'none',
  },
  manager: {
    demand_pending: 'rw',
    quote_confirmed: 'rw',
    payment_settled: 'rw',
    allocation_in_progress: 'rw',
    delivery_completed: 'rw',
    cost_verified: 'rw',
    after_sales: 'rw',
    sales_summary: 'rw',
    archive: 'rw',
    product_manage: 'rw',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    auth_code_manage: 'rw',
    access_request_manage: 'rw',
    user_manage: 'rw',
    audit_log_manage: 'rw',
    role_manage: 'ro',
  },
  admin: { ...systemNone },
} as const;

// ============================================================
// v9.0 产品数据层样本数据定义
// 覆盖：扁平分类 / SPU(name+specModel) / 品牌(单字段) / 单位(挂SPU,含isBase/isDisplay)
//       / 品牌单位换算(brand_unit_conversion) / 售价(priceType 字符串)
//       / 进价(supplierId 外键 + isDefault) / 供应商(supplier 独立表)
// ============================================================

interface UnitDef {
  unitName: string;
  /** v9.0：换算率不在 unit 表，由 brand_unit_conversion 维护 */
  /** 此处仅用于 seed 脚本中设置 brand_unit_conversion 的参考值 */
  conversionRate: number;
  /** 是否基础单位（库存核算基准） */
  isBase: boolean;
  /** 是否默认显示单位 */
  isDisplay: boolean;
}

interface ProductDef {
  /** 产品名称（SPU 的一部分） */
  name: string;
  /** 规格型号（SPU 的一部分，如「dn25*3.5」「25」「4分」） */
  specModel: string;
  /** 分类名称 */
  categoryName: string;
  /** 备注信息（别名、俗称） */
  remark?: string;
  /** 品牌列表（单字段 name） */
  brands: string[];
  /** 单位列表（挂 SPU，换算率按品牌独立） */
  units: UnitDef[];
}

interface SalePriceDef {
  /** 产品名（用于查找 SPU） */
  productName: string;
  /** 规格型号（用于查找 SPU） */
  specModel: string;
  /** 品牌名 */
  brand: string;
  /** 单位名 */
  unit: string;
  /** 价格类型字符串（如「零售价」「批发价」「工程价」） */
  priceType: string;
  price: number;
}

interface PurchasePriceDef {
  /** 产品名（用于查找 SPU） */
  productName: string;
  /** 规格型号（用于查找 SPU） */
  specModel: string;
  /** 品牌名 */
  brand: string;
  /** 单位名 */
  unit: string;
  /** v9.0：供应商名称（用于查找 supplier 表记录） */
  supplierName: string;
  price: number;
  /** v9.0：是否默认展示进价 */
  isDefault?: boolean;
}

// 扁平分类（v9.0：无父子层级）
const CATEGORIES: Array<{ name: string; sortOrder: number }> = [
  { name: '管材', sortOrder: 1 },
  { name: '五金', sortOrder: 2 },
  { name: '建材', sortOrder: 3 },
];

// v9.0 供应商档案（独立表，purchase_price 引用 supplierId）
const SUPPLIERS: Array<{
  name: string;
  contacts?: Array<{ name: string; method: string; value: string }>;
  businessScope?: string;
  address?: string;
  remark?: string;
}> = [
  {
    name: '供应商A',
    contacts: [
      { name: '张经理', method: '电话', value: '13900001001' },
      { name: '张经理', method: '微信', value: 'zhang_supplier_a' },
    ],
    businessScope: '管材、五金',
    address: '深圳市宝安区某建材市场 A 区',
  },
  {
    name: '供应商B',
    contacts: [
      { name: '李总', method: '电话', value: '13900001002' },
    ],
    businessScope: '管材',
    address: '深圳市龙华区某建材城 B 区',
  },
  {
    name: '供应商C',
    contacts: [
      { name: '王老板', method: '微信', value: 'wang_supplier_c' },
    ],
    businessScope: '建材、管材',
    remark: '新合作供应商',
  },
  {
    name: '供应商D',
    contacts: [
      { name: '赵经理', method: '电话', value: '13900001004' },
      { name: '赵经理', method: '邮箱', value: 'zhao@supplier-d.com' },
    ],
    businessScope: '建材（瓷砖胶、防水）',
    address: '深圳市福田区某建材广场 D 店',
  },
];

// 产品 SPU + 品牌(单字段) + 单位(挂SPU)
// v9.0：产品名称 + 规格型号 = SPU，品牌系列不再拆分为品牌和系列
// 单位换算率按品牌独立（brand_unit_conversion）
const PRODUCTS: ProductDef[] = [
  {
    name: 'PPR热水管',
    specModel: 'dn25*3.5',
    categoryName: '管材',
    remark: '6分管',
    brands: ['伟星', '日丰', '无品牌'],
    units: [
      { unitName: '米', conversionRate: 1, isBase: true, isDisplay: true },
      { unitName: '根', conversionRate: 4, isBase: false, isDisplay: false },
    ],
  },
  {
    name: 'PPR热水管',
    specModel: '4分',
    categoryName: '管材',
    remark: '1/2英寸',
    brands: ['伟星', '日丰'],
    units: [
      { unitName: '米', conversionRate: 1, isBase: true, isDisplay: true },
    ],
  },
  {
    name: 'PPR热水管',
    specModel: '6分',
    categoryName: '管材',
    remark: '3/4英寸',
    brands: ['伟星', '日丰'],
    units: [
      { unitName: '米', conversionRate: 1, isBase: true, isDisplay: true },
      { unitName: '根', conversionRate: 4, isBase: false, isDisplay: false },
    ],
  },
  {
    name: '瓷砖胶',
    specModel: '通用',
    categoryName: '建材',
    remark: '标准型',
    brands: ['无品牌', '德高'],
    units: [
      { unitName: '个', conversionRate: 1, isBase: true, isDisplay: true },
    ],
  },
];

// 售价（v9.0：priceType 字符串，SKU = brandId + unitId + priceType）
const SALE_PRICES: SalePriceDef[] = [
  // PPR热水管 dn25*3.5 · 伟星
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '米', priceType: '零售价', price: 8.5 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '米', priceType: '批发价', price: 7.2 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '米', priceType: '工程价', price: 6.8 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '根', priceType: '零售价', price: 32.0 },
  // PPR热水管 dn25*3.5 · 日丰
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '米', priceType: '零售价', price: 9.8 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '米', priceType: '批发价', price: 8.5 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '根', priceType: '零售价', price: 38.0 },
  // PPR热水管 dn25*3.5 · 无品牌
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '无品牌', unit: '米', priceType: '零售价', price: 7.0 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '无品牌', unit: '根', priceType: '零售价', price: 28.0 },
  // PPR热水管 4分 · 伟星
  { productName: 'PPR热水管', specModel: '4分', brand: '伟星', unit: '米', priceType: '零售价', price: 6.8 },
  // PPR热水管 4分 · 日丰
  { productName: 'PPR热水管', specModel: '4分', brand: '日丰', unit: '米', priceType: '零售价', price: 6.5 },
  // PPR热水管 6分 · 伟星
  { productName: 'PPR热水管', specModel: '6分', brand: '伟星', unit: '米', priceType: '零售价', price: 7.5 },
  { productName: 'PPR热水管', specModel: '6分', brand: '伟星', unit: '米', priceType: '批发价', price: 6.5 },
  { productName: 'PPR热水管', specModel: '6分', brand: '伟星', unit: '根', priceType: '零售价', price: 30.0 },
  // PPR热水管 6分 · 日丰
  { productName: 'PPR热水管', specModel: '6分', brand: '日丰', unit: '米', priceType: '零售价', price: 8.2 },
  // 瓷砖胶 通用 · 无品牌
  { productName: '瓷砖胶', specModel: '通用', brand: '无品牌', unit: '个', priceType: '零售价', price: 45.0 },
  { productName: '瓷砖胶', specModel: '通用', brand: '无品牌', unit: '个', priceType: '批发价', price: 40.0 },
  // 瓷砖胶 通用 · 德高
  { productName: '瓷砖胶', specModel: '通用', brand: '德高', unit: '个', priceType: '零售价', price: 68.0 },
  { productName: '瓷砖胶', specModel: '通用', brand: '德高', unit: '个', priceType: '工程价', price: 60.0 },
];

// 进价（v9.0：supplierId 外键关联 supplier 表 + isDefault 默认展示进价）
// SKU = brandId + unitId + supplierId
const PURCHASE_PRICES: PurchasePriceDef[] = [
  // PPR热水管 dn25*3.5 · 伟星
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '米', supplierName: '供应商A', price: 6.2, isDefault: true },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '米', supplierName: '供应商B', price: 6.5 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '伟星', unit: '根', supplierName: '供应商A', price: 24.0, isDefault: true },
  // PPR热水管 dn25*3.5 · 日丰
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '米', supplierName: '供应商A', price: 5.8 },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '米', supplierName: '供应商C', price: 5.6, isDefault: true },
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '日丰', unit: '根', supplierName: '供应商A', price: 22.0, isDefault: true },
  // PPR热水管 dn25*3.5 · 无品牌
  { productName: 'PPR热水管', specModel: 'dn25*3.5', brand: '无品牌', unit: '米', supplierName: '供应商B', price: 5.0, isDefault: true },
  // PPR热水管 6分 · 伟星
  { productName: 'PPR热水管', specModel: '6分', brand: '伟星', unit: '米', supplierName: '供应商A', price: 5.5, isDefault: true },
  // 瓷砖胶 通用 · 无品牌
  { productName: '瓷砖胶', specModel: '通用', brand: '无品牌', unit: '个', supplierName: '供应商A', price: 35.0, isDefault: true },
  // 瓷砖胶 通用 · 德高
  { productName: '瓷砖胶', specModel: '通用', brand: '德高', unit: '个', supplierName: '供应商D', price: 55.0, isDefault: true },
];

async function main() {
  console.log('开始初始化 v9.0 基础数据（SPU 合并 + 品牌单字段 + 单位挂 SPU + 品牌单位换算 + 价格分表 + SKU 检索宽表）...');

  // ============================================================
  // §1 清空旧业务数据（按外键依赖逆序删除，幂等执行）
  // v9.0：仅引用 v9.0 表名，移除所有已废弃表
  // ============================================================
  console.log('§1 清理旧业务数据（幂等执行，按外键依赖逆序）...');
  // 单据标注层（依赖 document_lines → documents）
  await prisma.reimbursement_bill_lines.deleteMany({}).catch(() => undefined);
  await prisma.reimbursement_bills.deleteMany({}).catch(() => undefined);
  await prisma.archived_refunds.deleteMany({}).catch(() => undefined);
  await prisma.archived_costs.deleteMany({}).catch(() => undefined);
  await prisma.archived_logistics.deleteMany({}).catch(() => undefined);
  await prisma.archived_order_lines.deleteMany({}).catch(() => undefined);
  await prisma.archived_orders.deleteMany({}).catch(() => undefined);
  await prisma.refund_lines.deleteMany({}).catch(() => undefined);
  await prisma.cost_lines.deleteMany({}).catch(() => undefined);
  await prisma.delivery_records.deleteMany({}).catch(() => undefined);
  await prisma.allocation_lines.deleteMany({}).catch(() => undefined);
  await prisma.payment_records.deleteMany({}).catch(() => undefined);
  // 单据层
  await prisma.documents.deleteMany({}).catch(() => undefined);
  // v9.0 产品数据层（逆序：检索宽表 → 价格 → 品牌单位换算 → 图片 → 单位 → 品牌 → 产品 → 分类）
  await prisma.product_sku_search.deleteMany({}).catch(() => undefined);
  await prisma.purchase_price.deleteMany({}).catch(() => undefined);
  await prisma.sale_price.deleteMany({}).catch(() => undefined);
  await prisma.brand_unit_conversion.deleteMany({}).catch(() => undefined);
  await prisma.product_image.deleteMany({}).catch(() => undefined);
  await prisma.unit.deleteMany({}).catch(() => undefined);
  await prisma.brand.deleteMany({}).catch(() => undefined);
  await prisma.product.deleteMany({}).catch(() => undefined);
  await prisma.category.deleteMany({}).catch(() => undefined);
  // v9.0 供应商档案表（supplier，被 purchase_price / allocation_lines / cost_lines 引用）
  await prisma.supplier.deleteMany({}).catch(() => undefined);
  // 其他业务表
  await prisma.customer_addresses.deleteMany({}).catch(() => undefined);
  await prisma.customers.deleteMany({}).catch(() => undefined);
  await prisma.authorization_codes.deleteMany({}).catch(() => undefined);
  await prisma.access_requests.deleteMany({}).catch(() => undefined);
  await prisma.customer_sessions.deleteMany({}).catch(() => undefined);
  await prisma.field_change_logs.deleteMany({}).catch(() => undefined);
  await prisma.audit_logs.deleteMany({}).catch(() => undefined);
  console.log('✓ 旧业务数据清理完成');

  // ============================================================
  // §2 角色（含 view_permissions 视图权限矩阵）
  // ============================================================
  const roles = [
    { code: 'sales', name: '报价员', description: '负责需求确认、报价核算、成本核定、售后处理', is_system: true, view_permissions: VIEW_PERMISSIONS.sales },
    { code: 'allocator', name: '配货员', description: '负责仓库配货、采购调货', is_system: true, view_permissions: VIEW_PERMISSIONS.allocator },
    { code: 'cashier', name: '收银', description: '负责收款对账', is_system: true, view_permissions: VIEW_PERMISSIONS.cashier },
    { code: 'delivery', name: '交付员', description: '负责交付履约', is_system: true, view_permissions: VIEW_PERMISSIONS.delivery },
    { code: 'manager', name: '店长', description: '门店全面管理（除系统管理外全部可读可写）', is_system: true, view_permissions: VIEW_PERMISSIONS.manager },
    { code: 'admin', name: '系统管理员', description: '系统运维：业务全只读巡检，基础数据与系统管理可读可写', is_system: true, view_permissions: VIEW_PERMISSIONS.admin },
  ];
  const roleMap: Record<string, number> = {};
  for (const r of roles) {
    const role = await prisma.roles.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        description: r.description,
        view_permissions: r.view_permissions as object,
      },
      create: {
        code: r.code,
        name: r.name,
        description: r.description,
        is_system: r.is_system,
        view_permissions: r.view_permissions as object,
      },
    });
    roleMap[r.code] = role.id;
  }
  console.log('✓ 6 个角色初始化完成（含视图权限矩阵）');

  // ============================================================
  // §3 员工账号（默认密码 Admin@123）
  // ============================================================
  const password_hash = await bcrypt.hash('Admin@123', 10);
  const staffAccounts = [
    { username: 'admin', real_name: '系统管理员', phone: '13800000000', roles: ['admin'] },
    { username: 'manager01', real_name: '张店长', phone: '13800000001', roles: ['manager'] },
    { username: 'sales01', real_name: '李报价', phone: '13800000002', roles: ['sales'] },
    { username: 'allocator01', real_name: '王配货', phone: '13800000003', roles: ['allocator'] },
    { username: 'cashier01', real_name: '赵收银', phone: '13800000004', roles: ['cashier'] },
    { username: 'delivery01', real_name: '钱交付', phone: '13800000005', roles: ['delivery'] },
  ];
  for (const s of staffAccounts) {
    const user_code = await generateUserCode();
    const user = await prisma.users.upsert({
      where: { username: s.username },
      update: { password_hash, real_name: s.real_name, phone: s.phone, status: 'active' },
      create: { user_code, username: s.username, password_hash, real_name: s.real_name, phone: s.phone, status: 'active' },
    });
    await prisma.user_roles.deleteMany({ where: { user_id: user.id } });
    await prisma.user_roles.createMany({
      data: s.roles.map((role_code) => ({ user_id: user.id, role_id: roleMap[role_code] })),
    });
  }
  console.log('✓ 6 个员工账号初始化完成（默认密码 Admin@123）');

  // ============================================================
  // §4 系统配置
  // ============================================================
  const configs: [string, string, string][] = [
    ['site.name', '建材门店报价协同系统', '站点名称'],
    ['auth.jwt_expires_in', '8h', 'JWT 有效期'],
    ['auth.customer_token_expires_in', '24h', '客户会话有效期'],
    ['auth.code_expires_default', '24h', '默认授权码有效期'],
    ['upload.max_file_size', '10485760', '最大上传文件大小'],
    ['upload.allowed_types', 'jpg,jpeg,png,webp', '允许上传的文件类型'],
    ['search.default_page_size', '20', '默认分页大小'],
    ['search.max_page_size', '100', '最大分页大小'],
    ['document.no_prefix', 'Q', '单据号前缀'],
  ];
  for (const [key, value, description] of configs) {
    await prisma.system_config.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
  }
  console.log('✓ 系统配置初始化完成');

  // ============================================================
  // §5 客户档案 + 地址 + 授权码
  // ============================================================
  const customersData = [
    { phone: '13900000001', name: '陈客户', wechat: 'chen_cust', company: '某某装修公司' },
    { phone: '13900000002', name: '林客户', wechat: 'lin_cust', company: '' },
    { phone: '13900000003', name: '周客户', wechat: '', company: '某某工地' },
  ];
  const customerMap: Record<string, bigint> = {};
  for (const c of customersData) {
    const customer_code = await generateCustomerCode();
    const customer = await prisma.customers.upsert({
      where: { phone: c.phone },
      update: { name: c.name, wechat: c.wechat, company: c.company },
      create: { customer_code, ...c },
    });
    customerMap[c.phone] = customer.id;
  }
  console.log('✓ 3 个客户档案初始化完成');

  const addresses = [
    { customer_phone: '13900000001', label: '公司', contact: '陈客户', phone: '13900000001', province: '广东省', city: '深圳市', district: '福田区', detail: '中心区某号装修现场', isDefault: true },
    { customer_phone: '13900000001', label: '仓库', contact: '陈客户助理', phone: '13900001111', province: '广东省', city: '深圳市', district: '宝安区', detail: '某物流园 B 区 12 号', isDefault: false },
    { customer_phone: '13900000002', label: '家', contact: '林客户', phone: '13900000002', province: '广东省', city: '深圳市', district: '南山区', detail: '某小区 3 栋 18A', isDefault: true },
  ];
  for (const a of addresses) {
    await prisma.customer_addresses.create({
      data: {
        customerId: customerMap[a.customer_phone],
        label: a.label,
        contact: a.contact,
        phone: a.phone,
        province: a.province,
        city: a.city,
        district: a.district,
        detail: a.detail,
        isDefault: a.isDefault,
      },
    });
  }
  console.log('✓ 客户地址初始化完成');

  const adminUser = await prisma.users.findUnique({ where: { username: 'admin' } });
  if (!adminUser) throw new Error('admin 账号未创建');
  const now = new Date();
  const codes = [
    { code: 'ABC12345', phone: '13900000001', status: 'active', expiresAt: new Date(now.getTime() + 24 * 3600 * 1000), source: 'manual', activatedAt: now },
    { code: 'XYZ67890', phone: '13900000002', status: 'active', expiresAt: new Date(now.getTime() + 12 * 3600 * 1000), source: 'manual', activatedAt: now },
    { code: 'PND00001', phone: null, status: 'active', expiresAt: new Date(now.getTime() + 24 * 3600 * 1000), source: 'batch', activatedAt: null },
    { code: 'EXP00002', phone: null, status: 'expired', expiresAt: new Date(now.getTime() - 3600 * 1000), source: 'manual', activatedAt: null },
  ];
  for (const c of codes) {
    await prisma.authorization_codes.upsert({
      where: { code: c.code },
      update: {
        phone: c.phone,
        status: c.status,
        expiresAt: c.expiresAt,
        source: c.source,
        activatedAt: c.activatedAt,
        createdBy: adminUser.id,
      },
      create: { ...c, createdBy: adminUser.id },
    });
  }
  console.log('✓ 4 个授权码初始化完成（含已激活/未激活/已过期）');

  // ============================================================
  // §6 v9.0 产品数据层导入（11 步顺序）
  // SPU 合并模型：category(扁平) → supplier(独立) → product(SPU=name+specModel)
  //   → brand(单字段) → unit(挂SPU) → brand_unit_conversion(品牌单位换算)
  //   → sale_price(priceType 字符串) → purchase_price(supplierId 外键)
  //   → SKU 宽表同步
  // ============================================================
  console.log('---');
  console.log('开始 v9.0 产品数据层导入（SPU 合并 + 品牌单字段 + 单位挂 SPU + 品牌单位换算 + 价格分表 + SKU 检索宽表）...');

  // ---- §6.1 导入扁平分类 category（v9.0：无 parentId 父子层级）----
  const categoryMap: Record<string, number> = {};
  let categoryCount = 0;
  for (const c of CATEGORIES) {
    const cat = await prisma.category.create({
      data: { name: c.name, sortOrder: c.sortOrder, status: 1 },
    });
    categoryMap[c.name] = cat.id;
    categoryCount++;
  }
  console.log(`§6.1 ✓ ${categoryCount} 个扁平分类初始化完成（无父子层级，categoryId=0 表示未分类）`);

  // ---- §6.2 导入供应商 supplier（v9.0：独立表，purchase_price 需引用 supplierId）----
  const supplierMap: Record<string, bigint> = {};
  let supplierCount = 0;
  for (const s of SUPPLIERS) {
    const supplier = await prisma.supplier.create({
      data: {
        name: s.name,
        contacts: s.contacts ?? null,
        businessScope: s.businessScope ?? null,
        address: s.address ?? null,
        remark: s.remark ?? null,
        status: 1,
      },
    });
    supplierMap[s.name] = supplier.id;
    supplierCount++;
  }
  console.log(`§6.2 ✓ ${supplierCount} 个供应商档案初始化完成（v9.0：contacts Json + businessScope + Int status）`);

  // ---- §6.3 导入产品主体 product（SPU = name + specModel）----
  const productMap: Record<string, bigint> = {};
  let productCount = 0;
  for (const p of PRODUCTS) {
    const categoryId = categoryMap[p.categoryName];
    if (!categoryId) throw new Error(`分类「${p.categoryName}」未创建，无法归属产品「${p.name} ${p.specModel}」`);
    const product = await prisma.product.create({
      data: {
        name: p.name,
        specModel: p.specModel,
        categoryId,
        remark: p.remark ?? '',
        status: 1,
      },
    });
    productMap[`${p.name}#${p.specModel}`] = product.id;
    productCount++;
  }
  console.log(`§6.3 ✓ ${productCount} 个产品主体（SPU = name + specModel）初始化完成`);

  // ---- §6.4 导入品牌 brand（单字段 name，从属 SPU）----
  const brandMap: Record<string, bigint> = {};
  let brandCount = 0;
  for (const p of PRODUCTS) {
    const productId = productMap[`${p.name}#${p.specModel}`];
    for (const brandName of p.brands) {
      const brand = await prisma.brand.create({
        data: {
          productId,
          name: brandName,
          sortOrder: brandCount,
          status: 1,
        },
      });
      brandMap[`${p.name}#${p.specModel}#${brandName}`] = brand.id;
      brandCount++;
    }
  }
  console.log(`§6.4 ✓ ${brandCount} 个品牌初始化完成（单字段 name，从属 SPU，无品牌自动建档）`);

  // ---- §6.5 导入单位 unit（挂 SPU，含 isBase/isDisplay，v9.0 无 conversionRate）----
  const unitMap: Record<string, bigint> = {};
  // 同时记录 unitDef 用于后续 brand_unit_conversion
  const unitDefMap: Record<string, UnitDef> = {};
  let unitCount = 0;
  for (const p of PRODUCTS) {
    const productId = productMap[`${p.name}#${p.specModel}`];
    for (const u of p.units) {
      const unit = await prisma.unit.create({
        data: {
          productId,
          unitName: u.unitName,
          // v9.0：unit 表不再有 conversionRate，换算率迁至 brand_unit_conversion
          isBase: u.isBase,
          isDisplay: u.isDisplay,
          status: 1,
        },
      });
      unitMap[`${p.name}#${p.specModel}#${u.unitName}`] = unit.id;
      unitDefMap[`${p.name}#${p.specModel}#${u.unitName}`] = u;
      unitCount++;
    }
  }
  console.log(`§6.5 ✓ ${unitCount} 个单位初始化完成（挂 SPU，v9.0 无 conversionRate，换算率按品牌独立）`);

  // ---- §6.6 导入品牌单位换算 brand_unit_conversion（v9.0 新增）----
  // 每个 brand × unit 组合一条记录，基础单位 conversionRate 强制为 1.0000
  let conversionCount = 0;
  for (const p of PRODUCTS) {
    for (const brandName of p.brands) {
      const brandId = brandMap[`${p.name}#${p.specModel}#${brandName}`];
      for (const u of p.units) {
        const unitId = unitMap[`${p.name}#${p.specModel}#${u.unitName}`];
        if (!brandId || !unitId) continue;
        await prisma.brand_unit_conversion.create({
          data: {
            brandId,
            unitId,
            conversionRate: u.isBase ? 1 : u.conversionRate,
          },
        });
        conversionCount++;
      }
    }
  }
  console.log(`§6.6 ✓ ${conversionCount} 条品牌单位换算初始化完成（v9.0：brand_unit_conversion，基础单位强制为 1）`);

  // ---- §6.7 导入售价 sale_price（priceType 字符串，SKU = brandId + unitId + priceType）----
  let salePriceCount = 0;
  for (const sp of SALE_PRICES) {
    const brandId = brandMap[`${sp.productName}#${sp.specModel}#${sp.brand}`];
    const unitId = unitMap[`${sp.productName}#${sp.specModel}#${sp.unit}`];
    if (!brandId) throw new Error(`售价引用的品牌「${sp.brand}」未创建（产品 ${sp.productName} ${sp.specModel}）`);
    if (!unitId) throw new Error(`售价引用的单位「${sp.unit}」未创建（产品 ${sp.productName} ${sp.specModel}）`);
    await prisma.sale_price.create({
      data: {
        brandId,
        unitId,
        priceType: sp.priceType,
        price: sp.price,
        status: 1,
      },
    });
    salePriceCount++;
  }
  console.log(`§6.7 ✓ ${salePriceCount} 条售价初始化完成（priceType 字符串：零售价/批发价/工程价，SKU = brandId + unitId + priceType）`);

  // ---- §6.8 导入进价 purchase_price（v9.0：supplierId 外键 + isDefault）----
  let purchasePriceCount = 0;
  let multiSupplierSkuCount = 0;
  // 按 SKU 分组统计多供应商比价场景
  const skuSupplierMap: Record<string, Set<string>> = {};
  for (const pp of PURCHASE_PRICES) {
    const skuKey = `${pp.productName}#${pp.specModel}#${pp.brand}#${pp.unit}`;
    if (!skuSupplierMap[skuKey]) skuSupplierMap[skuKey] = new Set();
    skuSupplierMap[skuKey].add(pp.supplierName);
  }
  for (const pp of PURCHASE_PRICES) {
    const brandId = brandMap[`${pp.productName}#${pp.specModel}#${pp.brand}`];
    const unitId = unitMap[`${pp.productName}#${pp.specModel}#${pp.unit}`];
    const supplierId = supplierMap[pp.supplierName];
    if (!brandId) throw new Error(`进价引用的品牌「${pp.brand}」未创建（产品 ${pp.productName} ${pp.specModel}）`);
    if (!unitId) throw new Error(`进价引用的单位「${pp.unit}」未创建（产品 ${pp.productName} ${pp.specModel}）`);
    if (!supplierId) throw new Error(`进价引用的供应商「${pp.supplierName}」未创建`);
    await prisma.purchase_price.create({
      data: {
        brandId,
        unitId,
        supplierId,
        price: pp.price,
        isDefault: pp.isDefault ?? false,
        status: 1,
      },
    });
    purchasePriceCount++;
  }
  for (const k of Object.keys(skuSupplierMap)) {
    if (skuSupplierMap[k].size > 1) multiSupplierSkuCount++;
  }
  console.log(`§6.8 ✓ ${purchasePriceCount} 条进价初始化完成（v9.0：supplierId 外键 + isDefault，含 ${multiSupplierSkuCount} 个多供应商比价场景）`);

  // ---- §6.9 同步 SKU 检索宽表 product_sku_search ----
  let searchIndexCount = 0;
  for (const p of PRODUCTS) {
    for (const brandName of p.brands) {
      const brandId = brandMap[`${p.name}#${p.specModel}#${brandName}`];
      await syncSkuSearchByBrand(brandId);
      searchIndexCount++;
    }
  }
  console.log(`§6.9 ✓ ${searchIndexCount} 条 SKU 检索宽表同步完成（复用 syncSkuSearchByBrand：默认单位+最低价+keywords+specModel，两段式查询优化）`);

  // ============================================================
  // §7 汇总输出
  // ============================================================
  console.log('---');
  console.log('v9.0 基础数据初始化完毕。');
  console.log('v9.0 产品数据层统计：');
  console.log(`  扁平分类：${categoryCount} 个（无父子层级）`);
  console.log(`  供应商档案：${supplierCount} 个（v9.0：contacts Json + businessScope + Int status）`);
  console.log(`  产品主体（SPU = name + specModel）：${productCount} 个`);
  console.log(`  品牌（单字段 name）：${brandCount} 个（含「无品牌」自动建档）`);
  console.log(`  单位（挂 SPU）：${unitCount} 个（v9.0 无 conversionRate，换算率按品牌独立）`);
  console.log(`  品牌单位换算：${conversionCount} 条（v9.0 新增 brand_unit_conversion）`);
  console.log(`  售价：${salePriceCount} 条（priceType 字符串：零售价/批发价/工程价）`);
  console.log(`  进价：${purchasePriceCount} 条（v9.0：supplierId 外键 + isDefault，含 ${multiSupplierSkuCount} 个多供应商比价场景）`);
  console.log(`  SKU 检索宽表：${searchIndexCount} 条（默认单位+最低价+keywords+specModel）`);
  console.log('---');
  console.log('员工登录账号（默认密码 Admin@123）：');
  console.log('  admin / Admin@123 （系统管理员）');
  console.log('  manager01 / Admin@123 （店长）');
  console.log('  sales01 / Admin@123 （报价员）');
  console.log('  allocator01 / Admin@123 （配货员）');
  console.log('  cashier01 / Admin@123 （收银）');
  console.log('  delivery01 / Admin@123 （交付员）');
  console.log('客户授权码：');
  console.log('  13900000001 + ABC12345 （已激活）');
  console.log('  13900000002 + XYZ67890 （已激活）');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
