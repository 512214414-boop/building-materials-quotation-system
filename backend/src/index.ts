import http from 'http';
import { createApp } from './app.js';
import { prisma } from './config/prisma.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { wsManager } from './ws/index.js';

async function start() {
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
