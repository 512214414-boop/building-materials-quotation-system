// v2.0 检索引擎
// v1.0 的 quotations 体系已删除，替换为 documents 单据体系
//
// v3.3 变更：删除 buildProductSearch（products 表已无 full_name/brand 字段）
//            产品检索改用 productService.searchProductsDual

import type { Prisma } from '@prisma/client';

// ============================================================
// 单据检索（替代 v1.0 buildQuotationSearch）
// ============================================================

export interface DocumentSearchParams {
  keyword?: string;
  customerId?: bigint;
  status?: string;
  createdBy?: bigint;
}

/**
 * 构建单据检索条件。
 * 关键词匹配 document_no / customer.name / customer.phone。
 */
export function buildDocumentSearch(params: DocumentSearchParams): Prisma.documentsWhereInput {
  const where: Prisma.documentsWhereInput = {};
  if (params.customerId) where.customer_id = params.customerId;
  if (params.createdBy) where.created_by = params.createdBy;
  if (params.status) {
    where.status = params.status as Prisma.documentsWhereInput['status'];
  }
  if (params.keyword && params.keyword.trim() !== '') {
    const kw = params.keyword.trim();
    // v11.0 解耦：customer 关系已移除，改为基于快照字段检索
    where.OR = [
      { document_no: { contains: kw } },
      { customerName: { contains: kw } },
      { customerPhone: { contains: kw } },
    ];
  }
  return where;
}
