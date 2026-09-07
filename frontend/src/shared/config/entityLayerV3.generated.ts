// ════════════════════════════════════════════════════════════════════
// entityLayerV3.generated.ts — 由 data-source/layers/{physical,relation,difference}-layer.yml 生成
// 禁止手改；改 yml 后跑 node tools/gen-entity-meta.mjs 重新生成。
// v3 三层模型（物理层 / 关系层 / 差异层）。双语桥接：biz=中文业务名，id=标识(英文机器名)。
// 表达即业务事实（2026-09-06 定稿）：兜底成员 = 表级 defaultRow（如 分类 defaultRow: 未分类），字段级缺省已废除；
// uniqueKeys 由字段级「去重: 是」提取推导（1=单列全局唯一，>1=联合唯一）；path 由层级标题串联推导。
// fulltextKeys 由「全文检索: 是」提取（1=单列 / >1=组合 FULLTEXT）；indexKeys 由「索引: 是」提取（1=单列 / >1=组合 B-tree）。
// v7 顶层定调：物理层 = 表结构与索引唯一业务描述源 → 结构解释器据此幂等输出建表/建索引 SQL；
// searchLevel 是应用层规则（喂业务检索引擎），不进建表输出。库自动行为（主键聚簇/外键列/唯一自带）解释器补齐，配置零书写。
// ════════════════════════════════════════════════════════════════════

export type SearchTier = '主' | '次' | '辅'; // 兼容旧消费者（历史检索档位）；新消费一律用 PhysicalField.searchLevel

export interface PhysicalField {
  /** 业务中文名，如 产品名称 */
  biz: string;
  /** 机器名(标识)，如 name */
  id: string;
  /** 类型描述，如 文本 / 外键→分类.编号 */
  type: string;
  /** 参与本表唯一判定（物理层 去重: 是）。表内 uniq 字段被提取为 uniqueKeys */
  uniq?: boolean;
  /** 本列内容需全文级检索能力（物理层 全文检索: 是）。表内 fulltext 字段被提取为 fulltextKeys → 建表 FULLTEXT(组合)索引 */
  fulltext?: boolean;
  /** 该列需要普通 B-tree 索引（物理层 索引: 是，人工决策：业务常按它精确过滤/排序/关联）。表内 index 字段被提取为 indexKeys */
  index?: boolean;
  /** 检索级别（正整数）：配了=参与本表检索匹配；1级=主索引 / 2级=子索引补充…；可同级重复。属应用层规则，喂检索引擎，不进建表输出 */
  searchLevel?: number;
}

export interface PhysicalTable {
  /** 业务中文名，如 产品 */
  biz: string;
  /** 机器名(标识)，如 product */
  id: string;
  /** 本表唯一键（由 uniq 字段提取推导）：长度 1 = 该列全局唯一；>1 = 联合唯一 */
  uniqueKeys: string[];
  /** 本表全文索引字段集（由 fulltext 字段提取推导）：长度 1 = 单列全文索引；>1 = 组合全文索引（建表出 FULLTEXT） */
  fulltextKeys?: string[];
  /** 本表普通索引字段集（由 index 字段提取推导，人工决策）：长度 1 = 单列 B-tree 索引；>1 = 组合 B-tree 索引（建表出 CREATE INDEX） */
  indexKeys?: string[];
  /** 本表兜底成员行名（如 分类 → 未分类）：外键引用本表留空时引擎按本值查/建行取 id 填引用 */
  defaultRow?: string;
  /** 字段，按 标识(id) 索引 */
  fields: Record<string, PhysicalField>;
}

export interface RelationLevel {
  seq: number;
  title: string;
  tables: string[];
  search: { mode: string; primary: string };
}

export interface RelationBody {
  name: string;
  /** 通路（推导：层级标题串联，配置禁写「通路」键） */
  path: string;
  crossCuts: string[];
  levels: RelationLevel[];
}

export interface DifferenceOverride {
  target: string;
  props: Record<string, string>;
}

