# 统一表格组件重构规范

> **v9.0 收敛声明（2026-07-25）**：本文档为历史 spec，记录 `UnifiedTable` 组件重构与 Excel 超级表格范式的落地过程。表格组件与交互范式的**唯一现行标准**为 [交互范式规范.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/架构原则/交互范式规范.md)；产品管理的**唯一现行标准**为 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。本文档中涉及产品的早期字段与模型（如 `product_units` / `cost_price` / `sale_price` 直接存于单位表等）已废弃，仅用于追溯。
>
> 顶层依据：用户要求全局所有表格数据通过唯一组件显示，使用成熟的表格组件承载，确保更好的性能。
>
> **版本说明**：本规范合并了原 `edit-logic.md`（v6.2 字段编辑方式推演）的全部内容，统一为单一文档。v6.2 新增章节：第七章（字段编辑方式推演规则）、第八章（多价格类型数据模型）、第九章（三弹窗面板设计）、第十章（业务场景编辑差异）、第十二章（全局效率原则检查清单）。

## 一、设计目标

### 1.1 核心目标
- **唯一表格组件**：全局所有表格数据通过 `UnifiedTable` 组件显示，替代 `SuperGrid` + `TreeGrid`
- **成熟底层**：基于 `antd Table` 封装，利用其虚拟滚动、固定列、排序等成熟特性
- **性能优先**：大数据量场景下虚拟滚动 + 按需渲染
- **全量重写**：旧组件（SuperGrid/TreeGrid）全部删除，不留旧代码

### 1.2 表格结构（固定）
```
| 操作列(固定) | 序号列 | 数据列1 | 数据列2 | ... | 数据列N |
```
1. **首列固定为操作扩展列**：显示三个按钮
   - 勾选（Checkbox）
   - 删除（DeleteOutlined）
   - 扩展按钮（MoreOutlined + Dropdown：插入上方/插入下方/复制行等）
2. **第二列为序号列**：自动编号
3. **后续为数据列**：由调用方定义

### 1.3 行内编辑交互
1. **clickToEdit**：点击单元格进入编辑态，聚焦时转换为输入框
2. **浮动面板辅助录入**：根据列编辑特性提供
   - 实时匹配列表面板（如产品搜索：ProductPicker）
   - 数据输入弹窗表单（如产品维护：ProductEditDialog）
   - 枚举选择面板（如单位选择：UnitPicker）
3. **键盘导航**：Enter(下移) / Esc(回滚) / Tab(右移) / Shift+Tab(左移) / ArrowUp/Down

### 1.4 工具栏
- 凡是显示表格结构化数据的地方，必须在表格顶部提供工具栏
- 工具栏放辅助快捷操作（如采购视图的识别订单、添加物料）
- 通过 `toolbar` prop 传入 ReactNode

### 1.5 空行填充
- 默认 13 空行 + 自动扩充（剩余空行 < 1 时追加新空行）
- 可通过 `disableEmptyRows` 禁用（只读视角）

## 二、UnifiedTable 组件设计

### 2.1 Props 接口
```typescript
interface UnifiedTableProps<T extends Record<string, any>> {
  columns: UnifiedTableColumn<T>[];
  rows: T[];
  rowKey?: string | ((record: T, index: number) => string);
  
  /** 空行填充 */
  pageSize?: number;                    // 默认 13
  disableEmptyRows?: boolean;           // 禁用空行填充（只读视角）
  emptyRowFactory?: () => T;            // 创建空行的工厂函数
  
  /** 编辑回调 */
  onChange?: (rows: T[]) => void;
  onCellCommit?: (rowIndex: number, columnKey: string, value: any, record: T) => void;
  
  /** 操作列 */
  selectable?: boolean;                 // 是否显示勾选 checkbox（默认 true）
  onSelectionChange?: (selectedRowKeys: string[], selectedRows: T[]) => void;
  moreMenuRenderer?: (record: T, rowIndex: number) => ReactNode;
  
  /** 工具栏 */
  toolbar?: ReactNode;
  
  /** 性能 */
  virtual?: boolean;                    // 虚拟滚动（默认 true，数据量 > 50 时自动启用）
  scroll?: { x?: number; y?: number };
  
  loading?: boolean;
  className?: string;
}
```

