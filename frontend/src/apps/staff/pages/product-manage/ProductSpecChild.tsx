import { useEffect, useState } from 'react';
import type { ArchiveColumnCtx } from '../../../../shared/components/archive/archiveSlotTypes.js';
import ProductSkuSubTable from './ProductSkuSubTable.js';
import {
  searchProducts,
  listPriceTypes,
  type SkuSearchRow,
  type ProductGroupRow,
  type PriceTypeView,
} from '../../../../shared/services/api/baseDataApi.js';

/**
 * 产品「规格区间」面板：平铺该产品下全部规格的完整行记录（品牌 / 规格 / 单位×售价×进价）。
 *
 * 与「品牌区间」（ProductBrandSpecChild）的差异只在展示形式：规格区间不再按品牌分组，
 * 直接一张完整行记录表（品牌列保留，行本身仍按召回序）——区间终点相同（规格层），
 * 起点聚合方式不同（品牌=分组下钻，规格=平铺）。价格编辑与平铺列表同套逻辑。
 */
export default function ProductSpecChild({
  parent,
}: {
  parent: ProductGroupRow;
  ctx: ArchiveColumnCtx<ProductGroupRow>;
}) {
  const [skus, setSkus] = useState<SkuSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [priceTypes, setPriceTypes] = useState<PriceTypeView[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      searchProducts({ productId: String(parent.productId), page: 1, size: 200 }),
      listPriceTypes(),
    ])
      .then(([res, pts]) => {
        if (!alive) return;
        setSkus((res.list ?? []).filter((x): x is SkuSearchRow => x.type === 'sku'));
        setPriceTypes((pts ?? []).filter((p) => p.status === 1));
      })
      .catch(() => {
        if (alive) setSkus([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [parent.productId]);

  if (loading && skus.length === 0) {
    return (
      <div style={{ padding: '8px 0', color: 'var(--text-tertiary)' }}>加载中…</div>
    );
  }
  if (skus.length === 0) {
    return (
      <div style={{ padding: '8px 0', color: 'var(--text-tertiary)' }}>该产品下暂无规格</div>
    );
  }

  return <ProductSkuSubTable skus={skus} priceTypes={priceTypes} onPriceTypesChange={setPriceTypes} />;
}
