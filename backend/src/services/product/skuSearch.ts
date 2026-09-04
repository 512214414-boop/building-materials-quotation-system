/**
 * skuSearch.ts —— 检索关键词拼接（去宽表改造后仅保留此函数）
 *
 * 【历史】本文件原是 product_sku_search 宽表的同步函数族
 *   （syncSkuSearchBySpecBrand / ByProduct / ByBrand / ByCategory / syncAllSkuSearch），
 *   任何写操作（改价/改图/改名/改分类/建档）都会触发整行重建宽表。
 *
 * 【为什么删除】宽表是**写时同步的派生表**：
 *   1. 会陈旧——改单位（spec_unit.isDisplay）未触发同步，宽表 defaultUnitId 记成非显示单位，
 *      连带价格取不到（对拍发现 93 行单位错、601 行进价缺失）
 *   2. 留孤儿行——spec 删除后宽表行仍在（对拍发现 spec=576）
 *   3. 规模代价——改一次品牌名要遍历该品牌全部 spec 逐行重建（几十万行时不可行）
 *
 * 【替代方案】检索改为范式多路召回（searchNormalized.recallSpecRowsNormalized），
 *   展示字段读时批量计算（searchNormalized.buildSkuRows）——无冗余、无同步、实时准确。
 *
 * 【保留】buildKeywords：关键词拼接规则，宽表实现与范式实现共用同一口径，保持检索语义一致。
 */

/** 拼接检索关键词：产品名 + 俗称 + 规格型号 + 品牌名 + 分类名（小写、空格分隔） */
export function buildKeywords(parts: {
  productName: string;
  specModel: string;
  brandName: string;
  /** 产品俗称。规格备注（执行标准）不拼进名称层关键词 */
  productRemark?: string;
  categoryName?: string;
}): string {
  const { productName, specModel, brandName, productRemark = '', categoryName = '未分类' } = parts;
  return [productName, productRemark, specModel, brandName, categoryName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