### 2.2 列定义
```typescript
interface UnifiedTableColumn<T> {
  key: string;
  title: string;
  dataIndex?: keyof T;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
  
  /** 渲染模式 */
  renderMode: 'static' | 'text' | 'number' | 'picker' | 'custom';
  
  /** static / custom 模式渲染函数 */
  render?: (value: any, record: T, rowIndex: number) => ReactNode;
  
  /** picker 模式渲染函数 */
  renderEditor?: (
    value: any, record: T, rowIndex: number,
    anchorRef: React.RefObject<HTMLElement | null>,
    onCommit: (val: any) => void,
    onCancel: () => void,
  ) => ReactNode;
  
  /** picker 复合对象展开 */
  onCommitTransform?: (value: any, record: T) => Partial<T>;
  
  placeholder?: string;
  ellipsis?: boolean;
  isDisabled?: (record: T) => boolean;
}
```

### 2.3 renderMode 五种模式
| 模式 | 用途 | 行为 |
|------|------|------|
| `static` | 静态文本（序号、图片、金额等） | 不可编辑 |
| `text` | clickToEdit 文本输入 | `<input type="text">` |
| `number` | clickToEdit 数字输入 | `<input type="text" inputMode="decimal">` |
| `picker` | clickToEdit + 浮动面板 | 渲染 Picker 组件（ProductPicker/UnitPicker/PricePicker 等） |
| `custom` | 自定义渲染 | 不可编辑 |

### 2.4 操作列（自动生成）
- 始终为首列，`fixed: 'left'`
- 宽度 80px
- 内容：
  - Checkbox（selectable=true 时）
  - DeleteOutlined（删除当前行）
  - MoreOutlined + Dropdown（moreMenuRenderer 提供的菜单项）

## 三、快速新建功能

### 3.1 核心原则
- **全局化**：凡是有下拉列表匹配的地方都必须提供"快速新建"选项（ProductPicker / CategoryPicker / BrandPicker 等）
- 实时匹配列表第一行永远是"快速新建: [输入内容]"
- 不管有没有匹配结果，都提供快速新建选项
- 快速新建只需最小必填信息（产品名称+单位 / 分类名称 / 品牌名称）
- 其他信息后续维护

### 3.2 交互流程
```
用户输入"25伟星弯头"
  → 防抖 250ms → searchVariants(kw)
  → 匹配列表第一行显示：[+] 快速新建: 25伟星弯头
  → 匹配列表后续行显示：搜索结果...
  → 用户点击"快速新建"
  → 后端 quickCreateVariant({ productName: "25伟星弯头", unit: "个" })
  → 返回完整变体信息 → onPick
```

### 3.3 后端 API
- `POST /api/staff/variants/quick-create`
- 入参：`{ productName: string, unit: string, brandName?: string, spec?: string }`
- 逻辑：
  1. 查找或创建 product_categories（按 productName）
  2. 查找或创建 brands（按 brandName，如果提供了）
  3. 创建 product_variants（productCategoryId + brandId + spec）
  4. 创建 product_units（unit + isBase=true + isDefault=true）
  5. 创建 product_sale_prices（salePrice=null，未定价；v6.2 起关联默认 priceType）
  6. 同步 product_search_index
  7. 返回完整变体信息（VariantSearchRow 格式）

## 四、产品管理页面重构

### 4.1 页面结构
- 删除 6 tab 结构（CategoryPanel/BrandPanel/ProductCategoryPanel/SupplierPanel/VariantPanel/VariantWorkbench）
- 改为**单一表格 + 弹窗表单**

### 4.2 表格列结构（SKU 级展示）
```
| 操作 | 序号 | 主图 | 产品全名(品牌+名称+规格) | 分类 | 品牌 | 规格 | 单位 | 售价 | 进价 | 状态 | 更新时间 |
```
- **SKU 级展示**：每行 = 一个变体+一个单位 = 一个 SKU
- **进价显示实际值**：显示最低进价（而非进价数量）
- **售价显示实际值**：显示该单位的销售价（v6.2 起为默认价格类型的售价）
- **所有数据列可编辑**：
  - 产品全名/品牌/规格/单位/售价/进价 → 点击进入变体弹窗修改（下划线链接文本）
  - 分类 → 点击弹出 CategoryPicker（下划线链接文本）
  - 状态 → 直接切换

