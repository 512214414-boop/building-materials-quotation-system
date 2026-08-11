-- v1.5.6.2 性能优化：SKU 宽表冗余主图缩略图
-- 背景：宽表 mainImageUrl 存的是原图（{hash}_orig.webp，长边 1280px），
--       产品管理列表 24px 图标列与客户端商品卡片全部加载原图，
--       10万级 SKU 列表每个图标都是 1280px 原图，带宽与解码开销显著。
-- 方案：新增 mainImageThumbUrl 冗余列（{hash}_thumb.webp，200x200），
--       列表/卡片用缩略图，详情/预览才取原图。
ALTER TABLE product_sku_search ADD COLUMN mainImageThumbUrl VARCHAR(500) NULL;

-- 回填：由 mainImageUrl 推导缩略图（{hash}_orig.webp → {hash}_thumb.webp）
UPDATE product_sku_search
SET mainImageThumbUrl = REPLACE(mainImageUrl, '_orig.webp', '_thumb.webp')
WHERE mainImageUrl IS NOT NULL AND mainImageUrl LIKE '%_orig.webp';
