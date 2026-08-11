-- v13.2 迁移：supplier.name 唯一约束（业务补全「按名称唯一复用/合并」的数据库保证）
-- 变更性质：
--   1. supplier.name 加唯一索引（面价渠道等系统补全默认值按名称唯一，杜绝重复建档）
--   2. 前置校验：现有 supplier 数据名称无重复（9 条 9 个唯一名），可直接加唯一索引
CREATE UNIQUE INDEX `supplier_name_key` ON `supplier`(`name`);

-- 同步更新字段 COMMENT（对齐 schema.prisma v13.2）
ALTER TABLE `supplier`
  MODIFY COLUMN `name` VARCHAR(200) NOT NULL COMMENT '供应商名称（唯一：业务补全按名称复用/合并，杜绝重复建档）';
