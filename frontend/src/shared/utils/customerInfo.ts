/** 单据客户信息：姓名 + 当时挑的那条联系 */
export function formatCustomerInfo(
  name?: string | null,
  contactValue?: string | null,
  method?: string | null,
): string {
  const n = (name ?? '').trim();
  const v = (contactValue ?? '').trim();
  const m = (method ?? '').trim();
  const contact = m && m !== '电话' && v ? `${m} ${v}` : v;
  return [n, contact].filter(Boolean).join(' ');
}
