// 源码唯一权威校验：src 下禁止任何 .js 文件（.ts/.tsx 是唯一权威）。
// 背景：全站 import 统一写 .js 后缀，Vite 解析时「有真实 .js 文件就优先加载 .js，
// 没有才回退解析 .ts/.tsx」。若 src 下残留同名 .js，会遮蔽 .ts 权威源码，
// 造成「改 .ts 不生效」（2026-08-11 清理前 66 处双实现并存的历史病根）。
// 本脚本并入 build:check，发现 .js 即失败，让双份在第一次出现时就暴露。
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...walk(full));
        } else {
            out.push(full);
        }
    }
    return out;
}

const jsFiles = walk(SRC).filter((p) => p.endsWith('.js'));
if (jsFiles.length > 0) {
    console.error(`[check:dupe] 失败：src 下发现 ${jsFiles.length} 个 .js 文件（源码唯一权威被破坏，.js 会遮蔽同名 .ts/.tsx）:`);
    for (const f of jsFiles) {
        console.error(`  - ${f.replace(SRC + '/', '')}`);
    }
    console.error('请删除这些 .js 副本（保留 .ts/.tsx 权威源码），再重新构建。');
    process.exit(1);
}

console.log('[check:dupe] 通过：src 下无 .js 文件，.ts/.tsx 为唯一权威源码。');
