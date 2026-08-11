-- v15.2 规模驱动索引（领域 A：系统架构巡检与演进任务书整改）
-- 基线：几十万 SKU / 几千万业务行（约束 6），高频列表必须索引驱动分页，禁止全表排序深翻页
--
-- 1. documents：工作台各状态视图 = WHERE status=? AND sales_archived_at IS NULL ORDER BY created_at DESC
--    单列索引（status / created_at）无法同时覆盖"过滤+排序"，必然 filesort → 复合索引一次覆盖
CREATE INDEX `documents_status_archived_created_idx`
  ON `documents`(`status`, `sales_archived_at`, `created_at`);

-- 2. audit_logs：审计日志列表默认 ORDER BY created_at DESC 索引分页（原实现无该索引 → 全表 filesort）
CREATE INDEX `audit_logs_created_at_idx`
  ON `audit_logs`(`created_at`);

-- 3. supplier_payable_lines：对账列表 = WHERE status=? ORDER BY status, created_at DESC 索引分页
CREATE INDEX `supplier_payable_lines_status_created_idx`
  ON `supplier_payable_lines`(`status`, `created_at`);
