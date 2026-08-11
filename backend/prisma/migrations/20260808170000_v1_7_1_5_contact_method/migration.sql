-- v1.7.1.5 迁移：建立联系方式方式字典表（对齐 price_type 全局字典范式）
-- 变更性质：
--   1. 新增 contact_method 字典表（全局公用，供应商联系信息方式）
--   2. 供应商 contacts[].method 使用本字典的值，可自由维护
--   3. 已使用的方式作为字符串保留在联系信息中，删除字典不影响历史数据

-- ============== 1. 创建 contact_method 字典表 ==============
CREATE TABLE `contact_method` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `contact_method_name_key`(`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============== 2. 从 supplier.contacts JSON 提取已使用的方式（去重） ==============
INSERT INTO `contact_method` (`name`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT DISTINCT
  JSON_UNQUOTE(JSON_EXTRACT(c.value, '$.method')) AS method_name,
  0 AS sortOrder,
  1 AS status,
  NOW(3) AS createdAt,
  NOW(3) AS updatedAt
FROM `supplier` s
JOIN JSON_TABLE(
  s.`contacts`,
  '$[*]' COLUMNS (value JSON PATH '$')
) c
WHERE s.`contacts` IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(c.value, '$.method')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(c.value, '$.method')) <> '';

-- ============== 3. 添加默认字典数据（如字典为空时）：微信/电话/座机/邮箱/QQ ==============
INSERT INTO `contact_method` (`name`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT * FROM (
  SELECT '微信' AS name, 1 AS sortOrder, 1 AS status, NOW(3) AS createdAt, NOW(3) AS updatedAt
  UNION SELECT '电话', 2, 1, NOW(3), NOW(3)
  UNION SELECT '座机', 3, 1, NOW(3), NOW(3)
  UNION SELECT '邮箱', 4, 1, NOW(3), NOW(3)
  UNION SELECT 'QQ', 5, 1, NOW(3), NOW(3)
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM `contact_method` LIMIT 1);

-- ============== 4. 添加中文 COMMENT ==============
ALTER TABLE `contact_method`
  MODIFY COLUMN `name` VARCHAR(50) NOT NULL COMMENT '方式名称（如微信、电话、邮箱、QQ）',
  MODIFY COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0 COMMENT '排序',
  MODIFY COLUMN `status` INTEGER NOT NULL DEFAULT 1 COMMENT '状态 1启用 0禁用';
