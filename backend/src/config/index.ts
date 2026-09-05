import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function intEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  env: env('NODE_ENV', 'development'),
  port: intEnv('PORT', 3000),
  jwt: {
    secret: env('JWT_SECRET', 'dev-secret-change-me'),
    expiresIn: env('JWT_EXPIRES_IN', '8h'),
    customerExpiresIn: env('CUSTOMER_TOKEN_EXPIRES_IN', '24h'),
  },
  authCodeExpiresHours: intEnv('AUTH_CODE_EXPIRES_HOURS', 24),
  upload: {
    dir: env('UPLOAD_DIR', './uploads'),
    maxFileSize: intEnv('MAX_FILE_SIZE', 10485760),
    allowedTypes: env('ALLOWED_FILE_TYPES', 'jpg,jpeg,png,webp')
      .split(',')
      .map((s) => s.trim().toLowerCase()),
  },
  rateLimit: {
    windowMs: intEnv('RATE_LIMIT_WINDOW_MS', 60000),
    maxRequests: intEnv('RATE_LIMIT_MAX_REQUESTS', 120),
  },
  // WebSocket 核心配置硬编码（仅周期与路径可通过 .env 覆盖）
  ws: {
    path: env('WS_PATH', '/ws'),
    heartbeatMs: intEnv('WS_HEARTBEAT_MS', 30000),
  },
  // CORS 允许来源硬编码：开发环境允许所有来源，生产环境由反向代理处理
  cors: {
    origin: true as const, // 反射请求来源，配合反向代理
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Customer-Session'],
    credentials: true,
  },
  isProd: env('NODE_ENV', 'development') === 'production',
  // P4 接缝：事件总线驱动选择；当前仅 in-process 就绪，redis-stream/rabbitmq 为远端接缝预留
  features: {
    eventBus: env('EVENT_BUS', 'in-process') as 'in-process' | 'redis-stream' | 'rabbitmq',
    // P4 接缝：检索驱动；当前仅 db 就绪，elasticsearch 为远端接缝预留
    searchDriver: env('SEARCH_DRIVER', 'db') as 'db' | 'elasticsearch',
  },
};

export type AppConfig = typeof config;
