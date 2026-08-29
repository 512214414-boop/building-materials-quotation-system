/**
 * 选用检索 · 关系树插槽
 *
 * 所有档案最终都通过选用检索被使用。管理页的 slots[] 是这棵树摊平后的列/弹窗；
 * 本文件是同一棵树的另一插槽：只配存字的层（layers），顶栏由模型派生。
 *
 * 派生：
 *   宽松 = 当前这棵树能打到的字并成横表（可另并 identityHit：单据编号/标题这类
 *          钉在主体上、不单独切层的字）。主行仍是这次要取的主体。
 *   精准 = 每一层存字的层一颗按钮。只打这一层。切档不改字。
 *   一层 → 不出宽松。多层 → 出宽松；默认宽松，除非 defaultViewId 另指定
 *          （产品默认「名称」：认货最常用的精准层）。
 *
 * 配货来源是两枝（内部仓 / 供应商），不是一层层切，不要套宽松+精准。
 * 禁止另写检索面板。列顺序以 `文档可视化/` 为准。
 */

export type PickerTreeGrain = 'root' | 'pair' | 'leaf';

/** 叶子行上方曾用灰字带出的上下文。现改为真正分列；仍用来区分执行标准 / 命中渠道。 */
export type PickerTreeContextLead = 'remark' | 'supplier';

/** 主行身份列。入口层排最左。 */
export type PickerTreeFrontCol =
  | 'category'
  | 'product'
  | 'brandN'
  | 'brand'
  | 'spec'
  | 'remark'
  | 'supplier';

export const PRODUCT_PICKER_ENTRY_VIEW_IDS = [
  'loose',
  'name',
  'brand',
  'spec',
  'standard',
  'supplier',
] as const;

export type ProductPickerEntryView = (typeof PRODUCT_PICKER_ENTRY_VIEW_IDS)[number];

export interface PickerTreeView {
  id: string;
  label: string;
  /** 打在哪一层/字段（给人看；后端 entryView 用 id） */
  hit: string;
  grain: PickerTreeGrain;
  /** 顶栏可收起的一句。默收起，点当前档或 ? 展开。 */
  hint: string;
  /** 主行从左到右的身份列（入口最左）。叶子后面再接单位/价/插入。 */
  front: PickerTreeFrontCol[];
  /** 叶子主行额外带的上下文（规格备注 / 命中渠道） */
  contextLead?: PickerTreeContextLead;
}

/** 树上某一层存字的字段。精准档 = 一层一颗按钮。 */
export interface ArchivePickerLayer {
  id: string;
  label: string;
  hit: string;
  grain: PickerTreeGrain;
  hint: string;
  front: PickerTreeFrontCol[];
  contextLead?: PickerTreeContextLead;
}

/**
 * 一份档案的选用检索模型。新增档案：把关系树存字的层放进来，顶栏自动出。
 * 不能从树推的私有（挑联系、下拉翻单、渠道=已进价∪经营范围、选品插入）仍写在各面板。
 */
export interface ArchivePickerModel {
  /** 宽松档主行：这次选用要取的主体。默认用第一层。 */
  subject?: {
    grain: PickerTreeGrain;
    front: PickerTreeFrontCol[];
    hint?: string;
  };
  /** 钉在主体上、参与宽松但不单独切精准的字（单据编号/标题） */
  identityHit?: string;
  /** 默认档。不写：多层→宽松；一层→该层 id */
  defaultViewId?: string;
  /**
   * 确认层是否带按日翻。所有表都有日期；哪个检索要按日筛，只开这一项。
   * 空词按日窗口，打字不锁日期。
   */
  dateFilter?: boolean;
  layers: ArchivePickerLayer[];
}

export function pickerViewsFromModel(model: ArchivePickerModel): PickerTreeView[] {
  const precise: PickerTreeView[] = model.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    hit: layer.hit,
    grain: layer.grain,
    hint: layer.hint,
    front: layer.front,
    contextLead: layer.contextLead,
  }));
  if (model.layers.length < 2) return precise;
  const first = model.layers[0];
  const subject = model.subject ?? { grain: first.grain, front: first.front };
  const layerHits = model.layers.map((layer) => layer.hit).join('+');
  const loose: PickerTreeView = {
    id: 'loose',
    label: '宽松',
    hit: model.identityHit ? `${model.identityHit}+${layerHits}` : layerHits,
    grain: subject.grain,
    front: subject.front,
    hint: subject.hint ?? '当前这棵树能打到的字一起模糊。切档不改字。',
  };
  return [loose, ...precise];
}

export function defaultViewFromModel(model: ArchivePickerModel): string {
  if (model.defaultViewId) return model.defaultViewId;
  return model.layers.length < 2 ? model.layers[0].id : 'loose';
}

