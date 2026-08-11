import http from 'http';
import { createApp } from './app.js';
import { prisma } from './config/prisma.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { wsManager } from './ws/index.js';
import { ensurePriceTypes } from './services/productService.js';
import { ensureSystemDefaults } from './services/businessDefaults.js';

async function start() {
  // v12.0：启动即预置价格类型字典（零售价/批发价/工程价），幂等
  await ensurePriceTypes();
  // v13.1：启动即预置系统缺省记录（「面价渠道」供应商 + 「零售价」价格类型），幂等
  // 顶层规范：数据规范.md 缺省值注册表 —— 保证供应商/售价类型为空时的缺省引用始终真实存在、列表可见
  await ensureSystemDefaults();

  const app = createApp();
  const server = http.createServer(app);

  // 挂载 WebSocket 服务到同一 HTTP server（单进程 3000 端口）
  wsManager.attach(server);

  server.listen(config.port, () => {
    logger.info('建材报价 API 已启动', {
      port: config.port,
      env: config.env,
      wsPath: config.ws.path,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭...`);
    wsManager.detach();
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('已断开数据库连接');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error('服务启动失败', err);
  process.exit(1);
});
