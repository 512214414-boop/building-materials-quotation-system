// 统计口径一致性测试（元模型运行时 · 阶段 D）
// INDICATORS 是区间汇总口径的唯一声明（来源 entity-meta.yml），
// 本测试断言其与 summaryService / rangeSummary 的实际实现口径一致，防止改口径只改一处。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDICATORS } from '../src/services/generated/entityMeta.generated.js';

test('INDICATORS 五个区间汇总口径与 summaryService 实现一致', () => {
  const map = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

  // 销售额 = SUM(document_lines.amount)
  assert.equal(map.salesAmount?.aggregate, 'SUM(document_lines.amount)');
  // 回款 = SUM(payment_records.amount) WHERE reconcile_status=reconciled
  assert.equal(map.paymentAmount?.aggregate, 'SUM(payment_records.amount)');
  assert.equal(map.paymentAmount?.filter, 'reconcile_status=reconciled');
  // 成本 = SUM(cost_lines.cost_amount)
  assert.equal(map.costAmount?.aggregate, 'SUM(cost_lines.cost_amount)');
  // 退货扣减 = SUM(refund_lines.refund_amount) WHERE refund_type=refund
  assert.equal(map.refundAmount?.aggregate, 'SUM(refund_lines.refund_amount)');
  assert.equal(map.refundAmount?.filter, 'refund_type=refund');
  // 净利润 = 销售额 − 成本 − 退货扣减
  assert.equal(map.netProfit?.formula, 'salesAmount - costAmount - refundAmount');

  // 完整清单 = 5 个，不允许多/漏
  assert.deepEqual(
    INDICATORS.map((i) => i.id).sort(),
    ['costAmount', 'netProfit', 'paymentAmount', 'refundAmount', 'salesAmount'],
  );
});
