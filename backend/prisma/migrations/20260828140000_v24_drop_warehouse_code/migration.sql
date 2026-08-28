-- P-002：库房身份只用数据库 id，去掉业务编码列
ALTER TABLE `warehouse` DROP INDEX `warehouse_code_key`;
ALTER TABLE `warehouse` DROP COLUMN `code`;