### 4.3 弹窗表单设计（ProductEditDialog）
```
┌─────────────────────────────────────────────────────┐
│  产品编辑                                      ✕    │
├─────────────────────────────────────────────────────┤
│  产品名称: [PPR热水管                              ] │  ← SPU（产品主体）
│  分　　类: [▾ 管材 / PPR水管                       ] │
├─────────────────────────────────────────────────────┤
│  SKU 列表（品牌+规格+单位+售价+进价）                │
│  ┌──┬──────┬──────────┬──────┬──────┬──────┬─────┐ │
│  │操│ 品牌 │ 规格     │ 单位 │ 售价 │ 进价 │操作│ │
│  ├──┼──────┼──────────┼──────┼──────┼──────┼─────┤ │
│  │☐ │日丰  │DN25×3.5  │ 米  │ 5.50 │ 3.30 │ ⋯  │ │  ← SKU 行
│  │☐ │日丰  │DN25×3.5  │ 根  │22.00 │21.20 │ ⋯  │ │
│  │☐ │伟星  │DN25×3.5  │ 米  │ 5.30 │ 3.10 │ ⋯  │ │
│  │  │[新增]│          │     │      │      │     │ │  ← 空行
│  └──┴──────┴──────────┴──────┴──────┴──────┴─────┘ │
│                            [+ 添加SKU行]            │
├─────────────────────────────────────────────────────┤
│                          [取消]  [保存]             │
└─────────────────────────────────────────────────────┘
```

### 4.4 SPU + SKU 模型
- **SPU（产品主体）**：产品名称 + 分类（一个弹窗一个 SPU）
- **SKU（商品变体）**：品牌 + 规格 + 单位 + 售价 + 进价（一个 SPU 下多个 SKU）
- 一个弹窗内批量编辑所有 SKU，可视化方便
- 不需要在不同表之间跳转

## 五、全局替换计划

### 5.1 需要替换的组件
- `SuperGrid` → `UnifiedTable`（所有使用场景）
- `TreeGrid` → `UnifiedTable`（树形数据用 expandable 实现）

### 5.2 需要替换的页面
- 产品管理（6 tab → 单一表格+弹窗）
- 采购报价（PurchaseQuote）
- 配货视图（AllocationView）
- 成本核定（CostVerify）
- 退换售后（RefundAfterSale）
- 销售汇总（SalesSummary）
- 报销单（ReimbursementBillPanel）
- 客户端采购清单（PurchaseList）

### 5.3 需要删除的文件
- `frontend/src/shared/components/SuperGrid.tsx`
- `frontend/src/shared/components/TreeGrid.tsx`
- `frontend/src/apps/staff/pages/product-manage/CategoryPanel.tsx`
- `frontend/src/apps/staff/pages/product-manage/BrandPanel.tsx`
- `frontend/src/apps/staff/pages/product-manage/ProductCategoryPanel.tsx`
- `frontend/src/apps/staff/pages/product-manage/SupplierPanel.tsx`
- `frontend/src/apps/staff/pages/product-manage/VariantPanel.tsx`
- `frontend/src/apps/staff/pages/product-manage/VariantWorkbench.tsx`
- `frontend/src/apps/staff/pages/product-manage/ProductUnitDrawer.tsx`
- `frontend/src/apps/staff/pages/product-manage/VariantSalePriceDrawer.tsx`
- `frontend/src/apps/staff/pages/product-manage/VariantPurchasePriceDrawer.tsx`
- `frontend/src/shared/components/QuickCreateProductPanel.tsx`（旧版快速新建）

## 六、字段编辑类型规范

> 本章从**视觉与交互**角度划分字段编辑类型；第七章从**数据关系**角度推演编辑规则。两者互补：本章定义"看起来怎样"，第七章定义"为什么这样"。

### 6.1 编辑类型分类

| 类型 | 特征 | 交互方式 | 视觉提示 |
|------|------|---------|---------|
| **变体弹窗型** | 字段值存在于变体（SKU）级别，涉及多单位/多价格 | 点击 → 打开变体弹窗修改 | 下划线链接文本（蓝色+下划线） |
| **Picker 搜索型** | 关联数据（分类/品牌/供应商），需搜索匹配 | 点击 → 弹出 Picker 浮动面板 | 下划线链接文本 |
| **直接输入型** | 简单标量（数量/备注/排序号） | 点击 → 直接输入框 | 普通文本 |

