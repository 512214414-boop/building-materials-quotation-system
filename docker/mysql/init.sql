-- 建材报价系统 — MySQL 初始化（容器首次启动执行一次）
-- 目的：应用账号授权 + 数据库字符集显式声明（便于审计与跨环境一致）

-- 应用账号授权（与 docker-compose 的 MYSQL_APP_USER / MYSQL_APP_PASSWORD 对应；
--   mysql 镜像已按环境变量创建该用户，这里仅补授权，幂等可重跑）
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, SHOW VIEW
  ON `${MYSQL_DATABASE:-bm_quotation}`.* TO '${MYSQL_APP_USER:-bm_app}'@'%';
FLUSH PRIVILEGES;

-- 显式声明数据库字符集（MySQL 8 默认即为 utf8mb4，此处固化便于审计）
ALTER DATABASE `${MYSQL_DATABASE:-bm_quotation}`
  CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
