-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `view_permissions` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_code` VARCHAR(30) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(50) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_user_code_key`(`user_code`),
    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `role_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_roles_user_id_idx`(`user_id`),
    INDEX `user_roles_role_id_idx`(`role_id`),
    UNIQUE INDEX `user_roles_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customer_code` VARCHAR(30) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `name` VARCHAR(100) NULL,
    `wechat` VARCHAR(100) NULL,
    `company` VARCHAR(200) NULL,
    `note` TEXT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `customer_type` VARCHAR(50) NOT NULL DEFAULT '个人业主',
    `discount_rate` DECIMAL(5, 2) NOT NULL DEFAULT 100,
    `invoice_info` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customer_code_key`(`customer_code`),
    UNIQUE INDEX `customers_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `authorization_codes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(10) NOT NULL,
    `phone` VARCHAR(200) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdBy` BIGINT NOT NULL,
    `creatorName` VARCHAR(50) NULL,
    `source` VARCHAR(20) NOT NULL DEFAULT 'manual',
    `activatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `authorization_codes_code_key`(`code`),
    INDEX `authorization_codes_phone_idx`(`phone`),
    INDEX `authorization_codes_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `access_requests` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(200) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `reviewedBy` BIGINT NULL,
    `reviewerName` VARCHAR(50) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` VARCHAR(500) NULL,
    `issuedAuthCode` VARCHAR(10) NULL,
    `issuedAuthCodeExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `access_requests_phone_idx`(`phone`),
    INDEX `access_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customerId` BIGINT NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `authorizationCodeId` BIGINT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customer_sessions_token_key`(`token`),
    INDEX `customer_sessions_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customerId` BIGINT NOT NULL,
    `label` VARCHAR(50) NULL,
    `contact` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `province` VARCHAR(50) NULL,
    `city` VARCHAR(50) NULL,
    `district` VARCHAR(50) NULL,
    `detail` VARCHAR(500) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_addresses_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_type` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_type_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_contact` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customerId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL DEFAULT '',
    `method` VARCHAR(50) NOT NULL DEFAULT '',
    `value` VARCHAR(200) NOT NULL DEFAULT '',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_contact_customerId_idx`(`customerId`),
    INDEX `customer_contact_value_idx`(`value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_invoice_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `product_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `spec` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `productId` BIGINT NOT NULL,
    `brandId` BIGINT NOT NULL,
    `specModel` VARCHAR(200) NOT NULL,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `spec_productId_brandId_idx`(`productId`, `brandId`),
    INDEX `spec_productId_idx`(`productId`),
    INDEX `spec_brandId_idx`(`brandId`),
    UNIQUE INDEX `spec_productId_brandId_specModel_key`(`productId`, `brandId`, `specModel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_brand` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `productId` BIGINT NOT NULL,
    `brandId` BIGINT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_brand_productId_idx`(`productId`),
    INDEX `product_brand_brandId_idx`(`brandId`),
    UNIQUE INDEX `product_brand_productId_brandId_key`(`productId`, `brandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `brand_name_key`(`name`),
    INDEX `brand_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `unitName` VARCHAR(50) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `unit_status_idx`(`status`),
    UNIQUE INDEX `unit_unitName_key`(`unitName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `spec_unit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `isDisplay` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `spec_unit_specId_idx`(`specId`),
    INDEX `spec_unit_unitId_idx`(`unitId`),
    UNIQUE INDEX `spec_unit_specId_unitId_key`(`specId`, `unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand_unit_conversion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `conversionRate` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `brand_unit_conversion_specId_idx`(`specId`),
    INDEX `brand_unit_conversion_unitId_idx`(`unitId`),
    UNIQUE INDEX `brand_unit_conversion_specId_unitId_key`(`specId`, `unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `price_type` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `price_type_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_method` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contact_method_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_price` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `priceTypeId` BIGINT NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,

    INDEX `sale_price_specId_unitId_idx`(`specId`, `unitId`),
    INDEX `sale_price_priceTypeId_idx`(`priceTypeId`),
    UNIQUE INDEX `sale_price_specId_unitId_priceTypeId_key`(`specId`, `unitId`, `priceTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_price` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,

    INDEX `purchase_price_specId_unitId_idx`(`specId`, `unitId`),
    INDEX `purchase_price_supplierId_idx`(`supplierId`),
    UNIQUE INDEX `purchase_price_specId_unitId_supplierId_key`(`specId`, `unitId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_image` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `mediumUrl` VARCHAR(500) NOT NULL DEFAULT '',
    `thumbnailUrl` VARCHAR(500) NOT NULL DEFAULT '',
    `width` INTEGER NOT NULL DEFAULT 0,
    `height` INTEGER NOT NULL DEFAULT 0,
    `size` INTEGER NOT NULL DEFAULT 0,
    `hash` VARCHAR(64) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isMain` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_image_specId_idx`(`specId`),
    INDEX `product_image_hash_idx`(`hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `remark` TEXT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supplier_name_key`(`name`),
    INDEX `supplier_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `address_type` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `address_type_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_contact` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplierId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL DEFAULT '',
    `method` VARCHAR(50) NOT NULL DEFAULT '',
    `value` VARCHAR(200) NOT NULL DEFAULT '',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `supplier_contact_supplierId_idx`(`supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_address` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplierId` BIGINT NOT NULL,
    `addressTypeId` BIGINT NULL,
    `addressText` VARCHAR(500) NOT NULL,
    `lng` DECIMAL(10, 7) NULL,
    `lat` DECIMAL(10, 7) NULL,
    `coordSource` ENUM('geocoded', 'manual') NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `supplier_address_supplierId_idx`(`supplierId`),
    INDEX `supplier_address_addressTypeId_idx`(`addressTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_business_category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplierId` BIGINT NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `supplier_business_category_supplierId_idx`(`supplierId`),
    INDEX `supplier_business_category_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `supplier_business_category_supplierId_categoryId_key`(`supplierId`, `categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_business_brand` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplierId` BIGINT NOT NULL,
    `brandId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `supplier_business_brand_supplierId_idx`(`supplierId`),
    INDEX `supplier_business_brand_brandId_idx`(`brandId`),
    UNIQUE INDEX `supplier_business_brand_supplierId_brandId_key`(`supplierId`, `brandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_point_rule` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplierId` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NOT NULL,
    `categoryName` VARCHAR(100) NOT NULL,
    `point` DECIMAL(10, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `supplier_point_rule_supplierId_idx`(`supplierId`),
    INDEX `supplier_point_rule_brandName_idx`(`brandName`),
    UNIQUE INDEX `supplier_point_rule_supplierId_brandName_categoryName_key`(`supplierId`, `brandName`, `categoryName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_point_rule` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `priceTypeId` BIGINT NOT NULL,
    `brandName` VARCHAR(100) NOT NULL,
    `categoryName` VARCHAR(100) NOT NULL,
    `point` DECIMAL(10, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sale_point_rule_priceTypeId_idx`(`priceTypeId`),
    INDEX `sale_point_rule_brandName_idx`(`brandName`),
    UNIQUE INDEX `sale_point_rule_priceTypeId_brandName_categoryName_key`(`priceTypeId`, `brandName`, `categoryName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_spec_point` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `priceTypeId` BIGINT NOT NULL,
    `point` DECIMAL(10, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sale_spec_point_specId_idx`(`specId`),
    INDEX `sale_spec_point_priceTypeId_idx`(`priceTypeId`),
    UNIQUE INDEX `sale_spec_point_specId_priceTypeId_key`(`specId`, `priceTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_spec_point` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `specId` BIGINT NOT NULL,
    `supplierId` BIGINT NOT NULL,
    `point` DECIMAL(10, 4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_spec_point_specId_idx`(`specId`),
    INDEX `purchase_spec_point_supplierId_idx`(`supplierId`),
    UNIQUE INDEX `purchase_spec_point_specId_supplierId_key`(`specId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouse` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `address` VARCHAR(500) NULL,
    `lng` DECIMAL(10, 7) NULL,
    `lat` DECIMAL(10, 7) NULL,
    `coordSource` ENUM('geocoded', 'manual') NULL,
    `isMain` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `warehouse_status_idx`(`status`),
    INDEX `warehouse_isMain_idx`(`isMain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouse_zone` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `warehouseId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `warehouse_zone_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouse_contact` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `warehouseId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL DEFAULT '',
    `method` VARCHAR(50) NOT NULL DEFAULT '',
    `value` VARCHAR(200) NOT NULL DEFAULT '',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `warehouse_contact_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `warehouse_id` BIGINT NOT NULL,
    `warehouse_zone_id` BIGINT NULL,
    `spec_id` BIGINT NOT NULL,
    `brand_id` BIGINT NOT NULL,
    `unit_id` BIGINT NOT NULL,
    `specModel` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `unitName` VARCHAR(50) NULL,
    `qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `weighted_avg_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `last_in_at` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_warehouse_id_idx`(`warehouse_id`),
    INDEX `inventory_warehouse_zone_id_idx`(`warehouse_zone_id`),
    INDEX `inventory_spec_id_brand_id_unit_id_idx`(`spec_id`, `brand_id`, `unit_id`),
    UNIQUE INDEX `inventory_warehouse_id_spec_id_brand_id_unit_id_key`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_ledger` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `ledger_no` VARCHAR(50) NOT NULL,
    `warehouse_id` BIGINT NOT NULL,
    `spec_id` BIGINT NOT NULL,
    `brand_id` BIGINT NOT NULL,
    `unit_id` BIGINT NOT NULL,
    `specModel` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `unitName` VARCHAR(50) NULL,
    `movement_type` ENUM('in', 'out', 'adjust') NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_cost` DECIMAL(14, 2) NOT NULL,
    `balance_qty` DECIMAL(14, 3) NOT NULL,
    `balance_avg_cost` DECIMAL(14, 2) NOT NULL,
    `biz_type` VARCHAR(50) NULL,
    `biz_no` VARCHAR(100) NULL,
    `line_id` BIGINT NULL,
    `remark` VARCHAR(500) NULL,
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_ledger_ledger_no_key`(`ledger_no`),
    INDEX `inventory_ledger_warehouse_id_spec_id_brand_id_unit_id_idx`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`),
    INDEX `inventory_ledger_biz_no_idx`(`biz_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NULL,
    `userName` VARCHAR(50) NULL,
    `customer_id` BIGINT NULL,
    `customerName` VARCHAR(100) NULL,
    `action` VARCHAR(50) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` BIGINT NULL,
    `detail` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_customer_id_idx`(`customer_id`),
    INDEX `audit_logs_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` VARCHAR(1000) NOT NULL,
    `description` VARCHAR(500) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `system_config_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field_change_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `table_name` VARCHAR(50) NOT NULL,
    `record_id` BIGINT NOT NULL,
    `field_name` VARCHAR(100) NOT NULL,
    `old_value` TEXT NULL,
    `new_value` TEXT NULL,
    `changed_by` BIGINT NULL,
    `changedByName` VARCHAR(50) NULL,
    `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `field_change_logs_table_name_record_id_idx`(`table_name`, `record_id`),
    INDEX `field_change_logs_changed_by_idx`(`changed_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(30) NOT NULL,
    `customer_id` BIGINT NULL,
    `title` VARCHAR(200) NULL,
    `status` ENUM('demand_pending', 'quote_confirmed', 'payment_settled', 'allocation_in_progress', 'delivery_completed', 'cost_verified', 'after_sales', 'archived') NOT NULL DEFAULT 'demand_pending',
    `purchase_quote_status` ENUM('pending', 'confirmed', 'voided') NOT NULL DEFAULT 'pending',
    `need_invoice` BOOLEAN NOT NULL DEFAULT false,
    `lock_version` INTEGER NOT NULL DEFAULT 0,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `note` TEXT NULL,
    `salesperson_id` BIGINT NULL,
    `delivery_address` VARCHAR(500) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `expected_delivery_date` DATETIME(3) NULL,
    `valid_until` DATETIME(3) NULL,
    `payment_terms` VARCHAR(200) NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_inclusive` BOOLEAN NOT NULL DEFAULT false,
    `order_discount_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `round_off_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `order_discount_remark` VARCHAR(200) NULL,
    `subtotal_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_qty` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cost_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `gross_profit` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `sales_archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'working',
    `logistics_archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'working',
    `cost_archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'working',
    `sales_archived_at` DATETIME(3) NULL,
    `logistics_archived_at` DATETIME(3) NULL,
    `cost_archived_at` DATETIME(3) NULL,
    `summary_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `view_locks` JSON NOT NULL,
    `customerName` VARCHAR(100) NULL,
    `customerPhone` VARCHAR(200) NULL,
    `customerCompany` VARCHAR(200) NULL,
    `customerContactMethod` VARCHAR(50) NULL,
    `creatorName` VARCHAR(50) NULL,
    `salespersonName` VARCHAR(50) NULL,

    UNIQUE INDEX `documents_document_no_key`(`document_no`),
    INDEX `documents_customer_id_idx`(`customer_id`),
    INDEX `documents_status_idx`(`status`),
    INDEX `documents_purchase_quote_status_idx`(`purchase_quote_status`),
    INDEX `documents_created_at_idx`(`created_at`),
    INDEX `documents_salesperson_id_idx`(`salesperson_id`),
    INDEX `documents_sales_archive_status_idx`(`sales_archive_status`),
    INDEX `documents_status_sales_archived_at_created_at_idx`(`status`, `sales_archived_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `documentId` BIGINT NOT NULL,
    `seq` INTEGER NOT NULL,
    `specId` BIGINT NULL,
    `brandId` BIGINT NULL,
    `unitId` BIGINT NULL,
    `productId` BIGINT NULL,
    `productRef` VARCHAR(500) NOT NULL,
    `spec` VARCHAR(500) NULL,
    `unit` VARCHAR(50) NOT NULL,
    `categoryId` INTEGER NULL,
    `thumbnailUrl` VARCHAR(500) NULL,
    `imageUrls` JSON NULL,
    `productName` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `categoryName` VARCHAR(100) NULL,
    `specModel` VARCHAR(200) NULL,
    `unitName` VARCHAR(50) NULL,
    `qty` DECIMAL(12, 2) NOT NULL,
    `unitPrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `lineDiscount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `lineVersion` INTEGER NOT NULL DEFAULT 0,
    `isStandardized` BOOLEAN NOT NULL DEFAULT true,
    `rawDescription` VARCHAR(500) NULL,
    `rawUnit` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `document_lines_documentId_idx`(`documentId`),
    INDEX `document_lines_specId_idx`(`specId`),
    INDEX `document_lines_brandId_idx`(`brandId`),
    INDEX `document_lines_unitId_idx`(`unitId`),
    INDEX `document_lines_productId_idx`(`productId`),
    UNIQUE INDEX `document_lines_documentId_seq_key`(`documentId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `payment_type` ENUM('deposit', 'final', 'balance') NOT NULL,
    `method` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `paid_at` DATETIME(3) NOT NULL,
    `invoice_info` JSON NULL,
    `reconcile_status` ENUM('pending', 'reconciled') NOT NULL DEFAULT 'pending',
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payment_records_document_id_idx`(`document_id`),
    INDEX `payment_records_reconcile_status_idx`(`reconcile_status`),
    INDEX `payment_records_paid_at_idx`(`paid_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `allocation_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_id` BIGINT NOT NULL,
    `source_type` ENUM('external', 'warehouse') NOT NULL,
    `source_id` BIGINT NOT NULL,
    `sourceName` VARCHAR(200) NULL,
    `alloc_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `pending_status` ENUM('allocated', 'pending') NOT NULL DEFAULT 'allocated',
    `over_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `excess_target_warehouse_id` BIGINT NULL,
    `batch_no` VARCHAR(100) NULL,
    `alloc_at` DATETIME(3) NULL,
    `freight_share` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `unit_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `allocation_lines_line_id_idx`(`line_id`),
    INDEX `allocation_lines_source_id_idx`(`source_id`),
    INDEX `allocation_lines_source_type_idx`(`source_type`),
    UNIQUE INDEX `allocation_lines_line_id_source_id_key`(`line_id`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_payable_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `payable_no` VARCHAR(50) NOT NULL,
    `supplier_id` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NULL,
    `biz_type` VARCHAR(50) NOT NULL,
    `biz_no` VARCHAR(100) NOT NULL,
    `document_id` BIGINT NULL,
    `line_id` BIGINT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('pending', 'settled') NOT NULL DEFAULT 'pending',
    `settled_at` DATETIME(3) NULL,
    `remark` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supplier_payable_lines_payable_no_key`(`payable_no`),
    INDEX `supplier_payable_lines_supplier_id_idx`(`supplier_id`),
    INDEX `supplier_payable_lines_status_idx`(`status`),
    INDEX `supplier_payable_lines_biz_no_idx`(`biz_no`),
    INDEX `supplier_payable_lines_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inbound_tasks` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `inbound_no` VARCHAR(50) NOT NULL,
    `document_id` BIGINT NOT NULL,
    `supplier_id` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NULL,
    `target_warehouse_id` BIGINT NOT NULL,
    `total_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
    `confirmed_at` DATETIME(3) NULL,
    `confirmed_by` BIGINT NULL,
    `confirmedName` VARCHAR(50) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inbound_tasks_inbound_no_key`(`inbound_no`),
    INDEX `inbound_tasks_status_idx`(`status`),
    INDEX `inbound_tasks_document_id_idx`(`document_id`),
    INDEX `inbound_tasks_supplier_id_idx`(`supplier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inbound_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `task_id` BIGINT NOT NULL,
    `line_id` BIGINT NULL,
    `spec_id` BIGINT NOT NULL,
    `brand_id` BIGINT NOT NULL,
    `unit_id` BIGINT NOT NULL,
    `productName` VARCHAR(200) NULL,
    `specModel` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `categoryName` VARCHAR(100) NULL,
    `unitName` VARCHAR(50) NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_cost` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `inbound_lines_task_id_idx`(`task_id`),
    INDEX `inbound_lines_line_id_idx`(`line_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_inbounds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `purchase_no` VARCHAR(50) NOT NULL,
    `supplier_id` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NULL,
    `warehouse_id` BIGINT NOT NULL,
    `warehouseName` VARCHAR(200) NULL,
    `status` ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
    `total_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `confirmed_by` BIGINT NULL,
    `confirmedName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_inbounds_purchase_no_key`(`purchase_no`),
    INDEX `purchase_inbounds_status_created_at_idx`(`status`, `created_at`),
    INDEX `purchase_inbounds_supplier_id_idx`(`supplier_id`),
    INDEX `purchase_inbounds_warehouse_id_idx`(`warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_inbound_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `inbound_id` BIGINT NOT NULL,
    `spec_id` BIGINT NOT NULL,
    `brand_id` BIGINT NOT NULL,
    `unit_id` BIGINT NOT NULL,
    `productName` VARCHAR(200) NULL,
    `specModel` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `categoryName` VARCHAR(100) NULL,
    `unitName` VARCHAR(50) NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_cost` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,

    INDEX `purchase_inbound_lines_inbound_id_idx`(`inbound_id`),
    INDEX `purchase_inbound_lines_spec_id_brand_id_unit_id_idx`(`spec_id`, `brand_id`, `unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backorders` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `line_id` BIGINT NOT NULL,
    `warehouse_id` BIGINT NOT NULL,
    `spec_id` BIGINT NOT NULL,
    `brand_id` BIGINT NOT NULL,
    `unit_id` BIGINT NOT NULL,
    `specModel` VARCHAR(200) NULL,
    `brandName` VARCHAR(100) NULL,
    `unitName` VARCHAR(50) NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `status` ENUM('pending', 'fulfilled', 'cancelled') NOT NULL DEFAULT 'pending',
    `fulfilled_at` DATETIME(3) NULL,
    `fulfilled_by` BIGINT NULL,
    `fulfilledName` VARCHAR(50) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `backorders_status_idx`(`status`),
    INDEX `backorders_document_id_idx`(`document_id`),
    INDEX `backorders_warehouse_id_spec_id_brand_id_unit_id_idx`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `delivery_method` ENUM('self_pickup', 'haulage', 'special_van', 'logistics', 'site_delivery') NOT NULL,
    `tracking_no` VARCHAR(100) NULL,
    `receiver` VARCHAR(100) NULL,
    `receiver_phone` VARCHAR(20) NULL,
    `status` ENUM('pending', 'shipped', 'signed') NOT NULL DEFAULT 'pending',
    `shipped_at` DATETIME(3) NULL,
    `signed_at` DATETIME(3) NULL,
    `attachment_urls` JSON NULL,
    `note` TEXT NULL,
    `freight` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `delivery_records_document_id_idx`(`document_id`),
    INDEX `delivery_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cost_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_id` BIGINT NOT NULL,
    `cost_segment` ENUM('internal', 'external_agreed', 'external_excess') NOT NULL,
    `channel_type` ENUM('warehouse', 'supplier') NOT NULL,
    `source_id` BIGINT NOT NULL,
    `sourceName` VARCHAR(200) NULL,
    `preset_unit_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `actual_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cost_adjust` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `freight` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cost_qty` DECIMAL(14, 3) NOT NULL,
    `over_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `inbound_line_id` BIGINT NULL,
    `cost_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `verified_by` BIGINT NULL,
    `verifierName` VARCHAR(50) NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cost_lines_line_id_idx`(`line_id`),
    INDEX `cost_lines_source_id_idx`(`source_id`),
    INDEX `cost_lines_cost_segment_idx`(`cost_segment`),
    UNIQUE INDEX `cost_lines_line_id_cost_segment_source_id_key`(`line_id`, `cost_segment`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_id` BIGINT NOT NULL,
    `refund_type` ENUM('refund', 'exchange') NOT NULL,
    `original_qty` DECIMAL(12, 2) NOT NULL,
    `original_price` DECIMAL(14, 2) NOT NULL,
    `refund_qty` DECIMAL(12, 2) NOT NULL,
    `refund_amount` DECIMAL(14, 2) NOT NULL,
    `refund_status` ENUM('pending', 'closed') NOT NULL DEFAULT 'pending',
    `refund_at` DATETIME(3) NULL,
    `reason` TEXT NULL,
    `restock` BOOLEAN NOT NULL DEFAULT false,
    `restock_warehouse_id` BIGINT NULL,
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `refund_lines_line_id_idx`(`line_id`),
    INDEX `refund_lines_refund_type_idx`(`refund_type`),
    INDEX `refund_lines_refund_status_idx`(`refund_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_orders` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `original_document_id` BIGINT NOT NULL,
    `document_no` VARCHAR(30) NOT NULL,
    `customer_id` BIGINT NOT NULL,
    `customerName` VARCHAR(100) NULL,
    `salesperson_id` BIGINT NULL,
    `salespersonName` VARCHAR(50) NULL,
    `order_date` DATETIME(3) NOT NULL,
    `subtotal_amount` DECIMAL(14, 2) NOT NULL,
    `order_discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `round_off` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 2) NOT NULL,
    `tax_amount` DECIMAL(14, 2) NOT NULL,
    `total_amount` DECIMAL(14, 2) NOT NULL,
    `paid_amount` DECIMAL(14, 2) NOT NULL,
    `archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'archived',
    `archived_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `archive_remark` VARCHAR(500) NULL,

    INDEX `archived_orders_original_document_id_idx`(`original_document_id`),
    INDEX `archived_orders_customer_id_idx`(`customer_id`),
    INDEX `archived_orders_archive_status_idx`(`archive_status`),
    INDEX `archived_orders_archived_at_idx`(`archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_order_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `archived_order_id` BIGINT NOT NULL,
    `seq` INTEGER NOT NULL,
    `product_ref` VARCHAR(500) NOT NULL,
    `spec_model` VARCHAR(500) NULL,
    `unit` VARCHAR(50) NOT NULL,
    `thumbnail_url` VARCHAR(500) NULL,
    `category_id` INTEGER NULL,
    `original_qty` DECIMAL(12, 2) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `line_discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `refund_qty` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `final_qty` DECIMAL(12, 2) NOT NULL,
    `final_amount` DECIMAL(14, 2) NOT NULL,

    INDEX `archived_order_lines_archived_order_id_idx`(`archived_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_logistics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `original_document_id` BIGINT NOT NULL,
    `document_no` VARCHAR(30) NOT NULL,
    `logistics_date` DATETIME(3) NOT NULL,
    `warehouse_total_qty` DECIMAL(14, 3) NOT NULL,
    `sourcing_total_qty` DECIMAL(14, 3) NOT NULL,
    `logistics_cost` DECIMAL(14, 2) NOT NULL,
    `archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'archived',
    `archived_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `archive_remark` VARCHAR(500) NULL,

    INDEX `archived_logistics_original_document_id_idx`(`original_document_id`),
    INDEX `archived_logistics_archive_status_idx`(`archive_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_costs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `original_document_id` BIGINT NOT NULL,
    `document_no` VARCHAR(30) NOT NULL,
    `cost_date` DATETIME(3) NOT NULL,
    `cost_total` DECIMAL(14, 2) NOT NULL,
    `freight_total` DECIMAL(14, 2) NOT NULL,
    `gross_profit` DECIMAL(14, 2) NOT NULL,
    `profit_rate` DECIMAL(5, 2) NOT NULL,
    `archive_status` ENUM('working', 'archived', 'revoked') NOT NULL DEFAULT 'archived',
    `archived_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `archive_remark` VARCHAR(500) NULL,

    INDEX `archived_costs_original_document_id_idx`(`original_document_id`),
    INDEX `archived_costs_archive_status_idx`(`archive_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_refunds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `original_document_id` BIGINT NOT NULL,
    `document_no` VARCHAR(30) NOT NULL,
    `line_id` BIGINT NOT NULL,
    `refund_type` ENUM('refund', 'exchange') NOT NULL,
    `refund_qty` DECIMAL(12, 2) NOT NULL,
    `original_price` DECIMAL(14, 2) NOT NULL,
    `refund_amount` DECIMAL(14, 2) NOT NULL,
    `reason` TEXT NULL,
    `refund_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `archived_refunds_original_document_id_idx`(`original_document_id`),
    INDEX `archived_refunds_refund_at_idx`(`refund_at`),
    INDEX `archived_refunds_refund_type_idx`(`refund_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reimbursement_bills` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source_document_id` BIGINT NOT NULL,
    `bill_no` VARCHAR(30) NOT NULL,
    `note` VARCHAR(500) NULL,
    `subtotal_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `created_by` BIGINT NULL,
    `creatorName` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reimbursement_bills_bill_no_key`(`bill_no`),
    INDEX `reimbursement_bills_source_document_id_idx`(`source_document_id`),
    INDEX `reimbursement_bills_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reimbursement_bill_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `bill_id` BIGINT NOT NULL,
    `seq` INTEGER NOT NULL,
    `product_ref` VARCHAR(500) NOT NULL,
    `spec` VARCHAR(200) NULL,
    `unit` VARCHAR(50) NOT NULL,
    `qty` DECIMAL(12, 2) NOT NULL,
    `unit_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reimbursement_bill_lines_bill_id_idx`(`bill_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_authorizationCodeId_fkey` FOREIGN KEY (`authorizationCodeId`) REFERENCES `authorization_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_contact` ADD CONSTRAINT `customer_contact_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_invoice` ADD CONSTRAINT `customer_invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `spec` ADD CONSTRAINT `spec_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `spec` ADD CONSTRAINT `spec_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_brand` ADD CONSTRAINT `product_brand_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_brand` ADD CONSTRAINT `product_brand_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `spec_unit` ADD CONSTRAINT `spec_unit_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `spec_unit` ADD CONSTRAINT `spec_unit_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brand_unit_conversion` ADD CONSTRAINT `brand_unit_conversion_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brand_unit_conversion` ADD CONSTRAINT `brand_unit_conversion_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_priceTypeId_fkey` FOREIGN KEY (`priceTypeId`) REFERENCES `price_type`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_image` ADD CONSTRAINT `product_image_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_contact` ADD CONSTRAINT `supplier_contact_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_address` ADD CONSTRAINT `supplier_address_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_address` ADD CONSTRAINT `supplier_address_addressTypeId_fkey` FOREIGN KEY (`addressTypeId`) REFERENCES `address_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_business_category` ADD CONSTRAINT `supplier_business_category_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_business_category` ADD CONSTRAINT `supplier_business_category_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_business_brand` ADD CONSTRAINT `supplier_business_brand_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_business_brand` ADD CONSTRAINT `supplier_business_brand_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_spec_point` ADD CONSTRAINT `sale_spec_point_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_spec_point` ADD CONSTRAINT `sale_spec_point_priceTypeId_fkey` FOREIGN KEY (`priceTypeId`) REFERENCES `price_type`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_spec_point` ADD CONSTRAINT `purchase_spec_point_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouse_zone` ADD CONSTRAINT `warehouse_zone_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouse_contact` ADD CONSTRAINT `warehouse_contact_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_warehouse_zone_id_fkey` FOREIGN KEY (`warehouse_zone_id`) REFERENCES `warehouse_zone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `allocation_lines` ADD CONSTRAINT `allocation_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inbound_lines` ADD CONSTRAINT `inbound_lines_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `inbound_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_inbound_lines` ADD CONSTRAINT `purchase_inbound_lines_inbound_id_fkey` FOREIGN KEY (`inbound_id`) REFERENCES `purchase_inbounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_records` ADD CONSTRAINT `delivery_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_lines` ADD CONSTRAINT `cost_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_orders` ADD CONSTRAINT `archived_orders_original_document_id_fkey` FOREIGN KEY (`original_document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_lines` ADD CONSTRAINT `archived_order_lines_archived_order_id_fkey` FOREIGN KEY (`archived_order_id`) REFERENCES `archived_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_logistics` ADD CONSTRAINT `archived_logistics_original_document_id_fkey` FOREIGN KEY (`original_document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_costs` ADD CONSTRAINT `archived_costs_original_document_id_fkey` FOREIGN KEY (`original_document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursement_bills` ADD CONSTRAINT `reimbursement_bills_source_document_id_fkey` FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursement_bill_lines` ADD CONSTRAINT `reimbursement_bill_lines_bill_id_fkey` FOREIGN KEY (`bill_id`) REFERENCES `reimbursement_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