### 6.2 变体弹窗型字段（产品管理）
以下字段因为**存在变体**（多单位/多价格/多供应商），必须通过变体弹窗修改：
- **规格** → 一个 SPU 可有多个规格变体
- **单位** → 一个变体可有多个单位（含换算系数）
- **售价** → 绑定在变体+单位+价格类型上（v6.2：一个单位可有多个价格类型售价）
- **进价** → 绑定在变体+单位+供应商上（一个单位多个供应商进价）
- **品牌** → 一个 SPU 可有多个品牌变体

### 6.3 下划线视觉提示
- `picker` 和 `custom`（弹窗型）模式的列 → 渲染为蓝色+下划线链接文本
- `text` 和 `number` 模式的列 → 普通文本，点击进入输入框
- `static` 模式 → 普通文本（不可编辑）

## 七、字段编辑方式推演规则（v6.2 新增）

> 用户核心诉求：每一列都可以编辑点击。编辑方式由数据关系决定，不是逐个字段指定。
> 效率原则贯穿全流程：所有录入/修改都支持匹配检索 + 快速新建。

### 7.1 数据关系矩阵

| 实体 | 关系 | 说明 |
|------|------|------|
| SPU（产品主体） | 1 : N 变体 | 一个产品名称 → 多个品牌+规格变体 |
| 变体 | 1 : N 单位 | 一个变体 → 多个单位（米/根/桶），含换算系数 |
| 变体+单位 | 1 : N 售价 | 一个单位 → 多个售价类型（零售价/批发价/工程价） |
| 变体+单位 | 1 : N 供应商进价 | 一个单位 → 多个供应商进价 |
| 品牌 | N : 1 变体 | 多个变体共用一个品牌 |
| 分类 | N : 1 SPU | 多个 SPU 归属一个分类 |
| 供应商 | N : 1 进价 | 多个进价共用一个供应商 |
| **价格类型** | N : 1 售价 | 多个售价共用一个价格类型（**用户自定义**，非硬编码） |

### 7.2 三条推演规则（覆盖所有场景）

**规则 1：一对多关系 → 弹窗面板编辑**
当一个父记录对应多条子记录时，必须通过弹窗面板编辑。
- 弹窗内列出所有子记录，逐条编辑
- 弹窗内支持新增/删除子记录
- 弹窗内的关联字段同样适用规则 2

**规则 2：多对一关联 → Picker 搜索 + 快速新建**
当字段引用另一个实体（外键关系）时，使用 Picker 搜索匹配。
- 搜索列表第一行始终提供"快速新建: [输入内容]"
- 打 2 个字就能检索出 10 个字的品牌名 → 减少录入量
- 已有数据快速检索填入，没有的快速新建后填入
- **这是贯穿全流程的核心交互设计**

**规则 3：标量字段 → 直接输入**
无关联关系的简单值，直接输入框。
- 数量、备注、换算系数、排序号等

### 7.3 产品管理 SKU 各字段编辑方式推演

| 字段 | 数据关系 | 规则 | 编辑方式 | 理由 |
|------|---------|------|---------|------|
| 产品名称(SPU) | 多变体→1 SPU | 规则2 | Picker搜索+快速新建 | 关联SPU，需检索匹配 |
| 分类 | 多SPU→1分类 | 规则2 | Picker搜索+快速新建 | 关联分类树 |
| 品牌 | 多变体→1品牌 | 规则2 | Picker搜索+快速新建 | 关联品牌库，打2字检索10字 |
| 规格 | 1 SPU→多规格 | 规则3 | 直接输入 | 规格是变体标识，自由文本 |
| **单位** | **1变体→多单位** | **规则1** | **弹窗面板** | 一变体多单位+换算系数 |
| **售价** | **1单位→多售价类型** | **规则1** | **弹窗面板** | 一单位多价格(零售/批发/工程) |
| **进价** | **1单位→多供应商进价** | **规则1** | **弹窗面板** | 一单位多供应商进价 |

## 八、多价格类型数据模型（v6.2 新增）

### 8.1 问题背景
v6.1 之前 `product_sale_prices` 唯一约束 `@@unique([variantId, unitId])` → 一个单位只能一个售价。
但实际业务中一个单位有多个售价类型（零售价/批发价/工程价等）。

### 8.2 数据模型变更（已在 schema.prisma 落地）

