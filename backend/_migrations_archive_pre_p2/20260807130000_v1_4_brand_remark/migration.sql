-- v1.4：备注从 product 挪到 brand（品牌级备注，不同品牌各自独立，如执行标准/层数）
ALTER TABLE `brand` ADD COLUMN `remark` VARCHAR(500) NOT NULL DEFAULT '';
