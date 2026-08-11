// 客户端产品图文工具（v8.0 适配 SPU 合并 + 品牌单字段 + 单位挂 SPU + SKU 检索宽表）
//
// v8.0 设计原则：
//   1. SPU 合并：product 表含 name + specModel（产品名称+规格型号合并为一条 SPU 记录）
//   2. 品牌单字段：brand.name 直接存品牌名（不拆分品牌+系列）
//   3. 单位挂 SPU：unit.productId（同 SPU 所有品牌共享换算率）
//   4. SKU = SPU + 品牌 + 单位（三者组合唯一确定，无 specId）
//   5. 客户端检索：searchProductsPublic(keyword, size) 返回 SearchProductResult
//      首条 CreationPrompt（不计入分页），其余为 SkuSearchRow[]
//   6. 公开端剥离进价：searchProductsPublic 的 SkuSearchRow.purchasePriceDefault 为 null
//   7. 商品全名 = productName + (brandName ? ' ' + brandName : '') + (specModel ? ' ' + specModel : '')
//   8. 图片：SkuSearchRow.mainImageUrl（后端聚合好的主图 URL）

import type { SkuSearchRow } from '../../../shared/services/api/baseDataApi.js';

/** 拼接商品全名：productName + (brandName ? ' ' + brandName : '') + (specModel ? ' ' + specModel : '') */
export function buildFullName(
  productName: string,
  brandName?: string | null,
  specModel?: string | null,
): string {
  const parts: string[] = [productName];
  if (brandName && brandName.trim()) parts.push(brandName.trim());
  if (specModel && specModel.trim()) parts.push(specModel.trim());
  return parts.join(' ');
}

/** URL 解析（客户端相对路径直连后端 /uploads/） */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url;
}

/**
 * v8.0 从 SkuSearchRow 提取封面图。
 * v1.5.6.2 性能：优先用宽表冗余的缩略图（mainImageThumbUrl，200x200），
 * 客户端卡片/列表避免加载 1280px 原图；旧数据无缩略图时回退原图。
 */
export function pickCoverFromSearch(item: SkuSearchRow): string | null {
  return resolveImageUrl(item.mainImageThumbUrl || item.mainImageUrl);
}

/**
 * v8.0 从 SkuSearchRow 提取图片画廊。
 * SkuSearchRow 只有主图（无完整图片列表），返回单图或空。
 * v1.5.6.2：画廊/预览用原图（mainImageUrl），保证清晰度。
 */
export function pickGalleryFromSearch(item: SkuSearchRow): string[] {
  const cover = resolveImageUrl(item.mainImageUrl);
  return cover ? [cover] : [];
}

/**
 * v8.0 兼容别名：从 SkuSearchRow 提取封面图。
 * 旧名 pickCoverFromView 保留以减小调用方改动。
 */
export function pickCoverFromView(item: SkuSearchRow): string | null {
  return pickCoverFromSearch(item);
}

/**
 * v8.0 兼容别名：从 SkuSearchRow 提取图片画廊。
 * 旧名 pickGalleryFromView 保留以减小调用方改动。
 */
export function pickGalleryFromView(item: SkuSearchRow): string[] {
  return pickGalleryFromSearch(item);
}

/** v8.0 SkuSearchRow 类型再导出（便于调用方引用） */
export type { SkuSearchRow };
