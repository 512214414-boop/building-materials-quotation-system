/**
 * 表格列装配单测（G2 平台层）
 *
 * 为什么测这两个：
 *
 * 1) auditCellSpecs —— 这是「配置自洽性」的自检器。
 *    它自己要是漏判，坏配置（声明了 confirm 却没给 gate）会静默溜进页面，
 *    表现是「点格子没反应」，而类型检查查不出这类"声明了但没配全"的问题。
 *    自检器必须自己先是对的，否则防线形同虚设。
 *
 * 2) mergeColumns —— 骨架列与视图覆盖的合并规则（含 slot 占位替换）。
 *    这里回归 = 列丢失 / 重复 / 顺序错乱，是用户一眼能看到的界面破损。
 */
import { describe, expect, it } from 'vitest';
import { auditCellSpecs, type CellSpec } from '../src/shared/components/table/cellSpec.js';
import { mergeColumns } from '../src/shared/config/deriveTableColumns.js';

const spec = (
  over: Partial<CellSpec<any>> & { key: string; editEntry: CellSpec<any>['editEntry'] },
): CellSpec<any> =>
  ({
    title: over.key,
    display: 'text',
    value: () => '',
    ...over,
  }) as CellSpec<any>;

const col = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, title: key, ...extra }) as any;

describe('auditCellSpecs · 配置自洽自检', () => {
  it('配置完整时不产生审计项', () => {
    const out = auditCellSpecs([
      spec({ key: 'a', editEntry: 'confirm', gate: {} as any }),
      spec({ key: 'b', editEntry: 'inline', onCommit: () => {} }),
      spec({ key: 'c', editEntry: 'link', href: () => '' }),
    ]);
    expect(out).toEqual([]);
  });

  it('confirm 缺 gate → 报 missingGate', () => {
    const out = auditCellSpecs([spec({ key: 'a', editEntry: 'confirm' })]);
    expect(out).toEqual([
      { key: 'a', raw: false, missingGate: true, reason: 'editEntry=confirm 但缺 gate 配置' },
    ]);
  });

  it('inline 缺 onCommit → 报', () => {
    const out = auditCellSpecs([spec({ key: 'b', editEntry: 'inline' })]);
    expect(out).toEqual([{ key: 'b', raw: false, reason: 'editEntry=inline 但缺 onCommit' }]);
  });

  it('link 缺 href → 报', () => {
    const out = auditCellSpecs([spec({ key: 'c', editEntry: 'link' })]);
    expect(out).toEqual([{ key: 'c', raw: false, reason: 'editEntry=link 但缺 href' }]);
  });

  it('多列有问题时一次全报（不 fail-fast，一次看全红项）', () => {
    const out = auditCellSpecs([
      spec({ key: 'a', editEntry: 'confirm' }),
      spec({ key: 'b', editEntry: 'inline' }),
      spec({ key: 'c', editEntry: 'link' }),
    ]);
    expect(out.map((o) => o.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeColumns · 骨架与视图覆盖合并', () => {
  it('同 key 的 override 浅合并进骨架列（视图补 render 等）', () => {
    const merged = mergeColumns([col('a'), col('b')], [col('a', { render: 'R' })]);
    expect(merged.map((c) => c.key)).toEqual(['a', 'b']);
    expect(merged[0].render).toBe('R');
  });

  it('骨架未声明的 override 列追加到末尾（如操作列）', () => {
    const merged = mergeColumns([col('a')], [col('op')]);
    expect(merged.map((c) => c.key)).toEqual(['a', 'op']);
  });

  it('slot 占位被同 slot 的多列替换（skuPrice 结构化多行场景）', () => {
    const merged = mergeColumns(
      [col('a'), col('__slot', { slot: 'skuPrice' }), col('z')],
      [col('p1', { slot: 'skuPrice' }), col('p2', { slot: 'skuPrice' })],
    );
    expect(merged.map((c) => c.key)).toEqual(['a', 'p1', 'p2', 'z']);
  });

  it('无 override 填充的 slot 占位被丢弃（不渲染空占位列）', () => {
    const merged = mergeColumns([col('a'), col('__slot', { slot: 'skuPrice' })], []);
    expect(merged.map((c) => c.key)).toEqual(['a']);
  });

  it('既无 key 也无 slot 的 override 归入末尾 extras', () => {
    const merged = mergeColumns([col('a')], [{ title: '无名列' } as any]);
    expect(merged).toHaveLength(2);
    expect(merged[1].title).toBe('无名列');
  });
});
