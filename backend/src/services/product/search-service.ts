// 检索服务接缝（P4 · SearchService）
//
// 后端检索子系统已落地（services/product/search.ts：FULLTEXT ngram + LIKE 回退 + 范式多路召回 +
// 自定义打分 + 分面 + 渠道反查）。本文件按蓝图 P4 抽「SearchService」端口并给出 DB 实现，
// 使未来 Elasticsearch 实现可经同一端口无缝替换（feature-flag 控制），达成「先 DB 后 ES 可回退」。
//
// 设计要点：
//  - 端口直接复用既有检索函数签名（typeof），零逻辑重复、零类型退化；
//  - 所有既有调用方继续直接用 services/product/search.ts，本接缝是"未来切 ES"的单一替换点；
//  - 不在本文件改动任何既有检索逻辑，避免回归。
import {
  searchProducts,
  searchProductsGrouped,
  listSkuSearchFacets,
  suggest,
  getSkuOptions,
} from './search.js';
import { config } from '../../config/index.js';

export type SearchDriver = 'db' | 'elasticsearch';

/**
 * 检索服务端口。方法签名与 services/product/search.ts 既有实现逐一对应，
 * 未来 ES 实现实现同一端口即可整体替换。
 */
export interface SearchService {
  search: typeof searchProducts;
  searchGrouped: typeof searchProductsGrouped;
  facets: typeof listSkuSearchFacets;
  suggest: typeof suggest;
  skuOptions: typeof getSkuOptions;
}

/** DB 实现：直接委托既有检索子系统（含 FULLTEXT + 范式召回 + 打分），无逻辑重复。 */
export class DbSearchService implements SearchService {
  search = searchProducts;
  searchGrouped = searchProductsGrouped;
  facets = listSkuSearchFacets;
  suggest = suggest;
  skuOptions = getSkuOptions;
}

/**
 * 工厂：按 config.features.searchDriver 选驱动。
 * 当前仅 db 就绪；elasticsearch 等远端驱动尚未实现，安全回退 db 并告警，保证运行时不崩。
 * 接 ES 时仅在此分支 new 对应实现，调用方无感。
 */
export function createSearchService(
  driver: SearchDriver = config.features.searchDriver as SearchDriver,
): SearchService {
  if (driver !== 'db') {
    console.warn(`[search-service] driver "${driver}" 尚未实现，回退 db（P4 ES 接缝预留）`);
  }
  return new DbSearchService();
}

/** 全局检索服务单例（组合根）。 */
export const searchService: SearchService = createSearchService();
