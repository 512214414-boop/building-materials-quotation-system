-- v25：客户类型字典、联系/开票 N；单据标题归一、客户信息快照、整单数量

-- 1. 客户类型：enum → 字符串，再建字典表
ALTER TABLE `customers` MODIFY COLUMN `customer_type` VARCHAR(50) NOT NULL DEFAULT '个人业主';
UPDATE `customers` SET `customer_type` = CASE
  WHEN `customer_type` IN ('company', '公司') THEN '公司'
  ELSE '个人业主'
END;

CREATE TABLE `customer_type` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_type_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `customer_type` (`name`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
VALUES
  ('个人业主', 0, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('公司', 1, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- 2. 联系信息（与供应商同构）
CREATE TABLE `customer_contact` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `customerId` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT '',
  `method` VARCHAR(50) NOT NULL DEFAULT '',
  `value` VARCHAR(200) NOT NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `customer_contact_customerId_idx` (`customerId`),
  INDEX `customer_contact_value_idx` (`value`),
  CONSTRAINT `customer_contact_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `customer_contact` (`customerId`, `name`, `method`, `value`, `isDefault`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT `id`, COALESCE(`name`, ''), '电话', `phone`, true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `customers`
WHERE `phone` IS NOT NULL AND TRIM(`phone`) <> '';

INSERT INTO `customer_contact` (`customerId`, `name`, `method`, `value`, `isDefault`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT `id`, COALESCE(`name`, ''), '微信', `wechat`, false, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `customers`
WHERE `wechat` IS NOT NULL AND TRIM(`wechat`) <> '';

-- 3. 开票信息多行
CREATE TABLE `customer_invoice` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `customerId` BIGINT NOT NULL,
  `invoiceTitle` VARCHAR(200) NOT NULL DEFAULT '',
  `taxNumber` VARCHAR(50) NOT NULL DEFAULT '',
  `bankName` VARCHAR(100) NOT NULL DEFAULT '',
  `bankAccount` VARCHAR(50) NOT NULL DEFAULT '',
  `address` VARCHAR(500) NOT NULL DEFAULT '',
  `phone` VARCHAR(30) NOT NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `customer_invoice_customerId_idx` (`customerId`),
  CONSTRAINT `customer_invoice_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `customer_invoice` (
  `customerId`, `invoiceTitle`, `taxNumber`, `bankName`, `bankAccount`, `address`, `phone`,
  `isDefault`, `sortOrder`, `createdAt`, `updatedAt`
)
SELECT
  `id`,
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.invoiceTitle')), ''),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.taxNumber')), ''),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.bankName')), ''),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.bankAccount')), ''),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.address')), ''),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.phone')), ''),
  true, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `customers`
WHERE `invoice_info` IS NOT NULL
  AND JSON_TYPE(`invoice_info`) = 'OBJECT'
  AND (
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.invoiceTitle')), '') IS NOT NULL
    OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.taxNumber')), '') IS NOT NULL
    OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.bankName')), '') IS NOT NULL
    OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.bankAccount')), '') IS NOT NULL
    OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.address')), '') IS NOT NULL
    OR NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`invoice_info`, '$.phone')), '') IS NOT NULL
  );

-- 4. 单据：客户信息快照加长、联系方式名、整单数量；标题与整单备注归一
ALTER TABLE `documents` MODIFY COLUMN `customerPhone` VARCHAR(200) NULL;
ALTER TABLE `documents` ADD COLUMN `customerContactMethod` VARCHAR(50) NULL;
ALTER TABLE `documents` ADD COLUMN `total_qty` DECIMAL(12, 2) NOT NULL DEFAULT 0;

UPDATE `documents` d
SET `total_qty` = (
  SELECT COALESCE(SUM(`qty`), 0) FROM `document_lines` WHERE `documentId` = d.`id`
);

UPDATE `documents`
SET `title` = `note`
WHERE (`title` IS NULL OR TRIM(`title`) = '') AND `note` IS NOT NULL AND TRIM(`note`) <> '';
