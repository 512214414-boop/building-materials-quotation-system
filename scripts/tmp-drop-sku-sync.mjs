// 删除宽表同步（写侧）：所有 await syncSkuSearchByXxx(...) 调用 + 对应 import 条目
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'backend/src';
let fileCount = 0;
let callCount = 0;
let importBlockCount = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.ts')) process(p);
  }
}

function process(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (!/syncSkuSearchBy/.test(src)) return;
  const before = src;

  // 1) 删除同步调用行（单行 await 形式）
  src = src.replace(/^[ \t]*await syncSkuSearchBy\w+\([^()]*\);[ \t]*\n/gm, (m) => {
    callCount += 1;
    return '';
  });

  // 2) 清理 import：移除 syncSkuSearchBy* 条目；整块只剩它们就删掉整块
  src = src.replace(/import \{([^}]*)\} from '([^']*skuSearch\.js)';/g, (m, inner, mod) => {
    const kept = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('syncSkuSearchBy'));
    if (kept.length === 0) {
      importBlockCount += 1;
      return '';
    }
    return `import {${kept.map((k) => `\n  ${k},`).join('')}\n} from '${mod}';`;
  });

  // 3) 压缩连续空行
  src = src.replace(/\n{3,}/g, '\n\n');

  if (src !== before) {
    fs.writeFileSync(file, src, 'utf8');
    fileCount += 1;
    console.log('清理:', file);
  }
}

walk(ROOT);
console.log(
  `\n完成：${fileCount} 个文件，删除 ${callCount} 处同步调用，${importBlockCount} 个 import 块整块移除`,
);
