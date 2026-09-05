#!/usr/bin/env node
// 单元格层守卫（verify S3c）
//
// 职责：落实「一个层级一个组件」——单元格层（一个格子怎么显示、点下去怎么改）
// 只允许一个对外出口 FieldCell，禁止在层外（业务页 / 新目录）再建一个 XxxCell 组件
// （层内多元是本次要消灭的病根）。
//
// 两道检查：
//   ① 硬阻断：扫描 frontend/src 下所有对外导出的 `*Cell` 组件，凡不在收敛白名单即 exit 1。
//      白名单 = 唯一出口 FieldCell + 已知薄封装/展示型（收敛过渡期保留）。
//      将来任何人新建一个对外 XxxCell（如 SalesCell / SpecCell）会被立即拦下，
//      逼他复用 FieldCell + 在 fieldDefs 登记字段，而不是再立一套组件。
//   ② 告警（过渡期不阻断）：残留手写确认层参数 dictConfig= / dictField= 在业务调用点，
//      提示收敛为 field 声明。薄封装/定义文件（白名单）内部不算。
//
// 负向验证：临时在业务页新建一个 dummy FooCell.tsx 并 export，本脚本必 exit 1；删除后 exit 0。

import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const SRC = path.resolve(cwd, 'frontend/src');

// 收敛白名单：单元格层当前已知的对外组件（唯一出口 + 薄封装 + 展示型内部件）。
// 不在其中的对外 *Cell 即违规。
const ALLOWED_FILES = new Set([
  'shared/components/cells/FieldCell.tsx',
  'shared/components/cells/DateTimeCell.tsx',
  'shared/components/cells/EnumInlineEditCell.tsx',
  'shared/components/cells/ImageThumbCell.tsx',
  'shared/components/cells/LongTextCell.tsx',
  'shared/components/cells/NameLinkCell.tsx',
  'shared/components/cells/StatusTagCell.tsx',
  'shared/components/cells/TextCell.tsx',
  'shared/components/product-picker/PickerInlineCells.tsx',
  'shared/components/workbench/WorkbenchFieldCell.tsx',
  'shared/components/DictRefCell.tsx',
  'shared/components/table/cell-editors/PickerCellEditor.tsx',
  'shared/components/table/cell-editors/StaticCellEditor.tsx',
  'shared/components/table/cell-editors/TextCellEditor.tsx',
  'apps/staff/pages/product-manage/ArchiveFieldCell.tsx',
  'shared/components/table/editorRegistry.tsx',
]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

const files = walk(SRC);
const violations = [];
for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/');
  const src = fs.readFileSync(f, 'utf8');
  const re = /export\s+(?:function|const)\s+(\w*Cell)\b/g;
  let m;
  while ((m = re.exec(src))) {
    if (!ALLOWED_FILES.has(rel)) {
      violations.push(`${rel}：对外导出单元格组件 ${m[1]}（单元格层应只有一个对外出口 FieldCell）`);
    }
  }
}

// 残留手写确认层参数（告警，过渡期不阻断）；薄封装/定义文件内部不算
const residualRe = /(?:dictConfig=|dictField=)/g;
const residual = [];
for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/');
  if (ALLOWED_FILES.has(rel)) continue; // 薄封装内部允许残留，待删
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = residualRe.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    residual.push(`${rel}:${line}`);
    if (residual.length > 60) break;
  }
  if (residual.length > 60) break;
}

let ok = true;
if (violations.length) {
  console.error('❌ 单元格层守卫：发现层外新增对外单元格组件（禁止层内多元复活）');
  violations.forEach((v) => console.error('   ' + v));
  ok = false;
}
if (residual.length) {
  console.warn(`⚠ 单元格层守卫：残留手写确认层参数 ${residual.length} 处（过渡期告警，待收敛为 field 声明）：`);
  residual.slice(0, 25).forEach((r) => console.warn('   ' + r));
}
if (ok) console.log('✅ 单元格层守卫通过（层外无新增组件；残留参数见上告警）');
process.exit(ok ? 0 : 1);
