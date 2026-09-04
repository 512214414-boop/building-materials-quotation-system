-- v29：范式检索索引（去宽表改造 · 阶段 1）
--
-- 目的：让「全字段宽松检索」不再依赖 product_sku_search 宽表（反范式冗余）。
--   各表在**各自己的列**上建 FULLTEXT ngram 索引，检索时多路召回（各路走各自索引）
--   + 应用层打分（复用 search-scoring.ts），展示字段读时 join 范式表。
--
-- 收益（对照 v10.1.9 宽表方案）：
--   1. 改品牌名 / 改分类名 = 只 UPDATE 主表一行（MySQL 自动维护该表全文索引），
--      不再由应用层遍历同步宽表 N 行（原 syncSkuSearchByBrand / ByCategory）
--   2. 改价 / 改图 / 改单位 完全不碰检索索引（原每次都整行重建宽表）
--   3. 主数据零冗余（名字不再在宽表各存一份）
--
-- 前置：MySQL 8.0.46 内置 ngram 解析器；ngram_token_size=2（默认）
--   短词（ppr/dn25/3.5）因 min_token_size=3 不进索引 → 由应用层走参数化 LIKE 召回，
--   与宽表方案现状一致（不更差）；未来若需覆盖，走 pg_trgm / 检索引擎。
--
-- 阶段 1 只加索引，宽表保留作为对拍基线（阶段 2 写范式检索实现对拍，阶段 3 切读，阶段 4 删宽表）。

-- 产品名 / 产品俗称（product）
CREATE FULLTEXT INDEX `ft_product_name` ON `product`(`name`) WITH PARSER ngram;
CREATE FULLTEXT INDEX `ft_product_remark` ON `product`(`remark`) WITH PARSER ngram;

-- 规格型号 / 执行标准（spec）
CREATE FULLTEXT INDEX `ft_spec_model` ON `spec`(`specModel`) WITH PARSER ngram;
CREATE FULLTEXT INDEX `ft_spec_remark` ON `spec`(`remark`) WITH PARSER ngram;

-- 品牌名 / 分类名（字典表，行数少；建索引让长词也走倒排）
CREATE FULLTEXT INDEX `ft_brand_name` ON `brand`(`name`) WITH PARSER ngram;
CREATE FULLTEXT INDEX `ft_category_name` ON `category`(`name`) WITH PARSER ngram;
