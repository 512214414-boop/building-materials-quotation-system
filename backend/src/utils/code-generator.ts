// v2.7 业务编码生成器：不可变业务主键
// 设计原理：
//   - 业务键可变（手机号/产品名/供应商名/用户名）→ 给人看，用于检索匹配
//   - 代理键不变（编码字段）→ 给系统用，用于外键关联；一旦建立除删除外不可修改
// 编码规则：前缀 + YYYYMMDD + 4 位序号
//   customers  → C + YYYYMMDD + 0001（如 C202607170001）
//   users      → U + YYYYMMDD + 0001
//
// v3.3 变更：产品数据层去业务编号，删除 generateProductCode / generateCategoryCode / generateSupplierCode
//   产品/分类/品牌/规格/单位/图片/供应商报价 全部用数据库 id 关联
//   保留 customers.customer_code 和 users.user_code（下一轮全局去业务编号时删除）

import { prisma } from '../config/prisma.js';

const SEQ_PAD = 4;

/** 日期格式化为 YYYYMMDD（本地时区） */
function dateStr(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 序号补零至 4 位 */
function padSeq(n: number): string {
  return String(n).padStart(SEQ_PAD, '0');
}

/** 从编码中解析序号（去掉前缀 + 8 位日期） */
function parseSeq(code: string, prefix: string): number {
  const seqStr = code.slice(prefix.length + 8);
  const n = parseInt(seqStr, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 客户编码：C + YYYYMMDD + 0001 */
export async function generateCustomerCode(): Promise<string> {
  const prefix = 'C';
  const today = dateStr();
  const last = await prisma.customers.findFirst({
    where: { customer_code: { startsWith: `${prefix}${today}` } },
    select: { customer_code: true },
    orderBy: { customer_code: 'desc' },
  });
  const seq = last ? parseSeq(last.customer_code, prefix) + 1 : 1;
  return `${prefix}${today}${padSeq(seq)}`;
}

/** 员工编码：U + YYYYMMDD + 0001 */
export async function generateUserCode(): Promise<string> {
  const prefix = 'U';
  const today = dateStr();
  const last = await prisma.users.findFirst({
    where: { user_code: { startsWith: `${prefix}${today}` } },
    select: { user_code: true },
    orderBy: { user_code: 'desc' },
  });
  const seq = last ? parseSeq(last.user_code, prefix) + 1 : 1;
  return `${prefix}${today}${padSeq(seq)}`;
}

/**
 * 产品ID 生成器（v11.0 新增，v11.0.1 修复 BIGINT 溢出）
 *
 * 设计依据：[数据库新设计·产品数据层.md]「产品ID 生成规则」章节
 *
 * 格式：epochMs × 1_000_000 + RND(6 位)
 *   - epochMs：Unix 毫秒时间戳（2026 年约 13 位）
 *   - RND    ：0-999999 随机数（6 位）
 *
 * 长度：当前约 19 位（epochMs 13 位 × 10^6 + 随机数 6 位）
 * 示例：1785828119609 × 1000000 + 528456 = 1785828119609528456
 *
 * v11.0.1 修复背景：
 *   v11.0 原格式 P+YYYYMMDD+HHmmss+SSS+RND 去掉 P 后为 20 位数字，
 *   从 2026 年起（2.02×10^19）必然超出 MySQL BIGINT 有符号上限
 *   （9223372036854775807 ≈ 9.22×10^18，19 位），导致 Prisma 写入失败。
 *   改用 epoch 毫秒时间戳方案（Snowflake 简化版，单进程最优）。
 *
 * BIGINT 范围校验：
 *   - 2026 年：1.79×10^18 < 9.22×10^18 ✓（5 倍余量）
 *   - 安全直到 epochMs > 9.22×10^12（约 2262 年）
 *
 * 唯一性保证：
 *   - 单进程内：6 位随机数，单毫秒冲突概率 1/1,000,000
 *   - 时间戳单调递增：旧 ID 永不被新 ID 覆盖，删除后不复用
 *   - 数据库：product.id 主键约束兜底，重复插入时可重试
 */
export function generateProductId(): bigint {
  const epochMs = Date.now();
  const random = Math.floor(Math.random() * 1_000_000);
  return BigInt(epochMs) * 1_000_000n + BigInt(random);
}