export const PRODUCT_PICKER_MODEL: ArchivePickerModel = {
  defaultViewId: 'name',
  subject: {
    grain: 'root',
    front: ['category', 'product', 'brandN'],
    hint: '这棵树上能打到的字一起模糊。主行仍是一个产品。不知道在哪一层就用这一档。',
  },
  layers: [
    {
      id: 'name',
      label: '名称',
      hit: '产品名 + 俗称',
      grain: 'root',
      hint: '格子里混着打也中。一行一个产品，品牌收在 N 里。',
      front: ['category', 'product', 'brandN'],
    },
    {
      id: 'brand',
      label: '品牌',
      hit: 'brand.name',
      grain: 'pair',
      hint: '格子里混着打也中。品牌在最左，后面才是这个产品。',
      front: ['brand', 'product', 'category'],
    },
    {
      id: 'spec',
      label: '规格',
      hit: 'spec.specModel',
      grain: 'leaf',
      hint: '格子里混着打也中。规格在最左；产品名、品牌各占一列，不要叠成一行灰字。',
      front: ['spec', 'product', 'brand'],
    },
    {
      id: 'standard',
      label: '执行标准',
      hit: 'spec.remark',
      grain: 'leaf',
      hint: '格子里混着打也中。标准原文在最左。',
      front: ['remark', 'spec', 'product', 'brand'],
      contextLead: 'remark',
    },
    {
      id: 'supplier',
      label: '渠道',
      hit: '进价渠道 ∪ 经营范围',
      grain: 'leaf',
      hint: '这货谁可能供。已进价或经营范围盖住都要出。不是搜供应商档案当产品名。',
      front: ['supplier', 'spec', 'product', 'brand'],
      contextLead: 'supplier',
    },
  ],
};

export const PRODUCT_PICKER_TREE_VIEWS: PickerTreeView[] = pickerViewsFromModel(PRODUCT_PICKER_MODEL);
export const DEFAULT_PRODUCT_PICKER_VIEW: ProductPickerEntryView = defaultViewFromModel(
  PRODUCT_PICKER_MODEL,
) as ProductPickerEntryView;

/** 配货来源：内部仓 | 供应商 两枝。不是一层层切，不要套宽松+精准。分组下拉的组名从这里读。 */
export const ALLOCATION_SOURCE_TREE_VIEWS: PickerTreeView[] = [
  {
    id: 'warehouse',
    label: '内部仓库列表',
    hit: 'warehouse.name',
    grain: 'root',
    hint: '打仓库名。',
    front: ['product'],
  },
  {
    id: 'supplier',
    label: '外部供应商列表',
    hit: 'supplier.name',
    grain: 'root',
    hint: '打供应商名或电话、尾号。',
    front: ['product'],
  },
];

export const CUSTOMER_PICKER_MODEL: ArchivePickerModel = {
  subject: {
    grain: 'root',
    front: ['product'],
    hint: '所有层一起模糊。尾号也中。点中后挑一条联系。',
  },
  layers: [
    {
      id: 'name',
      label: '名称',
      hit: '姓名',
      grain: 'root',
      hint: '精准：只打姓名。',
      front: ['product'],
    },
    {
      id: 'contact',
      label: '联系',
      hit: '联系子表',
      grain: 'leaf',
      hint: '精准：电话、微信、尾号。这条联系跟着姓名填进去。',
      front: ['product'],
    },
    {
      id: 'address',
      label: '地址',
      hit: '地址子表',
      grain: 'leaf',
      hint: '精准：打在地址、收货人、地址上的电话。切档不改字。',
      front: ['product'],
    },
    {
      id: 'invoice',
      label: '开票',
      hit: '开票子表',
      grain: 'leaf',
      hint: '精准：抬头、税号。切档不改字。',
      front: ['product'],
    },
  ],
};

export const CUSTOMER_PICKER_TREE_VIEWS: PickerTreeView[] = pickerViewsFromModel(CUSTOMER_PICKER_MODEL);
export const DEFAULT_CUSTOMER_PICKER_VIEW = defaultViewFromModel(CUSTOMER_PICKER_MODEL);

export const SUPPLIER_PICKER_MODEL: ArchivePickerModel = {
  subject: {
    grain: 'root',
    front: ['product'],
    hint: '所有层一起模糊。名称、联系、地址、尾号都中。',
  },
  layers: [
    {
      id: 'name',
      label: '名称',
      hit: '名称',
      grain: 'root',
      hint: '精准：只打名称。电话在联系档或宽松。',
      front: ['product'],
    },
    {
      id: 'contact',
      label: '联系',
      hit: '联系子表',
      grain: 'leaf',
      hint: '打联系人、方式、号码。切档不改字。回填仍是这个供应商。',
      front: ['product'],
    },
    {
      id: 'address',
      label: '地址',
      hit: '地址子表',
      grain: 'leaf',
      hint: '打地址原文。切档不改字。回填仍是这个供应商。',
      front: ['product'],
    },
  ],
};

