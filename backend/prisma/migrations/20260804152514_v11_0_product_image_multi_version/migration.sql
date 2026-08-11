-- v11.0 产品图片表生产级重构：多版本 WebP + 内容寻址
--
-- 变更内容：
--   1. 新增 mediumUrl（中图 600x600，编辑弹窗用）
--   2. 新增 thumbnailUrl（缩略图 200x200，列表卡片用）
--   3. 新增 width/height（原图宽高，px）
--   4. 新增 size（原图字节数）
--   5. 新增 hash（SHA-256 内容寻址，同内容复用物理文件）
--   6. 新增 hash 索引（去重查询加速）
--
-- 字段默认值：
--   - 新增字段均带 DEFAULT，保证已有记录不报错
--   - 旧记录 mediumUrl/thumbnailUrl/hash 默认空串，width/height/size 默认 0
--   - 由迁移脚本 migrate-product-images.ts 回填实际值
--
-- 设计依据：数据库新设计·产品数据层.md「product_image 图片存储与管理规范」

ALTER TABLE `product_image`
  ADD COLUMN `mediumUrl` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '中图URL（600x600 居中裁剪，编辑弹窗用）',
  ADD COLUMN `thumbnailUrl` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '缩略图URL（200x200 居中裁剪，列表卡片用）',
  ADD COLUMN `width` INT NOT NULL DEFAULT 0 COMMENT '原图宽（px）',
  ADD COLUMN `height` INT NOT NULL DEFAULT 0 COMMENT '原图高（px）',
  ADD COLUMN `size` INT NOT NULL DEFAULT 0 COMMENT '原图字节数',
  ADD COLUMN `hash` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'SHA-256 内容寻址 hash（同内容复用物理文件）';

-- 内容寻址去重查询索引
CREATE INDEX `product_image_hash_idx` ON `product_image`(`hash`);
