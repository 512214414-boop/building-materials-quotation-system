-- 2026-09-05 收口：产品名全局唯一（撤 v23 产品名字典后，唯一键从 [categoryId,name] 收紧为 [name]）
-- 裁决：A 撤字典 · 名全局唯一（《根因分析与预防措施.md》定稿版 §0/§5；《架构蓝图 v3》§9）
-- 实证：真实库 290 产品名两两不同、跨分类同名 = 0 → 仅索引切换，无任何数据改写，幂等可重跑
-- 前置：schema.prisma product 已改 @@unique([name])；本迁移与后端查重代码同批落地（先 deploy 再起服务）
ALTER TABLE `product` DROP INDEX `product_categoryId_name_key`;
ALTER TABLE `product` ADD UNIQUE INDEX `product_name_key`(`name`);
