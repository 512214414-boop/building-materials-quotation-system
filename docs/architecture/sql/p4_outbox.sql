-- ============================================================
-- P4 · 事务性 Outbox 表（可靠领域事件投递）
-- 执行就绪，但属「DB 结构变更硬闸」：须用户在电脑确认后执行。
-- 配合 backend/src/domain/shared/event-bus.ts 端口 + infrastructure 实现，
-- 实现「写业务数据 + 写 outbox」同事务，再由中继器（relay）把
-- pending 事件投递到事件总线 / 远端 MQ，保证 at-least-once 投递。
-- 执行顺序：P2-d → P2-b 之后（与领域表 PK 方案无关，独立建表）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `outbox` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id`      VARCHAR(64)     NOT NULL                COMMENT '幂等键：每条领域事件全局唯一',
  `aggregate_type` VARCHAR(64)    NOT NULL                COMMENT '聚合根类型，如 Product / Order',
  `aggregate_id`  VARCHAR(64)     NOT NULL                COMMENT '聚合根 ID（Snowflake 以字符串存，兼容跨类型）',
  `event_type`    VARCHAR(128)    NOT NULL                COMMENT '事件类型，对应 DomainEvent.eventType',
  `payload`       JSON            NOT NULL                COMMENT '事件载荷（领域事件序列化）',
  `status`        TINYINT         NOT NULL DEFAULT 0      COMMENT '0=pending 1=published 2=failed',
  `created_at`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published_at`  DATETIME(3)     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outbox_event_id` (`event_id`),
  KEY `ix_outbox_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Transactional outbox — 可靠领域事件投递缓冲';

-- 中继器拉取待投递事件的查询走 ix_outbox_status_created；
-- 若未来按聚合维度反查，可补：
--   ALTER TABLE `outbox` ADD KEY `ix_outbox_aggregate` (`aggregate_type`, `aggregate_id`);
