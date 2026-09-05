-- v11.3 供应商点位规则表（批量改价）
--
-- 变更内容：
--   1. 新增 supplier_point_rule 表：记录「供应商 + 品牌名 + 分类名 → 点位」
--   2. 用途：批量改价工具读取该组旧点位自动带出；点位调整时按 新点位/旧点位 比例重算该组进价
--   3. 设计依据：点位是跟供应商谈出来的价格政策，挂在供应商维度；品牌名/分类名粒度由人控制
--   4. v11.0 解耦对齐：supplierId 不建物理外键，保留 BigInt 字段 + 索引 + supplierName 快照
--
-- 表结构（Prisma 模型 supplier_point_rule，字段 camelCase，无 @map）：
--   id           BigInt   PK 自增
--   supplierId   BigInt   供应商ID
--   supplierName String?  供应商名称快照（来自 supplier.name）
--   brandName    String   品牌名（粒度由人控制：同品牌不同系列点位不同则品牌名录细）
--   categoryName String   分类名（粒度由人控制：管材/管件点位不同则分类名录细）
--   point        Decimal  点位（如 0.58 = 面价×58%）
--   createdAt    DateTime
--   updatedAt    DateTime

CREATE TABLE `supplier_point_rule` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplierId` BIGINT NOT NULL,
  `supplierName` VARCHAR(200) NULL,
  `brandName` VARCHAR(100) NOT NULL,
  `categoryName` VARCHAR(100) NOT NULL,
  `point` DECIMAL(10,4) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `supplier_point_rule_supplierId_brandName_categoryName_key` (`supplierId`, `brandName`, `categoryName`),
  KEY `supplier_point_rule_supplierId_idx` (`supplierId`),
  KEY `supplier_point_rule_brandName_idx` (`brandName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 