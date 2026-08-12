// QuickCreateConfig — 快速新建缺省值注册表 + 数据层字段配置（v15.3 配置驱动 SSOT）
//
// 设计依据（用户 v15.3 反馈）：
//   - 系统所有表初始无数据，**不写种子数据、不预填**：输入框一律留空，
//     保存时才按「缺省值注册表」兜底写入，写入按值去重：全局档案已存在 → 直接复用关联，
//     不存在 → 才新建。兜底的是"值"，不是"新记录"。
//   - 所有引用类字段写入逻辑统一（按值去重：存在复用/不存在新建），但去重键按实体类别分：
//       A 类全局字典（分类/品牌/价格类型/供应商）：name 全局唯一 → 纯名称去重
//       B 类父级从属（产品/规格/单位）：父级 id + 名称唯一 → 必须携带父级上下文，
//         不同父级下的同名记录是独立实体（如不同产品的 DN25 规格），不能纯名称去重
//       （字段级 dedupeKey 与后端 registry.uniqueKey 同构，v15.4）
//   - 分类空 → ensure「未分类」真实记录（与品牌 ensure「普通品牌」同构），无 categoryId=0 魔数。
//   - 快速新建/保存确认弹窗（DefaultFillsPreview）为**通用组件**，由本配置驱动：
//     调用方只声明「用哪个数据层 + 用户实际填了哪些值」；字段 label / 必填 / 兜底值 /
//     去重语义全部在此定义——调整兜底值或字段只改本文件，全局生效。
//   - 数据层化：每个实体按数据层组织（产品信息层 / 价格信息层 / …），未来快速新建任何实体，
//     新增一个层配置即可，交互与逻辑完全统一（"模型控制层"式抽象）。
//   - 长期演进：本配置为纯数据结构，未来可持久化到 system_config 由前端 UI 调整
//     （批量录入场景：预设分类/品牌兜底值，只填必填字段逐个保存，录入提速）。
//
// 双端同口径：本文件为前端缺省值注册表，与后端 businessDefaults（面价渠道/零售价/未分类）/
// productService（DEFAULT_SPEC_MODEL / DEFAULT_UNIT_NAME / 普通品牌）/ registry 完全一致，禁止只改一端。

/** 去重键策略（与后端 registry.RegistryUniqueKey 同构，v15.4）：
 *   - global：name 全局唯一（A 类全局字典：品牌/分类/价格类型/供应商）→ 纯名称去重
 *   - parent：父级 id + 名称唯一（B 类父级从属实体：产品/规格/单位）→ 必须携带父级上下文，
 *     不同父级下的同名记录是独立实体（如不同产品的 DN25 规格），不能纯名称去重 */
export type DedupeKeyConfig =
  | { type: 'global' }
  | { type: 'parent'; parentField: string; nameField: string };

/** 单字段配置：label / 必填 / 兜底值 / 去重写入语义 */
export interface QuickCreateFieldConfig {
  /** 字段 key（调用方传值的键） */
  key: string;
  /** 展示名（如 产品名称 / 分类 / 品牌） */
  label: string;
  /** 是否必填（确认弹窗内置顶 + 星标） */
  required?: boolean;
  /** 缺省兜底值：输入为空时保存写入的值；空串 = 无兜底 */
  fallback: string;
  /** 是否在空输入时标「自动补充」（默认 true；仅当某字段空值有既成语义、无需提示时设 false） */
  autoOnEmpty?: boolean;
  /** 去重键策略（写入去重依据；注释给维护者看，不进 UI） */
  dedupeKey?: DedupeKeyConfig;
  /** 去重写入说明（存在→复用关联，不存在→新建），注释给维护者看，不进 UI */
  dedupeNote?: string;
}

/** 数据层配置：一组字段清单（快速新建该实体时展示与兜底） */
export interface QuickCreateLayerConfig {
  /** 层名（如 产品信息 / 价格信息） */
  title: string;
  fields: QuickCreateFieldConfig[];
}

/**
 * 数据层注册表：每个快速新建实体对应一个层配置。
 * 调用方（QuickCreateConfirmDialog / ProductEditDialog 等）声明层 key + 实际值即可。
 */
export const QUICK_CREATE_LAYERS: Record<string, QuickCreateLayerConfig> = {
  /** 产品信息层（快速新建产品/产品编辑保存确认） */
  product: {
    title: '产品信息',
    fields: [
      {
        key: 'productName',
        label: '产品名称',
        required: true,
        fallback: '',
        dedupeKey: { type: 'parent', parentField: 'categoryId', nameField: 'name' },
        dedupeNote: 'B 类父级去重：同分类下产品名唯一（categoryId+name），不能纯名称去重',
      },
      {
        key: 'category',
        label: '分类',
        fallback: '未分类',
        dedupeKey: { type: 'global' },
        dedupeNote: 'A 类全局字典（name 全局唯一，v15.4 补唯一索引）：空 → ensure「未分类」真实记录；输入分类名 → 存在复用/不存在新建',
      },
      {
        key: 'brand',
        label: '品牌',
        fallback: '普通品牌',
        dedupeKey: { type: 'global' },
        dedupeNote: 'A 类全局字典（name 全局唯一）：兜底「普通品牌」时存在即复用关联，不存在才新建',
      },
      {
        key: 'specModel',
        label: '规格型号',
        fallback: '通用',
        dedupeKey: { type: 'parent', parentField: 'productId', nameField: 'specModel' },
        dedupeNote: 'B 类父级去重：同产品下规格唯一——不同产品的 DN25 是独立规格记录，不能纯名称去重；空值兜底「通用」',
      },
      {
        key: 'unitName',
        label: '单位',
        fallback: '件',
        dedupeKey: { type: 'parent', parentField: 'specId', nameField: 'unitName' },
        dedupeNote: 'B 类父级去重：同规格下单位唯一（specId+unitName）；空值兜底「件」',
      },
    ],
  },
  /**
   * 价格信息层（v15.4 废弃独立 QUICK_CREATE_ROW_FALLBACKS，并入统一层结构）：
   * 售价/进价行的行级缺省补充。与产品信息层同模式——录入时字段留空（价格类型/供应商可为空），
   * 保存后兜底补充（零售价/面价渠道），按值去重写入（A 类全局字典 name 唯一，存在复用/不存在新建）。
   * 未来「快速新建价格」直接复用本层。
   */
  price: {
    title: '价格信息',
    fields: [
      {
        key: 'priceType',
        label: '价格类型',
        fallback: '零售价',
        dedupeKey: { type: 'global' },
        dedupeNote: 'A 类全局字典（price_type name 唯一）：售价行价格类型留空 → 保存时兜底「零售价」，同名复用/不存在新建',
      },
      {
        key: 'supplier',
        label: '供应商',
        fallback: '面价渠道',
        dedupeKey: { type: 'global' },
        dedupeNote: 'A 类全局字典（supplier name 唯一）：进价行供应商留空 → 保存时兜底「面价渠道」，同名复用/不存在新建',
      },
    ],
  },
  // 未来其他实体层（供应商层 …）按需在此追加，快速新建交互自动统一
};

/**
 * 按字段配置解析最终展示值：输入非空 → 原样展示（非自动补充）；
 * 输入为空 → 取兜底值，按 autoOnEmpty 决定是否标「自动补充」。
 */
export function resolveFieldValue(
  field: QuickCreateFieldConfig,
  raw: string,
): { value: string; auto: boolean } {
  const v = raw.trim();
  if (v) return { value: v, auto: false };
  const auto = field.autoOnEmpty !== false && !!field.fallback;
  return { value: field.fallback, auto };
}