新增 `price_types` 表（价格类型字典，用户自定义）：
```
price_types
  id          BigInt   PK
  name        String   唯一（零售价/批发价/工程价）
  description String?  可选描述
  sortOrder   Int      排序号
  isActive    Boolean  是否启用
  isDefault   Boolean  是否默认价格类型（系统初始化设置，quickCreateVariant 用）
  createdAt / updatedAt
```

修改 `product_sale_prices` 表（新增 `priceTypeId` 字段）：
```
product_sale_prices
  id          BigInt   PK
  variantId   BigInt   FK → product_variants.id
  unitId      BigInt   FK → product_units.id
  priceTypeId BigInt   FK → price_types.id（v6.2 新增）
  salePrice   Decimal? 可空（NULL 表示未定价）
  @@unique([variantId, unitId, priceTypeId])  ← 唯一约束改为三键
```

### 8.3 设计要点
- 价格类型**非硬编码**，由用户在产品管理中定义（如"零售价"、"批发价"、"工程价"）
- `isDefault=true` 的价格类型用于 `quickCreateVariant` 创建默认售价
- 售价编辑弹窗面板中每行引用一个价格类型
- `salePrice` 可空表示"未定价"（支持"先建档后补价"理念）

## 九、三弹窗面板设计（v6.2 新增）

> 三个弹窗面板分别管理「单位」「售价」「进价」三类一对多子记录，对应规则 1。均在产品管理变体弹窗内触发。

### 9.1 售价编辑弹窗面板
```
┌──────────────────────────────────────────┐
│  售价编辑                                │
│  ┌──────────────┬──────────┬──────────┐  │
│  │ 价格类型     │ 售价     │ 操作     │  │
│  ├──────────────┼──────────┼──────────┤  │
│  │ 零售价       │ [5.50]   │ [删除]   │  │
│  │ 批发价       │ [4.80]   │ [删除]   │  │
│  │ 工程价       │ [4.50]   │ [删除]   │  │
│  │ [选择/新建]  │ [输入]   │ [添加]   │  │
│  └──────────────┴──────────┴──────────┘  │
│                    [确定]  [取消]        │
└──────────────────────────────────────────┘
```
- 价格类型列：Picker 搜索 + 快速新建（规则 2）
- 价格值列：直接输入（规则 3）
- 可新增/删除售价行

### 9.2 进价编辑弹窗面板（已实现，需验证一致性）
```
┌──────────────────────────────────────────┐
│  进价编辑                                │
│  ┌──────────────┬──────────┬──────────┐  │
│  │ 供应商       │ 进价     │ 操作     │  │
│  ├──────────────┼──────────┼──────────┤  │
│  │ 甲建材       │ [3.30]   │ [删除]   │  │
│  │ 乙商贸       │ [3.10]   │ [删除]   │  │
│  │ [选择/新建]  │ [输入]   │ [添加]   │  │
│  └──────────────┴──────────┴──────────┘  │
│                    [确定]  [取消]        │
└──────────────────────────────────────────┘
```
- 供应商列：Picker 搜索 + 快速新建（规则 2）
- 进价值列：直接输入（规则 3）
- 可新增/删除进价行

### 9.3 单位编辑弹窗面板
```
┌──────────────────────────────────────────┐
│  单位管理                                │
│  ┌──────┬──────────┬──────────┬────────┐ │
│  │ 单位 │ 换算系数 │ 是否基准 │ 操作   │ │
│  ├──────┼──────────┼──────────┼────────┤ │
│  │ 米 ✓ │ 1(基准)  │ ✓        │ [删除] │ │
│  │ 根   │ 4.4      │          │ [删除] │ │
│  │ 桶   │ 100      │          │ [删除] │ │
│  │ [输入]│ [输入]   │          │ [添加] │ │
│  └──────┴──────────┴──────────┴────────┘ │
│                    [确定]  [取消]        │
└──────────────────────────────────────────┘
```
- 单位名：直接输入或 Picker 搜索常用单位 + 快速新建（规则 2+3 混合）
- 换算系数：直接输入（规则 3）
- 基准单位互斥（只能一个 isBase=true）
- 默认单位互斥（只能一个 isDefault=true）

## 十、不同业务场景的编辑差异（v6.2 新增）

