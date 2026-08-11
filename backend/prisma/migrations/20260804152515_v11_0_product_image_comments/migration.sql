-- v11.0 产品图片表字段中文 COMMENT 补全
--
-- 背景：
--   迁移 20260804_v11_0_product_image_multi_version 首次执行时因 DB 已存在 mediumUrl 列而失败，
--   随后被标记为已应用（migrate resolve --applied），导致字段虽存在但缺少中文 COMMENT。
--
-- 本次变更：
--   仅使用 MODIFY COLUMN ... COMMENT 为 v11.0 新增字段补全中文备注，便于 Navicat 等工具查看。
--   不修改字段类型、约束、默认值。
--
-- 设计依据：用户规则「数据库表字段需添加中文备注（COMMENT）」

ALTER TABLE `product_image`
  MODIFY COLUMN `mediumUrl` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '中图URL（600x600 居中裁剪，编辑弹窗用）',
  MODIFY COLUMN `thumbnailUrl` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '缩略图URL（200x200 居中裁剪，列表卡片用）',
  MODIFY COLUMN `width` INT NOT NULL DEFAULT 0 COMMENT '原图宽（px）',
  MODIFY COLUMN `height` INT NOT NULL DEFAULT 0 COMMENT '原图高（px）',
  MODIFY COLUMN `size` INT NOT NULL DEFAULT 0 COMMENT '原图字节数',
  MODIFY COLUMN `hash` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'SHA-256 内容寻址 hash（同内容复用物理文件）';
