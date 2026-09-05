import { useEffect, useMemo, useState } from 'react';
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
 * 产品「一行一产品」查看面板的内容：按真实数据关系分层展示 产品 → 品牌 → 规格。
 *
 * 数据模型（v22）：spec 表 UNIQUE(productId, brandId, specModel)，一条 spec 行 = 该产品下
 * 某个品牌的一个规格；品牌是全局档案（brand），产品通过 product_brand 关联售卖品牌。
 * 因此收起态摘要显示品牌数，本面板内按品牌分组、组内是该品牌的全部规格（层级与范式对齐，
 * 不再把「品牌×规格」组合行统称为 SKU——没有独立 SKU 表，SKU 不是数据实体）。
 *
 * 分组顺序 = 召回序（searchProducts 返回序），与列表摘要、代表图的约定一致。
 * 价格编辑与平铺列表同套逻辑（ProductSkuSubTable 内 useSkuPriceState）；价格类型字典
 * 由本组件统一拉取一次并分发给各品牌子表，避免每组重复请求。
 */
export default function ProductBrandSpecChild({
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

  // 按品牌分组（保持召回序）：brandId → 该品牌下的规格行
  const brandGroups = useMemo(() => {
    const groups = new Map<string, { brandId: string; brandName: string; skus: SkuSearchRow[] }>();
    for (const s of skus) {
      const key = String(s.brandId);
      let g = groups.get(key);
      if (!g) {
        g = { brandId: key, brandName: s.brandName || '未命名品牌', skus: [] };
        groups.set(key, g);
      }
      g.skus.push(s);
    }
    return [...groups.values()];
  }, [skus]);

  if (loading && skus.length === 0) {
    return (
      <div style={{ padding: '8px 0', color: 'var(--text-tertiary)' }}>加载中…</div>
    );
  }
  if (brandGroups.length === 0) {
    return (
      <div style={{ padding: '8px 0', color: 'var(--text-tertiary)' }}>该产品下暂无品牌规格</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {brandGroups.map((g) => (
        <div key={g.brandId}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '2px 0 4px',
              borderBottom: '1px solid var(--border-neutral-l2)',
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 600 }}>{g.brandName}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
              {g.skus.length} 个规格
            </span>
          </div>
          <ProductSkuSubTable
            skus={g.skus}
            priceTypes={priceTypes}
            onPriceTypesChange={setPriceTypes}
            showBrandColumn={false}
          />
        </div>
      ))}
    </div>
  );
}
