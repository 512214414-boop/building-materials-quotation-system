// dev-layer.mjs —— 配置层预览「一键启动」（纯静态服务，零生成器）
//
// 用法：npm run layer  →  http://localhost:8899
//
// 职责只有一件事：把项目根目录静态 serve 出去（no-store，永不缓存）。
// 预览页（配置预览/配置预览面板.html）打开时一次性 fetch 配置层真源文件并可视化，
// 改文件后刷新浏览器即最新——**不经过任何生成步骤**（gen-layer-preview 等生成器已停用未删，
// 定稿后做真解释器时再启用，见 配置预览/config-layer/README.md）。
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS } from './ports.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || PORTS.layerPreview.port;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/配置预览/配置预览面板.html';
    const safe = normalize(join(ROOT, pathname));
    if (!safe.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const data = await readFile(safe);
    res.writeHead(200, {
      'Content-Type': MIME[extname(safe).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(500);
    res.end(String(e));
  }
});

server.listen(PORT, () => {
  console.log('\n  ┌────────────────────────────────────────────────────────┐');
  console.log(`  │  配置层预览就绪： http://localhost:${PORT}                │`);
  console.log('  │  纯静态服务：页面打开即读 配置预览/config-layer/ 真源文件， │');
  console.log('  │  改文件后刷新浏览器即最新。无生成器、无轮询、无验证、无门禁。│');
  console.log('  └────────────────────────────────────────────────────────┘\n');
});
