import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // 1. 创建（或复用）一个仓库类型 supplier
  const warehouse = await prisma.suppliers.upsert({
    where: { id: 999n },
    update: {},
    create: { id: 999n, name: '深圳南山总仓', type: 'warehouse', contact: '仓管员', phone: '0755-12345678', address: '深圳南山区', status: 'active' },
  });
  console.log('warehouse:', warehouse);

  // 2. 清理旧的 allocation_lines（避免 unique 冲突）
  await prisma.allocation_lines.deleteMany({ where: { line_id: { in: [7n, 8n] } } });

  // 3. 创建 allocation_lines
  const alloc1 = await prisma.allocation_lines.create({
    data: { line_id: 7n, source_type: 'warehouse', source_id: warehouse.id, alloc_qty: 5, pending_status: 'allocated', unit_cost: 380, freight_share: 50, batch_no: 'WH-001' },
  });
  const alloc2 = await prisma.allocation_lines.create({
    data: { line_id: 8n, source_type: 'external', source_id: 47n, alloc_qty: 200, pending_status: 'allocated', unit_cost: 15, freight_share: 200, batch_no: 'EXT-001' },
  });
  console.log('alloc1:', alloc1.id, 'alloc2:', alloc2.id);

  // 4. 推进单据状态到 delivery_completed
  const updated = await prisma.documents.update({
    where: { id: 4n },
    data: { status: 'delivery_completed' },
  });
  console.log('doc status:', updated.status);

  // 5. 创建 delivery_records（运费分摊，源3）
  await prisma.delivery_records.deleteMany({ where: { document_id: 4n } });
  const dr = await prisma.delivery_records.create({
    data: { document_id: 4n, freight: 250, delivery_method: 'logistics', status: 'signed' },
  });
  console.log('delivery_record:', dr.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
