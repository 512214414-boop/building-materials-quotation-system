-- v15.4 category 补 name 全局唯一约束（A 类全局字典去重键的数据库保障）
-- 背景：registry.quickAdd 按名去重依赖「findFirst → create + P2002 并发回查」，
--       P2002 兜底必须由数据库唯一约束触发——category 此前缺 name 唯一索引，
--       并发下可能重复建同名分类（brand/supplier/price_type 均有此约束）。
-- 现有数据检查：category 现有 name（未分类 / 给水管材）无重复，可直接加唯一索引。

-- CreateIndex
CREATE UNIQUE INDEX `category_name_key` ON `category`(`name`);
