// 信号雷达共享库单测（node:test，经 tsx 运行）
//
// 这些用例不是装饰：每一条都对准一种"裸正则扫描源码"会犯的错。
// 改动 tools/signal-lib.mjs 后必须重新跑，并且按 CONTRIBUTING 的规矩做变异验证
// （故意改坏源码 → 确认本测试转红 → 改回来）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  stripComments,
  freshnessMeta,
  DEFAULT_STALE_AFTER_MS,
} from '../../tools/signal-lib.mjs';

/** 不变式：剥离注释只做"替换成空白"，长度与行数必须逐字对齐 */
const assertShapePreserved = (src: string, out: string) => {
  assert.equal(out.length, src.length, '输出长度必须与输入一致（只替换空白）');
  assert.equal(
    out.split('\n').length,
    src.split('\n').length,
    '输出行数必须与输入一致（块注释保留换行，行号不漂移）',
  );
};

test('stripComments 去掉行注释，行尾代码与后续行不受影响', () => {
  const src = 'const a = 1; // note\nconst b = 2;\n';
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes('note'), false, '行注释内容必须被清除');
  assert.equal(out.includes('const a = 1;'), true);
  assert.equal(out.includes('const b = 2;'), true, '行注释不得吃掉下一行');
});

test('stripComments 去掉块注释并保留换行', () => {
  const src = 'a\n/* line1\nline2 */\nb\n';
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes('line1'), false);
  assert.equal(out.includes('line2'), false);
  assert.equal(out.includes('/*'), false);
  assert.equal(out.includes('*/'), false);
  // 换行位置不变：块注释跨第 2、3 行，第 1 行仍是 a，第 4 行仍是 b
  const lines = out.split('\n');
  assert.equal(lines[0], 'a');
  assert.equal(lines[3], 'b');
});

test('stripComments 不吃掉字符串里的 //（典型陷阱：\'http://x\'）', () => {
  // 关键：字符串与后续代码必须在同一行——否则行注释到换行就停，测不出误伤
  const src = "const url = 'http://x'; const n = 1;\n";
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes("'http://x'; const n = 1;"), true, "'http://x' 里的 // 不得被当行注释");
});

test('stripComments 不吃掉双引号字符串里的 //', () => {
  const src = 'const u = "http://y"; const m = 2;\n';
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes('"http://y"; const m = 2;'), true);
});

test('stripComments 处理模板字符串：${} 内按代码解析、字符串内的 // 保留、注释被剥离', () => {
  const src = "const s = `p ${ f('http://y') /* c */ } q`; const t = 1;\n";
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes("f('http://y')"), true, '${} 内字符串里的 // 不得被当注释');
  assert.equal(out.includes('c */'), false, '${} 内的块注释必须被剥离（证明 ${} 被当作代码上下文）');
  assert.equal(out.includes('} q`'), true, '模板字符串必须在正确位置闭合');
  assert.equal(out.includes('const t = 1;'), true, '模板闭合后必须回到代码上下文');
});

test('stripComments 识别正则字面量，同时把除法当普通字符', () => {
  const src = 'const re = /a\\/b/; const q = 4 / 2; // c\n';
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes('/a\\/b/'), true, '正则字面量整体保留（含转义 /）');
  assert.equal(out.includes('const q = 4 / 2;'), true, 'a / b 是除法，不得被当正则开头');
  assert.equal(out.includes('// c'), false, '真正的行注释仍要被剥离');
});

test('stripComments 不被 JSX 自闭合 /> 和闭合标签 </ 骗进正则状态', () => {
  const src = 'const el = <Foo a={1} />;\nconst n = 3; // tail\n';
  const out = stripComments(src);
  assertShapePreserved(src, out);
  assert.equal(out.includes('<Foo a={1} />;'), true);
  assert.equal(out.includes('const n = 3;'), true);
  assert.equal(out.includes('tail'), false);

  const src2 = '</Foo>\nconst m = 4; // tail2\n';
  const out2 = stripComments(src2);
  assertShapePreserved(src2, out2);
  assert.equal(out2.includes('const m = 4;'), true);
  assert.equal(out2.includes('tail2'), false);
});

test('stripComments 处理转义引号（单引号与双引号各一）', () => {
  const single = "const s = 'it\\'s // fine'; const t = 2;\n";
  const outSingle = stripComments(single);
  assertShapePreserved(single, outSingle);
  assert.equal(outSingle.includes("'it\\'s // fine'; const t = 2;"), true, "转义 \\' 不得提前闭合字符串");

  const dbl = 'const s = "a\\"//b"; const t = 2; // real\n';
  const outDbl = stripComments(dbl);
  assertShapePreserved(dbl, outDbl);
  assert.equal(outDbl.includes('"a\\"//b"; const t = 2;'), true, '转义 \\" 不得提前闭合字符串');
  assert.equal(outDbl.includes('real'), false, '字符串之后的真行注释仍要被剥离');
});

test('stripComments 边界：空串与非字符串入参', () => {
  assert.equal(stripComments(''), '');
  assert.equal(stripComments(undefined as unknown as string), '');
});

// ---------------- freshnessMeta ----------------

test('freshnessMeta 对新鲜报告返回 stale=false 且给出 ageMs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-lib-'));
  try {
    const p = path.join(dir, 'verify-report.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ generatedAt: new Date(Date.now() - 1000).toISOString() }),
      'utf8',
    );
    const m = freshnessMeta(p, 3600_000);
    assert.equal(m.error, null);
    assert.equal(m.stale, false);
    assert.equal(typeof m.ageMs, 'number');
    assert.equal((m.ageMs as number) >= 1000, true);
    assert.equal(typeof m.generatedAt, 'string');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('freshnessMeta 对超过阈值的报告返回 stale=true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-lib-'));
  try {
    const p = path.join(dir, 'verify-report.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ generatedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }),
      'utf8',
    );
    const m = freshnessMeta(p, 3600_000);
    assert.equal(m.error, null);
    assert.equal(m.stale, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('freshnessMeta 默认阈值为 24 小时', () => {
  assert.equal(DEFAULT_STALE_AFTER_MS, 24 * 3600 * 1000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-lib-'));
  try {
    const p = path.join(dir, 'verify-report.json');
    fs.writeFileSync(
      p,
      JSON.stringify({ generatedAt: new Date(Date.now() - 3600_000).toISOString() }),
      'utf8',
    );
    assert.equal(freshnessMeta(p).stale, false, '1 小时 < 默认 24 小时阈值');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('freshnessMeta 读不到/解析不了时 stale=true 并带 error（绝不静默当新鲜）', () => {
  const missing = freshnessMeta(path.join(os.tmpdir(), 'signal-lib-no-such-file.json'));
  assert.equal(missing.stale, true);
  assert.equal(missing.generatedAt, null);
  assert.equal(missing.ageMs, null);
  assert.equal(typeof missing.error, 'string');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-lib-'));
  try {
    const p = path.join(dir, 'broken.json');
    fs.writeFileSync(p, '{ not json', 'utf8');
    const broken = freshnessMeta(p);
    assert.equal(broken.stale, true);
    assert.equal(broken.generatedAt, null);
    assert.equal(typeof broken.error, 'string');

    const p2 = path.join(dir, 'no-field.json');
    fs.writeFileSync(p2, '{"ok":true}', 'utf8');
    const noField = freshnessMeta(p2);
    assert.equal(noField.stale, true);
    assert.equal(typeof noField.error, 'string');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