### 10.1 产品管理（主数据维护）
- **所有字段可编辑**
- 一对多字段 → 弹窗面板（规则 1）
- 关联字段 → Picker+快速新建（规则 2）
- 标量字段 → 直接输入（规则 3）
- 目标：完整维护所有主数据

### 10.2 采购报价视图（业务录入）
- 产品名称 → Picker搜索+快速新建（核心入口）
- 数量 → 直接输入
- 单位 → 点击切换（弹出单位/价格合并面板，选单位自动带出对应售价+进价，见第十一章）
- 售价/进价 → 显示当前选中单位的价格（只读展示，修改需进入产品管理）
- 目标：快速录入业务单据，不维护主数据

### 10.3 成本核定视图
- 进价 → 可直接修改（核定场景）
- 其他字段只读
- 目标：核定成本

### 10.4 销售汇总/退换售后
- 只读归集视图
- 目标：查看统计

## 十一、ProductPicker 单位/价格合并面板

> 本章描述**采购报价视图**中点击「单位」列弹出的合并面板（与第九章三弹窗面板的区别：本章为业务录入场景的只读展示+切换单位，第九章为主数据维护场景的逐条编辑）。

### 11.1 设计原则
- 单位切换和价格展示**合并为一个面板**
- 点击单位 → 弹出所有可选单位列表，每个单位显示对应的售价和供应商进价
- **1:1 对应**：一个单位 → 一个售价（默认价格类型）→ 多个供应商进价

### 11.2 面板结构
```
┌──────────────────────────────────────────┐
│  单位  │  售价   │  供应商进价            │
├────────┼─────────┼───────────────────────┤
│  米 ✓  │  5.50   │  甲建材 3.30          │
│        │         │  乙商贸 3.10          │
├────────┼─────────┼───────────────────────┤
│  根    │ 22.00   │  甲建材 21.20         │
│        │         │  乙商贸 20.80         │
├────────┼─────────┼───────────────────────┤
│  捆    │ 530.00  │  （未设进价）          │
└──────────────────────────────────────────┘
```

### 11.3 交互流程
1. 用户在采购清单点击「单位」列
2. 弹出合并面板，列出当前变体的所有单位
3. 每行显示：单位名 | 售价 | 供应商进价列表
4. 当前选中的单位高亮（✓）
5. 点击其他单位 → 切换单位 + 同步刷新售价和进价
6. 切换后各行独立互不影响

## 十二、全局效率原则检查清单（v6.2 新增）

每个编辑入口（无论在哪个场景）都必须满足：

- [ ] 输入时提供实时匹配检索（防抖 250ms）
- [ ] 匹配列表第一行始终提供"快速新建: [输入内容]"
- [ ] 快速新建只需最小必填信息
- [ ] 快速新建行有视觉区分（绿色背景 + PlusOutlined）
- [ ] 选中已有记录或快速新建后自动填入
- [ ] 减少重复录入（打 2 字检索出 10 字品牌名）

## 十三、性能要求

- antd Table 的 `virtual` 属性启用虚拟滚动
- 浮动面板使用 `createPortal` 避免重排
- 搜索防抖 250ms
- 行内编辑使用非受控模式（避免每次按键触发 re-render）
- 大数据量（>1000 行）场景下虚拟滚动必开

## 十四、变更记录

- **v6.0**：统一表格组件 UnifiedTable（antd Table 封装），产品管理单一表格+弹窗，快速新建功能
- **v6.1**：SKU 级展示 + 变体弹窗编辑 + 单位价格合并面板 + 快速新建全局化 + 下划线视觉提示
- **v6.2**：合并原 `edit-logic.md` 为本文单一文档，新增以下内容：
  - 第七章：字段编辑方式推演规则（数据关系矩阵 + 三条推演规则 + SKU 字段推演表）
  - 第八章：多价格类型数据模型（新增 `price_types` 表 + 修改 `product_sale_prices` 唯一约束为三键 `[variantId, unitId, priceTypeId]`，已在 `schema.prisma` 落地）
  - 第九章：三弹窗面板设计（售价/进价/单位 编辑弹窗）
  - 第十章：不同业务场景编辑差异（产品管理 / 采购报价 / 成本核定 / 销售汇总）
  - 第十二章：全局效率原则检查清单
  - 文档统一：删除 `edit-logic.md`，所有字段编辑逻辑收归本规范
