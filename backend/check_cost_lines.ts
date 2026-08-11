import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const warehouses = await prisma.suppliers.findMany({ where: { type: 'warehouse' } });
  console.log('warehouses:', warehouses);
  const docLines = await prisma.document_lines.findMany({ where: { document_id: 4n } });
  console.log('docLines:', docLines.map(d => ({ id: d.id, seq: d.seq, qty: d.qty, productId: d.product_id, amount: d.amount })));
  const units = await prisma.product_units.findMany({ where: { product_id: { in: docLines.map(d => d.product_id!) } } });
  console.log('units:', units.map(u => ({ id: u.id, productId: u.product_id, unit: u.unit, costPrice: u.cost_price, salePrice: u.sale_price })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
