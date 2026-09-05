-- v23：宽表补产品俗称；名称 keywords = 名称+俗称+规格型号+品牌+分类（不含执行标准、不含渠道名）
-- 执行标准视图打 spec.remark（宽表 remark 列）；FULLTEXT ngram 召回，禁止全表扫

ALTER TABLE `product_sku_search`
  ADD COLUMN `productRemark` VARCHAR(500) NOT NULL DEFAULT '' AFTER `remark`;

UPDATE `product_sku_search` s
INNER JOIN `spec` sp ON sp.id = s.specId
INNER JOIN `product` p ON p.id = sp.productId
SET
  s.productRemark = IFNULL(p.remark, ''),
  s.keywords = LOWER(TRIM(CONCAT_WS(' ',
    NULLIF(p.name, ''),
    NULLIF(p.remark, ''),
    NULLIF(sp.specModel, ''),
    NULLIF(s.brandName, ''),
    NULLIF(s.categoryName, '')
  )));

CREATE FULLTEXT INDEX `ft_sku_remark` ON `product_sku_search`(`remark`) WITH PARSER ngram;
