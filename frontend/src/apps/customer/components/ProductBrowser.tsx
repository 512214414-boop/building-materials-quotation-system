// 客户端产品浏览（v7.1 适配 SPU + 品牌系列 + 规格 + SKU 检索宽表）
//
// v7.1 适配：
//   1. 检索：searchProductsPublic({ keyword, size, categoryId }) 替代 searchVariants
//      返回 SearchProductResult（首条 CreationPrompt 不计入分页，其余为 SkuSearchRow[]）
//   2. 数据结构：SkuSearchRow[] 替代 VariantSearchRow[]
//   3. 客户端不展示进价（公开端 purchasePriceDefault 已被剥离为 null）
//   4. 分类筛选：v7.1 CategoryView 扁平结构（无 parentId/children），SkuSearchRow 携带 categoryId 可服务端过滤
//   5. 简化分页：searchProductsPublic 一次性返回 size 条，前端按需追加（去重）

import { useCallback, useEffect, useState } from 'react';
import { Empty, Spin } from 'antd';
import { DsInput } from '../../../shared/components/index.js';
import { SearchOutlined } from '@ant-design/icons';
import {
  listPublicCategories,
  searchProductsPublic,
  type CategoryView,
  type SkuSearchRow,
} from '../../../shared/services/api/baseDataApi.js';
import { useSafeAsyncEffect } from '../../../shared/hooks/useSafeAsyncEffect.js';
import ProductCardGrid from './ProductCardGrid.js';

interface Props {
  onSelectProduct: (p: SkuSearchRow) => void;
  /** 紧凑模式（弹层内） */
  compact?: boolean;
  selectedId?: string | null;
}

export default function ProductBrowser({ onSelectProduct, compact, selectedId }: Props) {
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [debouncedKw, setDebouncedKw] = useState('');
  const [products, setProducts] = useState<SkuSearchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKw(keyword.trim()), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  // v3.1 安全异步 effect：组件卸载后跳过 setCategories（避免卸载后 setState）
  useSafeAsyncEffect(async () => {
    try {
      const cats = await listPublicCategories();
      setCategories(cats);
    } catch {
      setCategories([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // v7.1 searchProductsPublic 一次返回 size 条
      // 客户端公开端自动剥离 purchasePriceDefault
      const size = compact ? 30 : 50;
      const kw = debouncedKw || '';
      const result = await searchProductsPublic({
        keyword: kw || undefined,
        categoryId: categoryId ?? undefined,
        size,
      });
      // 首条 CreationPrompt 不计入列表，过滤出 SkuSearchRow
      const list: SkuSearchRow[] = (result.list ?? []).filter(
        (r): r is SkuSearchRow => r.type === 'sku',
      );
      setProducts(list);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedKw, categoryId, compact]);

  // v3.1 安全异步 effect：组件卸载后跳过 load 回调（避免卸载后 setState）
  useSafeAsyncEffect(() => load(), [load]);

  // v7.1：分类扁平结构（无 parentId/children），直接平铺展示
  const flatCategories = categories;

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', gap: 12, minHeight: compact ? 320 : 480 }}>
      {/* 分类 */}
      <aside
        style={{
          flexShrink: 0,
          width: compact ? '100%' : 160,
          maxHeight: compact ? 120 : undefined,
          overflow: compact ? 'auto' : 'auto',
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          flexWrap: compact ? 'wrap' : 'nowrap',
          gap: 6,
          paddingRight: compact ? 0 : 8,
          borderRight: compact ? 'none' : '1px solid var(--border-neutral-l1)',
        }}
      >
        <CatChip
          label="全部"
          active={categoryId == null}
          onClick={() => setCategoryId(null)}
        />
        {flatCategories.map((cat) => (
          <CatChip
            key={cat.id}
            label={cat.name}
            active={categoryId === cat.id}
            onClick={() => setCategoryId(cat.id)}
          />
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DsInput
          placeholder="搜索产品名称 / 规格 / 品牌"
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        {loading && products.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : products.length === 0 ? (
          <Empty description="暂无产品，可换关键词" style={{ marginTop: 48 }} />
        ) : (
          <ProductCardGrid products={products} onSelect={onSelectProduct} selectedId={selectedId} />
        )}
      </div>
    </div>
  );
}

function CatChip({
  label,
  active,
  onClick,
  nested,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: nested ? '4px 8px 4px 16px' : '6px 10px',
        fontSize: 12,
        borderRadius: 'var(--radius-6)',
        border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border-neutral-l2)'}`,
        background: active ? 'var(--bg-brand-popup)' : 'var(--bg-base-default)',
        color: active ? 'var(--text-brand)' : 'var(--text-secondary)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}