export const physicalLayer: Record<string, PhysicalTable> = {
    "category": { biz: "分类", id: "category", uniqueKeys: ["name"], defaultRow: "未分类", fields: {
      "id": { biz: "编号", id: "id", type: "主键(整数)" },
      "name": { biz: "分类名称", id: "name", type: "文本(100)", uniq: true, searchLevel: 1 },
      "sortOrder": { biz: "排序", id: "sortOrder", type: "整数" },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "product": { biz: "产品", id: "product", uniqueKeys: ["name"], fields: {
      "id": { biz: "编号", id: "id", type: "主键" },
      "name": { biz: "产品名称", id: "name", type: "文本(200)", uniq: true, searchLevel: 1 },
      "categoryId": { biz: "外键分类", id: "categoryId", type: "外键→分类.编号" },
      "remark": { biz: "备注", id: "remark", type: "文本(500)", searchLevel: 2 },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "brand": { biz: "品牌", id: "brand", uniqueKeys: ["name"], defaultRow: "普通品牌", fields: {
      "id": { biz: "编号", id: "id", type: "主键" },
      "name": { biz: "品牌名称", id: "name", type: "文本(100)", uniq: true, searchLevel: 1 },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "unit": { biz: "单位", id: "unit", uniqueKeys: ["unitName"], fields: {
      "id": { biz: "编号", id: "id", type: "主键" },
      "unitName": { biz: "单位名", id: "unitName", type: "文本(50)", uniq: true, searchLevel: 1 },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "price_type": { biz: "价格类型", id: "price_type", uniqueKeys: ["name"], fields: {
      "id": { biz: "编号", id: "id", type: "主键" },
      "name": { biz: "类型名", id: "name", type: "文本(50)", uniq: true, searchLevel: 1 },
      "sortOrder": { biz: "排序", id: "sortOrder", type: "整数" },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "product_brand": { biz: "产品×品牌", id: "product_brand", uniqueKeys: ["productId","brandId"], fields: {
      "productId": { biz: "外键产品", id: "productId", type: "外键→产品.编号", uniq: true },
      "brandId": { biz: "外键品牌", id: "brandId", type: "外键→品牌.编号", uniq: true },
      "sortOrder": { biz: "排序", id: "sortOrder", type: "整数" },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "spec": { biz: "品牌规格", id: "spec", uniqueKeys: ["productId","brandId","specModel"], fields: {
      "productId": { biz: "外键产品", id: "productId", type: "外键→产品.编号", uniq: true },
      "brandId": { biz: "外键品牌", id: "brandId", type: "外键→品牌.编号", uniq: true },
      "specModel": { biz: "规格名称", id: "specModel", type: "文本(200)", uniq: true, searchLevel: 1 },
      "remark": { biz: "规格备注", id: "remark", type: "文本(500)", searchLevel: 2 },
      "sortOrder": { biz: "排序", id: "sortOrder", type: "整数" },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } },
    "spec_unit": { biz: "单位换算", id: "spec_unit", uniqueKeys: ["specId","unitId"], fields: {
      "specId": { biz: "外键规格", id: "specId", type: "外键→品牌规格.编号", uniq: true },
      "unitId": { biz: "外键单位", id: "unitId", type: "外键→单位.编号", uniq: true },
      "isBase": { biz: "是否基准", id: "isBase", type: "布尔" },
      "isDisplay": { biz: "是否展示", id: "isDisplay", type: "布尔" },
      "conversionRate": { biz: "换算率", id: "conversionRate", type: "小数(10，4)" }
    } },
    "sale_price": { biz: "售价", id: "sale_price", uniqueKeys: ["specId","unitId","priceTypeId"], fields: {
      "specId": { biz: "外键规格", id: "specId", type: "外键→品牌规格.编号", uniq: true },
      "unitId": { biz: "外键单位", id: "unitId", type: "外键→单位.编号", uniq: true },
      "priceTypeId": { biz: "外键价格类型", id: "priceTypeId", type: "外键→价格类型.编号", uniq: true },
      "price": { biz: "单价", id: "price", type: "小数(10，2)" },
      "status": { biz: "状态", id: "status", type: "枚举" },
      "isDefault": { biz: "是否默认", id: "isDefault", type: "布尔" }
    } },
    "purchase_price": { biz: "进价", id: "purchase_price", uniqueKeys: ["specId","unitId","supplierId"], indexKeys: ["supplierId"], fields: {
      "specId": { biz: "外键规格", id: "specId", type: "外键→品牌规格.编号", uniq: true },
      "unitId": { biz: "外键单位", id: "unitId", type: "外键→单位.编号", uniq: true },
      "supplierId": { biz: "外键供应商", id: "supplierId", type: "外键→供应商.编号(逻辑)", uniq: true, index: true },
      "supplierName": { biz: "供应商名称快照", id: "supplierName", type: "文本(200)" },
      "price": { biz: "进价", id: "price", type: "小数(10，2)" },
      "status": { biz: "状态", id: "status", type: "枚举" },
      "isDefault": { biz: "是否默认", id: "isDefault", type: "布尔" }
    } },
    "product_image": { biz: "产品图片", id: "product_image", uniqueKeys: ["specId","imageUrl"], indexKeys: ["hash"], fields: {
      "specId": { biz: "外键规格", id: "specId", type: "外键→品牌规格.编号", uniq: true },
      "imageUrl": { biz: "主图URL", id: "imageUrl", type: "文本(500)", uniq: true },
      "mediumUrl": { biz: "中图URL", id: "mediumUrl", type: "文本(500)" },
      "thumbnailUrl": { biz: "缩略图URL", id: "thumbnailUrl", type: "文本(500)" },
      "width": { biz: "原图宽", id: "width", type: "整数" },
      "height": { biz: "原图高", id: "height", type: "整数" },
      "size": { biz: "字节数", id: "size", type: "整数" },
      "hash": { biz: "内容哈希", id: "hash", type: "文本(64)", index: true },
      "sortOrder": { biz: "排序", id: "sortOrder", type: "整数" },
      "isMain": { biz: "是否主图", id: "isMain", type: "整数" }
    } },
    "supplier": { biz: "供应商", id: "supplier", uniqueKeys: ["name"], fields: {
      "id": { biz: "编号", id: "id", type: "主键" },
      "name": { biz: "供应商名称", id: "name", type: "文本(200)", uniq: true, searchLevel: 1 },
      "remark": { biz: "备注", id: "remark", type: "文本(不限)", searchLevel: 2 },
      "status": { biz: "状态", id: "status", type: "枚举" }
    } }
};

export const relationLayer: Record<string, RelationBody> = {
    "产品管理": { name: "产品管理", path: "产品 → 产品×品牌 → 品牌规格 → 单位换算 → 售价·进价", crossCuts: ["品牌","单位","价格类型","分类","供应商","产品图片"], levels: [
      { seq: 1, title: "产品", tables: ["产品"], search: { mode: "产品", primary: "产品.产品名称" } },
      { seq: 2, title: "产品×品牌", tables: ["产品×品牌"], search: { mode: "品牌", primary: "品牌.品牌名称" } },
      { seq: 3, title: "品牌规格", tables: ["品牌规格"], search: { mode: "规格", primary: "品牌规格.规格名称" } },
      { seq: 4, title: "单位换算", tables: ["单位换算"], search: { mode: "单位", primary: "单位.单位名" } },
      { seq: 5, title: "售价·进价", tables: ["售价","进价"], search: { mode: "价格", primary: "售价.单价" } }
    ] }
};

export const differenceLayer: DifferenceOverride[] = [
    { target: "产品图片.显示", props: { "提级到": "产品", "聚合": "按规格取默认", "说明": "图片真相在品牌规格（每规格各有图），显示提到产品行聚合取各规格默认图。" } },
    { target: "产品.价格槽", props: { "槽": "价格槽", "说明": "多记录集（recordSet）渲染入口，由框架 slot 接管，不在普通字段里。" } }
];
