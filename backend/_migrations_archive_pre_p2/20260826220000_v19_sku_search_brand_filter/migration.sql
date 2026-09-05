-- 产品档案列表按品牌筛（某品牌下全部规格/产品），覆盖 brandId + status + updateTime
CREATE INDEX `product_sku_search_brandId_status_updateTime_idx` ON `product_sku_search`(`brandId`, `status`, `updateTime`);
