-- v1.7.1 移除客户分级（customer_level）
--
-- 设计依据（用户理念）：
--   - 价格非常灵活，即便大客户也可能卖得贵，分级控制不了、无业务决策价值
--   - 分类（customer_type）保留，仅作标识性字段、不参与业务决策
--   - 表结构精简，不设计乱七八糟的字段
--
-- MySQL 枚举（ENUM）为列内联类型，DROP COLUMN 即删除列与其枚举定义

ALTER TABLE `customers` DROP COLUMN `customer_level`;
