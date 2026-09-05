// 基础设施层 · Prisma 客户端单例
//
// 依赖倒置：领域层只依赖 Repository 接口（见 domain/shared/repository.ts），
// 永不直接引用本文件。本文件是 infrastructure 层的实现细节。
// 单例避免热重载 / 测试下创建过多连接。

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
