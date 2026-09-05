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
    `customer_type` ENUM('personal', 'company') NOT NULL DEFAULT 'personal',
    `customer_level` ENUM('regular', 'silver', 'gold', 'diamond') NOT NULL DEFAULT 'regular',
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
    `phone` VARCHAR(20) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdBy` BIGINT NOT NULL,
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
    `phone` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `reviewedBy` BIGINT NULL,
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
CREATE TABLE `category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `specModel` VARCHAR(200) NOT NULL,
    `categoryId` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_categoryId_idx`(`categoryId`),
    UNIQUE INDEX `product_categoryId_name_specModel_key`(`categoryId`, `name`, `specModel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brand` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `productId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `brand_productId_idx`(`productId`),
    UNIQUE INDEX `brand_productId_name_key`(`productId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `productId` BIGINT NOT NULL,
    `unitName` VARCHAR(50) NOT NULL,
    `conversionRate` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `isBase` BOOLEAN NOT NULL DEFAULT false,
    `isDisplay` BOOLEAN NOT NULL DEFAULT false,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `unit_productId_idx`(`productId`),
    UNIQUE INDEX `unit_productId_unitName_key`(`productId`, `unitName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_price` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `brandId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `priceType` VARCHAR(50) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,

    INDEX `sale_price_brandId_unitId_idx`(`brandId`, `unitId`),
    INDEX `sale_price_priceType_idx`(`priceType`),
    UNIQUE INDEX `sale_price_brandId_unitId_priceType_key`(`brandId`, `unitId`, `priceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_price` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `brandId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `supplierName` VARCHAR(200) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,

    INDEX `purchase_price_brandId_unitId_idx`(`brandId`, `unitId`),
    INDEX `purchase_price_supplierName_idx`(`supplierName`),
    UNIQUE INDEX `purchase_price_brandId_unitId_supplierName_key`(`brandId`, `unitId`, `supplierName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_sku_search` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `productId` BIGINT NOT NULL,
    `productName` VARCHAR(200) NOT NULL,
    `specModel` VARCHAR(200) NOT NULL,
    `categoryId` BIGINT NOT NULL DEFAULT 0,
    `categoryName` VARCHAR(100) NOT NULL DEFAULT '未分类',
    `brandId` BIGINT NOT NULL,
    `brandName` VARCHAR(100) NOT NULL,
    `defaultUnitId` BIGINT NULL,
    `defaultUnitName` VARCHAR(50) NULL,
    `retailPrice` DECIMAL(10, 2) NULL,
    `purchasePriceDefault` DECIMAL(10, 2) NULL,
    `mainImageUrl` VARCHAR(500) NULL,
    `remark` VARCHAR(500) NOT NULL DEFAULT '',
    `status` INTEGER NOT NULL DEFAULT 1,
    `updateTime` DATETIME(3) NOT NULL,
    `keywords` VARCHAR(768) NOT NULL,

    INDEX `product_sku_search_keywords_idx`(`keywords`),
    INDEX `product_sku_search_categoryId_idx`(`categoryId`),
    INDEX `product_sku_search_brandId_idx`(`brandId`),
    INDEX `product_sku_search_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_image` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `brandId` BIGINT NOT NULL,
    `imageUrl` VARCHAR(500) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isMain` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_image_brandId_idx`(`brandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `type` ENUM('external', 'warehouse') NOT NULL DEFAULT 'external',
    `contact` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `address` VARCHAR(500) NULL,
    `note` TEXT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `suppliers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NULL,
    `customer_id` BIGINT NULL,
    `action` VARCHAR(50) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` BIGINT NULL,
    `detail` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_customer_id_idx`(`customer_id`),
    INDEX `audit_logs_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
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

    UNIQUE INDEX `documents_document_no_key`(`document_no`),
    INDEX `documents_customer_id_idx`(`customer_id`),
    INDEX `documents_status_idx`(`status`),
    INDEX `documents_purchase_quote_status_idx`(`purchase_quote_status`),
    INDEX `documents_created_at_idx`(`created_at`),
    INDEX `documents_salesperson_id_idx`(`salesperson_id`),
    INDEX `documents_sales_archive_status_idx`(`sales_archive_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_lines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `documentId` BIGINT NOT NULL,
    `seq` INTEGER NOT NULL,
    `brandId` BIGINT NULL,
    `unitId` BIGINT NULL,
    `productId` BIGINT NULL,
    `productRef` VARCHAR(500) NOT NULL,
    `spec` VARCHAR(500) NULL,
    `unit` VARCHAR(50) NOT NULL,
    `categoryId` INTEGER NULL,
    `thumbnailUrl` VARCHAR(500) NULL,
    `imageUrls` JSON NULL,
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
    `alloc_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `pending_status` ENUM('allocated', 'pending') NOT NULL DEFAULT 'allocated',
    `batch_no` VARCHAR(100) NULL,
    `alloc_at` DATETIME(3) NULL,
    `freight_share` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `unit_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `note` TEXT NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `allocation_lines_line_id_idx`(`line_id`),
    INDEX `allocation_lines_source_id_idx`(`source_id`),
    INDEX `allocation_lines_source_type_idx`(`source_type`),
    UNIQUE INDEX `allocation_lines_line_id_source_id_key`(`line_id`, `source_id`),
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
    `channel_type` ENUM('warehouse', 'supplier') NOT NULL,
    `source_id` BIGINT NOT NULL,
    `preset_unit_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `actual_cost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cost_adjust` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `freight` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cost_qty` DECIMAL(14, 3) NOT NULL,
    `cost_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `verified_by` BIGINT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cost_lines_line_id_idx`(`line_id`),
    INDEX `cost_lines_source_id_idx`(`source_id`),
    INDEX `cost_lines_channel_type_idx`(`channel_type`),
    UNIQUE INDEX `cost_lines_line_id_channel_type_source_id_key`(`line_id`, `channel_type`, `source_id`),
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
    `created_by` BIGINT NULL,
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
    `salesperson_id` BIGINT NULL,
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
ALTER TABLE `authorization_codes` ADD CONSTRAINT `authorization_codes_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `access_requests` ADD CONSTRAINT `access_requests_reviewedBy_fkey` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_authorizationCodeId_fkey` FOREIGN KEY (`authorizationCodeId`) REFERENCES `authorization_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brand` ADD CONSTRAINT `brand_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unit` ADD CONSTRAINT `unit_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_image` ADD CONSTRAINT `product_image_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_lines` ADD CONSTRAINT `document_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `allocation_lines` ADD CONSTRAINT `allocation_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `allocation_lines` ADD CONSTRAINT `allocation_lines_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `allocation_lines` ADD CONSTRAINT `allocation_lines_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_records` ADD CONSTRAINT `delivery_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_lines` ADD CONSTRAINT `cost_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_lines` ADD CONSTRAINT `cost_lines_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_lines` ADD CONSTRAINT `cost_lines_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `document_lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `reimbursement_bills` ADD CONSTRAINT `reimbursement_bills_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reimbursement_bill_lines` ADD CONSTRAINT `reimbursement_bill_lines_bill_id_fkey` FOREIGN KEY (`bill_id`) REFERENCES `reimbursement_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
