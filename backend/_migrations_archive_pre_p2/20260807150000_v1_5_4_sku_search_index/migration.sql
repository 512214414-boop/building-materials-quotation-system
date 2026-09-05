-- v1.5.4 性能优化：产品 SKU 宽表列表查询复合索引
-- 背景：searchProducts 无筛选时 WHERE status=? ORDER BY updateTime DESC LIMIT 20
--       分类筛选时 WHERE categoryId=? AND status=? ORDER BY updateTime DESC
--       数据量增长后全表扫描+filesort 导致翻页变慢，加复合索引覆盖两条路径
CREATE INDEX product_sku_search_status_update_time_idx ON product_sku_search (status, updateTime);
CREATE INDEX product_sku_search_category_status_update_time_idx ON product_sku_search (categoryId, status, updateTime);
