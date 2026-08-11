// 客户端产品中心（v7.1 适配 SPU + 品牌系列 + 规格 + SKU 检索宽表）
//
// v7.1 适配：
//   1. 选品回调从 VariantSearchRow 改为 SkuSearchRow
//   2. 详情抽屉改为直接传入 SkuSearchRow（不再用 productId 拉取）
//   3. 客户端不展示价格（公开端 searchProductsPublic 已剥离 purchasePriceDefault）

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import ProductBrowser from '../components/ProductBrowser.js';
import ProductDetailDrawer from '../components/ProductDetailDrawer.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { usePurchaseListStore } from '../../../shared/stores/purchase-list.js';
import type { SkuSearchRow } from '../../../shared/services/api/baseDataApi.js';

export default function ProductCenter() {
  const { message } = AntdApp.useApp();
  const { load, purchaseQuoteStatus } = usePurchaseListStore();
  const [detailSku, setDetailSku] = useState<SkuSearchRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const canAdd = purchaseQuoteStatus === 'pending';

  const openDetail = (p: SkuSearchRow) => {
    setDetailSku(p);
    setDetailOpen(true);
  };

  return (
    <ViewFrame
      actionBar={{
        statusHint: '按分类或关键词浏览店内产品，查看图文规格后加入采购清单（不展示价格）',
        actions: (
          <Link
            to="/"
            style={{ fontSize: 13, color: 'var(--text-brand)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            去采购清单 →
          </Link>
        ),
      }}
      dialogs={
        <ProductDetailDrawer
          sku={detailSku}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          canAddToList={canAdd}
          onAdded={() => {
            message.success('可在采购清单中查看');
          }}
        />
      }
    >
      {!canAdd && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-6)',
            background: 'var(--bg-base-tertiary)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          当前清单已确认报价，仍可浏览产品，但不能再加入清单。如需加品请联系门店将状态改回待确认。
        </div>
      )}

      <ProductBrowser onSelectProduct={openDetail} />
    </ViewFrame>
  );
}
