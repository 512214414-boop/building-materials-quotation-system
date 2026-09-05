// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 阶段 L5：字段定义登记表——字段级确认层行为的唯一真相源。

export type FieldIdentity = 'byId' | 'byText';
export type FieldLayer = 'globalDict' | 'subject' | 'localDict';
export type FieldEntry = 'dict' | 'mixed' | 'value';

export interface GeneratedFieldDef {
  field: string;
  identity: FieldIdentity;
  dict?: string;
  layer?: FieldLayer;
  scene?: Partial<Record<'archive' | 'workbench', { entry: FieldEntry }>>;
}

export const entityFieldDefs: Record<string, GeneratedFieldDef> = {
  category: { field: "category", identity: "byId", dict: "category", layer: "globalDict", scene: { archive: { entry: "dict" }, workbench: { entry: "mixed" } } },
  brand: { field: "brand", identity: "byId", dict: "brand", layer: "globalDict", scene: { archive: { entry: "dict" }, workbench: { entry: "mixed" } } },
  unit: { field: "unit", identity: "byId", dict: "unit", layer: "globalDict", scene: { archive: { entry: "dict" }, workbench: { entry: "dict" } } },
  priceType: { field: "priceType", identity: "byId", dict: "price_type", layer: "globalDict", scene: { archive: { entry: "dict" }, workbench: { entry: "dict" } } },
  supplier: { field: "supplier", identity: "byId", dict: "supplier", layer: "subject", scene: { archive: { entry: "dict" }, workbench: { entry: "mixed" } } },
  product_name: { field: "product_name", identity: "byId", dict: "product_name", layer: "globalDict", scene: { archive: { entry: "dict" }, workbench: { entry: "dict" } } },
  remark: { field: "remark", identity: "byText", scene: undefined },
};
