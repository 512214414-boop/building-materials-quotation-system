-- v9.1 迁移：sale_price 新增 isDefault 字段，与 purchase_price.isDefault 对等
-- 变更性质：sale_price 表新增 isDefault BOOLEAN DEFAULT false
--   - 同一 (brandId, unitId) 下有且仅有一个 isDefault=true
--   - 列表"售价"列默认显示 isDefault=true 的价格（替代原"最低售价"逻辑）

-- 1. sale_price 新增 isDefault 列（先允许 NULL，迁移数据后设为 NOT NULL）
ALTER TABLE `sale_price`
  ADD COLUMN `isDefault` BOOLEAN NULL;

-- 2. 数据迁移：每个 (brandId, unitId) 下取 price 最低的一条设为 isDefault=true
--    （将原"最低价显示"语义平滑迁移为"默认售价显示"）
UPDATE `sale_price` sp
INNER JOIN (
  SELECT brandId, unitId, MIN(price) AS min_price
  FROM `sale_price`
  WHERE status = 1
  GROUP BY brandId, unitId
) AS t ON sp.brandId = t.brandId AND sp.unitId = t.unitId AND sp.price = t.min_price
SET sp.isDefault = 1
WHERE sp.isDefault IS NULL;

-- 3. 对于没有匹配到最低价的行（理论上不存在，兜底），设为 false
UPDATE `sale_price` SET isDefault = 0 WHERE isDefault IS NULL;

-- 4. 设为 NOT NULL，默认 false
ALTER TABLE `sale_price`
  MODIFY COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT 0;

-- 5. 添加中文 COMMENT
ALTER TABLE `sale_price`
  MODIFY COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT 0 COMMENT '是否默认展示售价（与 purchase_price.isDefault 对等，同 SKU 下有且仅有一个 true）';
