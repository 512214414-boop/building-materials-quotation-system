-- v15.4 移除分类默认值 0（v15.3 统一引用类语义）
-- 背景：不再有「categoryId=0 未分类」魔数预设——分类空输入由应用层 resolveCategoryRef
--       按 name 唯一 ensure「未分类」真实记录（存在复用/不存在新建），categoryId 总是应用层
--       解析后的有效记录 id，DB 不再需要 DEFAULT 0。
-- 存量 categoryId=0 的行保留（0 为既有「未分类」记录 id，外键仍满足），后续建档均由应用层解析写入。

-- AlterTable
ALTER TABLE `product` MODIFY `categoryId` INT NOT NULL;

-- AlterTable
ALTER TABLE `product_sku_search` MODIFY `categoryId` BIGINT NOT NULL;
