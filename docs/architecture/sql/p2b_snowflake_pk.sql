-- DropForeignKey
ALTER TABLE `user_roles` DROP FOREIGN KEY `user_roles_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_roles` DROP FOREIGN KEY `user_roles_role_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_sessions` DROP FOREIGN KEY `customer_sessions_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `customer_addresses` DROP FOREIGN KEY `customer_addresses_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `customer_contact` DROP FOREIGN KEY `customer_contact_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `customer_invoice` DROP FOREIGN KEY `customer_invoice_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `product` DROP FOREIGN KEY `product_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `spec` DROP FOREIGN KEY `spec_productId_fkey`;

-- DropForeignKey
ALTER TABLE `spec` DROP FOREIGN KEY `spec_brandId_fkey`;

-- DropForeignKey
ALTER TABLE `product_brand` DROP FOREIGN KEY `product_brand_productId_fkey`;

-- DropForeignKey
ALTER TABLE `product_brand` DROP FOREIGN KEY `product_brand_brandId_fkey`;

-- DropForeignKey
ALTER TABLE `spec_unit` DROP FOREIGN KEY `spec_unit_specId_fkey`;

-- DropForeignKey
ALTER TABLE `spec_unit` DROP FOREIGN KEY `spec_unit_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `brand_unit_conversion` DROP FOREIGN KEY `brand_unit_conversion_specId_fkey`;

-- DropForeignKey
ALTER TABLE `brand_unit_conversion` DROP FOREIGN KEY `brand_unit_conversion_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `sale_price` DROP FOREIGN KEY `sale_price_specId_fkey`;

-- DropForeignKey
ALTER TABLE `sale_price` DROP FOREIGN KEY `sale_price_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `sale_price` DROP FOREIGN KEY `sale_price_priceTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_price` DROP FOREIGN KEY `purchase_price_specId_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_price` DROP FOREIGN KEY `purchase_price_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `product_image` DROP FOREIGN KEY `product_image_specId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_contact` DROP FOREIGN KEY `supplier_contact_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_address` DROP FOREIGN KEY `supplier_address_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_business_category` DROP FOREIGN KEY `supplier_business_category_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_business_category` DROP FOREIGN KEY `supplier_business_category_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_business_brand` DROP FOREIGN KEY `supplier_business_brand_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `supplier_business_brand` DROP FOREIGN KEY `supplier_business_brand_brandId_fkey`;

-- DropForeignKey
ALTER TABLE `sale_spec_point` DROP FOREIGN KEY `sale_spec_point_specId_fkey`;

-- DropForeignKey
ALTER TABLE `sale_spec_point` DROP FOREIGN KEY `sale_spec_point_priceTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_spec_point` DROP FOREIGN KEY `purchase_spec_point_specId_fkey`;

-- DropForeignKey
ALTER TABLE `warehouse_zone` DROP FOREIGN KEY `warehouse_zone_warehouseId_fkey`;

-- DropForeignKey
ALTER TABLE `warehouse_contact` DROP FOREIGN KEY `warehouse_contact_warehouseId_fkey`;

-- DropForeignKey
ALTER TABLE `document_lines` DROP FOREIGN KEY `document_lines_documentId_fkey`;

-- DropForeignKey
ALTER TABLE `payment_records` DROP FOREIGN KEY `payment_records_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `allocation_lines` DROP FOREIGN KEY `allocation_lines_line_id_fkey`;

-- DropForeignKey
ALTER TABLE `inbound_lines` DROP FOREIGN KEY `inbound_lines_task_id_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_inbound_lines` DROP FOREIGN KEY `purchase_inbound_lines_inbound_id_fkey`;

-- DropForeignKey
ALTER TABLE `delivery_records` DROP FOREIGN KEY `delivery_records_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `cost_lines` DROP FOREIGN KEY `cost_lines_line_id_fkey`;

-- DropForeignKey
ALTER TABLE `refund_lines` DROP FOREIGN KEY `refund_lines_line_id_fkey`;

-- DropForeignKey
ALTER TABLE `archived_orders` DROP FOREIGN KEY `archived_orders_original_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `archived_order_lines` DROP FOREIGN KEY `archived_order_lines_archived_order_id_fkey`;

-- DropForeignKey
ALTER TABLE `archived_logistics` DROP FOREIGN KEY `archived_logistics_original_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `archived_costs` DROP FOREIGN KEY `archived_costs_original_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `reimbursement_bills` DROP FOREIGN KEY `reimbursement_bills_source_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `reimbursement_bill_lines` DROP FOREIGN KEY `reimbursement_bill_lines_bill_id_fkey`;

-- AlterTable
ALTER TABLE `roles` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `users` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `user_roles` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `user_id` BIGINT UNSIGNED NOT NULL,
    MODIFY `role_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customers` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `authorization_codes` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `access_requests` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_sessions` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `customerId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_addresses` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `customerId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_type` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_contact` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `customerId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `customer_invoice` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `customerId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `category` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `product` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `categoryId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `spec` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `productId` BIGINT UNSIGNED NOT NULL,
    MODIFY `brandId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `product_brand` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `productId` BIGINT UNSIGNED NOT NULL,
    MODIFY `brandId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `brand` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `unit` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `spec_unit` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    MODIFY `unitId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `brand_unit_conversion` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    MODIFY `unitId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `price_type` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `contact_method` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `sale_price` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    MODIFY `unitId` BIGINT UNSIGNED NOT NULL,
    MODIFY `priceTypeId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `purchase_price` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    MODIFY `unitId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `product_image` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `address_type` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_contact` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `supplierId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_address` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `supplierId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_business_category` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `supplierId` BIGINT UNSIGNED NOT NULL,
    MODIFY `categoryId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_business_brand` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `supplierId` BIGINT UNSIGNED NOT NULL,
    MODIFY `brandId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_point_rule` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `sale_point_rule` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `sale_spec_point` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    MODIFY `priceTypeId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `purchase_spec_point` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `specId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `warehouse` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `warehouse_zone` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `warehouseId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `warehouse_contact` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `warehouseId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `inventory` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `inventory_ledger` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `audit_logs` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `system_config` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `field_change_logs` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `documents` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `document_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `documentId` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `payment_records` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `allocation_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `line_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `supplier_payable_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `inbound_tasks` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `inbound_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `task_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `purchase_inbounds` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `purchase_inbound_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `inbound_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `backorders` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `delivery_records` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `cost_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `line_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `refund_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `line_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `archived_orders` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `original_document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `archived_order_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `archived_order_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `archived_logistics` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `original_document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `archived_costs` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `original_document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `archived_refunds` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `reimbursement_bills` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `source_document_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `reimbursement_bill_lines` DROP PRIMARY KEY,
    MODIFY `id` BIGINT UNSIGNED NOT NULL,
    MODIFY `bill_id` BIGINT UNSIGNED NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

