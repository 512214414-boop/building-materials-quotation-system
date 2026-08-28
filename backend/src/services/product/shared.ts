// 产品域共享：常量与序列化。禁止在此堆业务流程。
export const DEFAULT_SPEC_MODEL = '通用';
export const DEFAULT_UNIT_NAME = '件';

export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return isNaN(n) ? null : n;
  }
  // Decimal 类型
  return (val as { toNumber: () => number }).toNumber();
}

export function roundPrice2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 进价 = 面价 × 点位。purchase_price.price 存面价，禁止散写乘法。 */
export function calcEffectivePrice(facePrice: number, point: number): number {
  return roundPrice2(facePrice * point);
}
