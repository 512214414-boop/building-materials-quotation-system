-- v10.1.9：产品搜索采用 MySQL FULLTEXT + ngram 分词器
--   设计目的：支持用户任意输入（无空格、乱序、多关键词）都能命中
--   原 LIKE '%kw%' 全表扫描，性能差且不支持任意顺序匹配
--   新方案：FULLTEXT INDEX 走倒排索引 + ngram 自动按 2 字符滑窗分词
--   示例：「6分伟星」→ ngram 分词为 ["6分", "分伟", "伟星"]，任一命中即返回
--
--   前置条件：MySQL 5.7.6+ 内置 ngram 解析器（当前生产为 8.0.46）
--   ngram_token_size=2（默认值，单字符查询走应用层降级 LIKE）

-- 在 product_sku_search.keywords 上创建全文索引（ngram 分词器）
CREATE FULLTEXT INDEX `ft_keywords` ON `product_sku_search`(`keywords`) WITH PARSER ngram;
