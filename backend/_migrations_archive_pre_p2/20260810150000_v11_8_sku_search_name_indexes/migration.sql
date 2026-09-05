-- v11.8 规模升级（几十万 SKU）：
-- 建档去重 / 相似档案候选的前缀 LIKE 粗筛需要走 B-tree 索引，禁止函数包裹列导致的全表扫描
CREATE INDEX `product_sku_search_productName_idx` ON `product_sku_search`(`productName`);
CREATE INDEX `product_sku_search_specModel_idx` ON `product_sku_search`(`specModel`);