export const SUPPLIER_PICKER_TREE_VIEWS: PickerTreeView[] = pickerViewsFromModel(SUPPLIER_PICKER_MODEL);
export const DEFAULT_SUPPLIER_PICKER_VIEW = defaultViewFromModel(SUPPLIER_PICKER_MODEL);

export const DOCUMENT_PICKER_MODEL: ArchivePickerModel = {
  identityHit: '编号+标题',
  dateFilter: true,
  subject: {
    grain: 'root',
    front: ['product'],
    hint: '头上所有字段一起模糊。下拉按时间翻清单、能预览。',
  },
  layers: [
    {
      id: 'customer',
      label: '客户信息',
      hit: '单上当时的姓名+联系',
      grain: 'root',
      hint: '精准：按姓名或电话找单。',
      front: ['product'],
    },
    {
      id: 'qty',
      label: '产品数量',
      hit: '整单数量合计',
      grain: 'root',
      hint: '精准：对合计数量。',
      front: ['product'],
    },
    {
      id: 'amount',
      label: '单据金额',
      hit: '整单金额',
      grain: 'root',
      hint: '精准：对合计金额。',
      front: ['product'],
    },
  ],
};

export const DOCUMENT_PICKER_TREE_VIEWS: PickerTreeView[] = pickerViewsFromModel(DOCUMENT_PICKER_MODEL);
export const DEFAULT_DOCUMENT_PICKER_VIEW = defaultViewFromModel(DOCUMENT_PICKER_MODEL);

/** 售后已卖行：多层精准 + 宽松（与产品检索同构，只是数据源是单据快照行） */
export const SOLD_LINE_PICKER_MODEL: ArchivePickerModel = {
  defaultViewId: 'loose',
  subject: {
    grain: 'leaf',
    front: ['product', 'brand', 'spec'],
    hint: '名称+品牌+规格一起模糊。对着卖掉的行打字。插入复用当时的名称和价，数量另填。',
  },
  layers: [
    {
      id: 'name',
      label: '名称',
      hit: 'productName',
      grain: 'leaf',
      hint: '精准：只打产品名。',
      front: ['product', 'brand', 'spec'],
    },
    {
      id: 'brand',
      label: '品牌',
      hit: 'brandName',
      grain: 'leaf',
      hint: '精准：只打品牌。品牌在最左。',
      front: ['brand', 'product', 'spec'],
    },
    {
      id: 'spec',
      label: '规格',
      hit: 'spec',
      grain: 'leaf',
      hint: '精准：只打规格型号。',
      front: ['spec', 'product', 'brand'],
    },
  ],
};

export const SOLD_LINE_PICKER_TREE_VIEWS: PickerTreeView[] = pickerViewsFromModel(SOLD_LINE_PICKER_MODEL);
export const DEFAULT_SOLD_LINE_PICKER_VIEW = defaultViewFromModel(SOLD_LINE_PICKER_MODEL);

export function pickerTreeView(
  viewId: string,
  views: PickerTreeView[] = PRODUCT_PICKER_TREE_VIEWS,
): PickerTreeView | undefined {
  return views.find((v) => v.id === viewId);
}

export function pickerTreeGrain(
  viewId: string,
  views: PickerTreeView[] = PRODUCT_PICKER_TREE_VIEWS,
): PickerTreeGrain {
  return pickerTreeView(viewId, views)?.grain ?? 'root';
}

export function pickerTreeContextLead(
  viewId: string,
  views: PickerTreeView[] = PRODUCT_PICKER_TREE_VIEWS,
): PickerTreeContextLead | undefined {
  return pickerTreeView(viewId, views)?.contextLead;
}

export function pickerTreeFront(
  viewId: string,
  views: PickerTreeView[] = PRODUCT_PICKER_TREE_VIEWS,
): PickerTreeFrontCol[] {
  return pickerTreeView(viewId, views)?.front ?? ['category', 'product', 'brandN'];
}

export function parseProductPickerEntryView(raw: string): ProductPickerEntryView {
  return (PRODUCT_PICKER_ENTRY_VIEW_IDS as readonly string[]).includes(raw)
    ? (raw as ProductPickerEntryView)
    : DEFAULT_PRODUCT_PICKER_VIEW;
}
