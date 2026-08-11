import { prisma } from '../config/prisma.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';

export async function listAuditLogs(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (query.userId) where.user_id = BigInt(query.userId as string);
  if (query.customerId) where.customer_id = BigInt(query.customerId as string);
  // action 为自由字符串（格式 <resource>_<verb>），采用 contains 模糊匹配
  // 前端传 "create" 可匹配 user_create / product_create / document_line_add 等所有创建类操作
  if (typeof query.action === 'string' && query.action) {
    where.action = { contains: query.action };
  }
  if (typeof query.resourceType === 'string' && query.resourceType) where.resource_type = query.resourceType;
  if (query.from) where.created_at = { ...(where.created_at as object), gte: new Date(query.from as string) };
  if (query.to) where.created_at = { ...(where.created_at as object), lte: new Date(query.to as string) };

  const [total, list] = await Promise.all([
    prisma.audit_logs.count({ where }),
    prisma.audit_logs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      // v11.0 解耦：移除 user/customer include，使用 userName/customerName 快照字段
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function listFieldChangeLogs(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.table === 'string' && query.table) where.table_name = query.table;
  if (query.recordId) where.record_id = BigInt(query.recordId as string);

  const [total, list] = await Promise.all([
    prisma.field_change_logs.count({ where }),
    prisma.field_change_logs.findMany({ where, orderBy: { changed_at: 'desc' }, skip, take }),
  ]);
  return paginate(list, total, page, pageSize);
}
