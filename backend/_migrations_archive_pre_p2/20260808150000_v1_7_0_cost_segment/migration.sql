-- v1.7.0 成本分层落账（配货·成本推演方案 §9.7 / §5.4）
--
-- 变更内容：
--   1. cost_lines 新增 cost_segment（成本分层段：internal / external_agreed / external_excess）
--   2. cost_lines 新增 over_qty（外部超额量）+ inbound_line_id（关联待入库行，确认入库后回填）
--   3. 唯一约束升级：(line_id, channel_type, source_id) → (line_id, cost_segment, source_id)
--      同一外部来源可同时存在 external_agreed（刚需）与 external_excess（超额）两段
--
-- 历史数据回填：warehouse→internal / supplier→external_agreed（外部超额段由后续配货确认重算生成）

-- 1. 新增分层字段（已有行默认 internal，随后按通道回填）
ALTER TABLE `cost_lines`
  ADD COLUMN `cost_segment` ENUM('internal','external_agreed','external_excess') NOT NULL DEFAULT 'internal' AFTER `line_id`,
  ADD COLUMN `over_qty` DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER `cost_qty`,
  ADD COLUMN `inbound_line_id` BIGINT NULL AFTER `over_qty`;

-- 2. 历史数据回填
UPDATE `cost_lines` SET `cost_segment` = 'internal' WHERE `channel_type` = 'warehouse';
UPDATE `cost_lines` SET `cost_segment` = 'external_agreed' WHERE `channel_type` = 'supplier';

-- 3. 唯一约束升级 + 索引对齐
ALTER TABLE `cost_lines`
  DROP INDEX `cost_lines_line_id_channel_type_source_id_key`,
  ADD UNIQUE KEY `cost_lines_line_id_cost_segment_source_id_key` (`line_id`, `cost_segment`, `source_id`),
  DROP INDEX `cost_lines_channel_type_idx`,
  ADD INDEX `cost_lines_cost_segment_idx` (`cost_segment`);
