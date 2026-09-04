#!/usr/bin/env node
/**
 * 掌控台实时服务 —— 每次访问自动重新生成，永不过期
 *
 * 为什么存在：静态文件是快照，git 提交/进度变化后手机看到的就是旧的，
 * 用户得记得「先敲一次看进度」——这违反「系统适配人」。
 * 现在打开即最新：访问 → 重跑生成器 → 返回。
 *
 * 端口 8124；3 秒缓存防止连点重复生成。
 * 用法：node tools/control-server.mjs（开工菜单自动拉起）
 */
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8124;
const PAGE = '项目掌控台.html';
let cached = { t: 0, body: null };

function fresh() {
  const now = Date.now();
  if (now - cached.t > 3000 || !cached.body) {
    try {
      execSync('node tools/gen-boss-view.mjs', { cwd: ROOT, stdio: 'ignore', timeout: 20000 });
      cached = { t: now, body: fs.readFileSync(path.join(ROOT, PAGE)) };
    } catch (e) {
      // 生成失败：有旧缓存就继续用旧的，页面不至于打不开
      if (!cached.body) return null;
      cached.t = now;
    }
  }
  return cached.body;
}
function res_error(res) {
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('掌控台生成失败：先在电脑上跑 node tools/gen-boss-view.mjs 看报错');
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/' || url.endsWith(PAGE)) {
      const body = fresh();
      if (body === null) return;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('只有掌控台一页。其他页面看掌控台里的入口按钮。');
  })
  .listen(PORT, () => {
    console.log(`掌控台实时服务已就绪：http://localhost:${PORT}（每次打开自动刷新为最新）`);
  });
