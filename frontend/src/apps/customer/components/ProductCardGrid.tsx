// 客户端产品卡片网格（v7.1 适配 SPU + 品牌系列 + 规格 + SKU 检索宽表，无价）
//
// v7.1 适配：
//   1. 直接接收 SkuSearchRow（来自 searchProductsPublic API）
//   2. 商品全名 = productName + brandName + specName（buildFullName 三参版本）
//   3. 默认单位从 row.defaultUnitName 取（SkuSearchRow 已冗余默认单位名）
//   4. 客户端不展示价格（公开端 searchProductsPublic 已剥离 purchasePriceDefault）

import { PictureOutlined } from '@ant-design/icons';
import type { SkuSearchRow } from '../../../shared/services/api/baseDataApi.js';
import { pickCoverFromView, buildFullName } from './productUtils.js';

interface Props {
  products: SkuSearchRow[];
  onSelect: (p: SkuSearchRow) => void;
  selectedId?: string | null;
}

export default function ProductCardGrid({ products, onSelect, selectedId }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 12,
      }}
    >
      {products.map((p) => {
        const cover = pickCoverFromView(p);
        const active = selectedId === p.id;
        const fullName = buildFullName(p.productName, p.brandName, p.specModel);
        const defaultUnitName = p.defaultUnitName ?? '件';
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              textAlign: 'left',
              padding: 0,
              border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border-neutral-l1)'}`,
              borderRadius: 'var(--radius-8)',
              background: active ? 'var(--bg-brand-popup)' : 'var(--bg-base-secondary)',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                background: cover
                  ? `url("${cover}") center/cover, var(--bg-base-tertiary)`
                  : 'var(--bg-base-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-quaternary)',
              }}
            >
              {!cover && <PictureOutlined style={{ fontSize: 28 }} />}
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-default)',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {fullName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {p.specModel || '—'} · {defaultUnitName}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
