import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ReimbursementLineInput {
  productRef: string;
  spec?: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  remark?: string | null;
}

export interface CreateReimbursementBillInput {
  sourceDocumentId: bigint;
  note?: string;
  lines: ReimbursementLineInput[];
}

function generateBillNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `BX${y}${m}${d}${rand}`;
}

export async function createReimbursementBill(
  input: CreateReimbursementBillInput,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: input.sourceDocumentId },
    select: { id: true, document_no: true },
  });
  if (!doc) throw Errors.notFound('原始单据不存在');

  const lines = input.lines.map((l, i) => {
    const qty = Number(l.qty) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    return {
      seq: i + 1,
      product_ref: l.productRef,
      spec: l.spec || null,
      unit: l.unit,
      qty,
      unit_price: unitPrice,
      amount: Math.round(qty * unitPrice * 100) / 100,
      remark: l.remark || null,
    };
  });

  const subtotal = lines.reduce((s, l) => s + Number(l.amount), 0);
  const billNo = generateBillNo();

  const bill = await prisma.reimbursement_bills.create({
    data: {
      source_document_id: input.sourceDocumentId,
      bill_no: billNo,
      note: input.note || null,
      subtotal_amount: subtotal,
      total_amount: subtotal,
      created_by: actor.id,
      // v11.0 解耦：填充 creatorName 快照（来自 actor.name，即 users.real_name）
      creatorName: actor.name,
      lines: { create: lines },
    },
    include: {
      lines: true,
      // v11.0 解耦：移除 creator include，使用 creatorName 快照字段
    },
  });

  logger.info('报销副单创建', {
    billNo,
    sourceDoc: doc.document_no,
    actor: actor.name,
    lineCount: lines.length,
    total: subtotal,
  });

  return bill;
}

export async function listReimbursementBills(documentId: bigint) {
  const bills = await prisma.reimbursement_bills.findMany({
    where: { source_document_id: documentId },
    include: {
      lines: { orderBy: { seq: 'asc' } },
      // v11.0 解耦：移除 creator include，使用 creatorName 快照字段
    },
    orderBy: { created_at: 'desc' },
  });
  return bills;
}

export async function getReimbursementBill(billId: bigint) {
  const bill = await prisma.reimbursement_bills.findUnique({
    where: { id: billId },
    include: {
      lines: { orderBy: { seq: 'asc' } },
      // v11.0 解耦：移除 creator include，使用 creatorName 快照字段
      source_document: { select: { id: true, document_no: true, title: true } },
    },
  });
  if (!bill) throw Errors.notFound('报销副单不存在');
  return bill;
}

export async function deleteReimbursementBill(billId: bigint, actor: { id: bigint; name: string }) {
  const bill = await prisma.reimbursement_bills.findUnique({
    where: { id: billId },
    select: { id: true, bill_no: true, created_by: true },
  });
  if (!bill) throw Errors.notFound('报销副单不存在');

  await prisma.reimbursement_bills.delete({ where: { id: billId } });

  logger.info('报销副单删除', { billNo: bill.bill_no, actor: actor.name });
  return { success: true };
}
