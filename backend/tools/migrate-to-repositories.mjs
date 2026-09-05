// 机器辅助迁移：应用层 prisma.<model>  →  repositories.<ctx>.<model>
//
// 纯改名（P3 接缝）：repositories.<ctx>.<model> 与 prisma.<model> 是同一个
// 租户化 Prisma delegate（经 PrismaRepositoryBase 包装，签名对齐），行为等价。
// 本脚本只动应用层（services / controllers / routes），不动 infrastructure / config / tests。
//
// 用法：node backend/tools/migrate-to-repositories.mjs [--dry]
//   --dry  只报告会改哪些文件，不落盘。

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..'); // backend/
const APP_LAYER = ['src/services', 'src/controllers', 'src/routes'];
const TARGET_FILE = join(ROOT, 'src/infrastructure/persistence/prisma/repositories.js');

const DRY = process.argv.includes('--dry');

// ---- 读取 model → bucket 映射（来自各上下文仓储桶）----
const MAP_PATH = process.env.MODEL_MAP || '/tmp/modelmap.txt';
const modelMap = new Map(); // model -> bucket
for (const line of readFileSync(MAP_PATH, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || !t.includes(':')) continue;
  const [model, bucket] = t.split(':');
  modelMap.set(model, bucket);
}
// 长模型名优先，避免 prisma.product 误伤 prisma.product_image
const modelsByLen = [...modelMap.keys()].sort((a, b) => b.length - a.length);

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 仅匹配 prisma.<model>，且 model 后不能是标识符字符（防子串误伤）
const modelRx = modelsByLen.map((m) => [m, new RegExp('prisma\\.' + escapeRx(m) + '(?![A-Za-z0-9_])', 'g')]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function computeImportPath(file) {
  let rel = relative(dirname(file), TARGET_FILE);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// 判断文件是否还「真的用到 prisma」（排除 import 路径里的 prisma.js）。
// 覆盖两类真实用法：prisma.$transaction / prisma.$executeRaw 等引擎方法，以及裸 prisma 透传。
const stillUsesPrisma = (src) => /prisma\.(?!(js\b))/g.test(src) || /\bprisma\b(?![\w.])/.test(src);

// 从代码里抽取 "import ... from '...prisma.js'" 中绑定了 prisma 的导入行，
// 返回需要在安全时清理的 { line, bindings } 列表。
function findPrismaImports(src) {
  const results = [];
  const re = /^[ \t]*import\s+(.+?)\s+from\s+['"]([^'"]*prisma\.js)['"];?[ \t]*$/gm;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const path = m[2];
    // 收集绑定名
    const bindings = [];
    let bm;
    const bindRe = /\b(?:prisma|Prisma)\b/g;
    // 解析 { a, b } / * as prisma / default prisma
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        const nm = part.trim().split(/\s+as\s+/).pop().trim();
        if (nm) bindings.push(nm);
      }
    } else {
      const def = clause.replace(/^\s*(?:type\s+)?/, '').trim();
      if (def) bindings.push(def);
    }
    if (bindings.includes('prisma')) {
      results.push({ line: m[0], bindings, path });
    }
  }
  return results;
}

function removeOrTrimPrismaImports(src) {
  const imports = findPrismaImports(src);
  let newSrc = src;
  for (const imp of imports) {
    if (imp.bindings.length === 1) {
      // 整行移除
      newSrc = newSrc.replace(imp.line + '\n', '').replace(imp.line, '');
    } else {
      // 只移除 prisma 绑定，保留其余
      const newClause = imp.line.replace(/\{([^}]*)\}/, (whole, inner) => {
        const kept = inner.split(',').filter((p) => {
          const nm = p.trim().split(/\s+as\s+/).pop().trim();
          return nm && nm !== 'prisma';
        });
        return '{ ' + kept.join(', ') + ' }';
      });
      // 若花括号内变空，则整行移除
      if (/\{\s*\}/.test(newClause)) {
        newSrc = newSrc.replace(imp.line + '\n', '').replace(imp.line, '');
      } else {
        newSrc = newSrc.replace(imp.line, newClause);
      }
    }
  }
  return newSrc;
}

function hasRepositoriesImport(src) {
  return /import\s+.*\brepositories\b.*\s+from\s+['"]/.test(src);
}

function addRepositoriesImport(src, relPath) {
  const line = `import { repositories } from '${relPath}';`;
  // 插到第一个 import 之前；若没有 import，插到文件顶部
  const firstImport = src.match(/^[ \t]*import\s.+?;[ \t]*$/m);
  if (firstImport) {
    const idx = src.indexOf(firstImport[0]);
    return src.slice(0, idx) + line + '\n' + src.slice(idx);
  }
  return line + '\n' + src;
}

const changed = [];
for (const rel of APP_LAYER) {
  const dir = join(ROOT, rel);
  if (!statSync(dir, { throwIfNoEntry: false })) continue;
  for (const file of walk(dir)) {
    const original = readFileSync(file, 'utf8');
    let src = original;
    let replaced = 0;
    for (const [model, rx] of modelRx) {
      src = src.replace(rx, () => {
        replaced++;
        return 'repositories.' + modelMap.get(model) + '.' + model;
      });
    }
    if (replaced === 0) continue;

    const relPath = computeImportPath(file);
    // 仍真实用到 prisma（如 $transaction / 透传）则保留其 import；否则移除/精简
    const keepPrisma = stillUsesPrisma(src);
    if (!hasRepositoriesImport(src)) src = addRepositoriesImport(src, relPath);
    if (!keepPrisma) src = removeOrTrimPrismaImports(src);

    changed.push({ file: relative(ROOT, file), replaced, stillPrisma: keepPrisma });
    if (!DRY) writeFileSync(file, src, 'utf8');
  }
}

console.log(`MODE: ${DRY ? 'DRY-RUN' : 'APPLY'}`);
console.log(`model map size: ${modelMap.size}`);
console.log(`files changed: ${changed.length}`);
for (const c of changed) {
  console.log(`  ${c.file}  (${c.replaced} replacements, prisma still used: ${c.stillPrisma})`);
}
