#!/usr/bin/env bash
# 建材报价系统 — MySQL 每日备份 + 留存 + DR 提示
#
# 用法：
#   ./scripts/backup-db.sh                       # 用默认参数
#   MYSQL_PASSWORD=xxx ./scripts/backup-db.sh   # 覆盖密码
#   BACKUP_DIR=/data/backups ./scripts/backup-db.sh
#
# 生产建议：
#   - 由 cron 每日 03:00 触发（crontab -e）：0 3 * * * /path/backup-db.sh >> /var/log/bm_backup.log 2>&1
#   - DR：取消末尾 rclone/oss 行的注释，将最新备份同步到异地/对象存储

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/bm_quotation}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE="$(date +%Y%m%d_%H%M%S)"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-rootpass}"
DB_NAME="${DB_NAME:-bm_quotation}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] 开始备份 ${DB_NAME}@${MYSQL_HOST}:${MYSQL_PORT} ..."
# --single-transaction 保证一致性且不加表锁；含存储过程/触发器/事件
mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  --single-transaction --routines --triggers --events --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip > "${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"
echo "[$(date)] 备份完成: ${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz ($(du -h "${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz" | cut -f1))"

# 清理过期备份
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] 已清理 ${RETENTION_DAYS} 天前的备份"

# ── DR 异地同步（按需启用）────────────────────────────────────────────
# rclone copy "${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz" remote:bucket/bm_backups/ \
#   && echo "[$(date)] DR 同步完成" \
#   || echo "[$(date)] ⚠ DR 同步未配置或失败，请检查 rclone"
