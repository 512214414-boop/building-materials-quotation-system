#!/usr/bin/env node
/**
 * 生成「访问地址总表」—— 全项目所有能打开的界面，一处汇总
 *
 * 为什么是生成物：地址（端口/路径）属于现状，现状从代码提取，
 * 手写必漂移（「下发文档范本」篇硬纪律）。
 *
 * 数据源：
 *   - dev.sh                    项目的服务与端口（单一来源）
 *   - tools/meta-studio.mjs     登记表配置台端口
 *   - /tmp/cpolar_public_url.txt 公网地址（dev.sh 写入）
 *   - 实时 HTTP 探测             在线状态
 *
 * 产出：项目根「访问地址.md」
 * 消费方：AGENTS.md 执行卡引用 / 中文命令中心菜单「全部地址」/ 人直接看
 *
 * 用法：node tools/gen-access.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '访问地址.md');

function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; }
}

function lanIp() {
  for (const iface of ['en0', 'en1', 'en2', 'en3']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (ip) return ip;
    } catch { /* 下一个网卡 */ }
  }
  return '';
}

function probe(url) {
  try {
    const code = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${url}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return /^(200|301|302|304|401|403)$/.test(code);
  } catch { return false; }
}

/* ------------------------- 从代码提取端口与说明 -------------------------- */

const devSh = read('dev.sh');
const metaStudio = read('tools/meta-studio.mjs');

const SERVICES = [
  {
    name: '员工端（日常用，秒开）',
    port: 8080,
    path: '/',
    from: 'dev.sh（npm run preview -- --port 8080）',
    cmd: '启动项目',
  },
  {
    name: '员工端（开发热更新，改代码自动刷新）',
    port: 8081,
    path: '/',
    from: 'dev.sh（npm run dev -- --port 8081）',
    cmd: '启动项目',
  },
  {
    name: '后端接口',
    port: 3000,
    path: '/api/health',
    from: 'dev.sh（backend npm run dev）',
    cmd: '启动项目',
  },
  {
    name: '方法论文档站（执行卡上游）',
    port: 8123,
    path: '/',
    from: '文档可视化/（python3 -m http.server 8123）',
    cmd: '文档站',
  },
  {
    name: '白话进度看板',
    port: 8124,
    path: '/项目进度看板.html',
    from: 'tools/gen-boss-view.mjs 产出 + 本目录静态服务',
    cmd: '看进度',
  },
  {
    name: '登记表配置台（Meta Studio）',
    port: Number((metaStudio.match(/localhost:(\d{4})/) || [])[1]) || 8898,
    path: '/',
    from: 'tools/meta-studio.mjs',
    cmd: '（node tools/meta-studio.mjs）',
  },
];

/* 公网地址是动态的：dev.sh 把它写进 /tmp/cpolar_public_url.txt；没建过隧道时文件不存在 */
let cpolarUrl = '';
try { cpolarUrl = fs.readFileSync('/tmp/cpolar_public_url.txt', 'utf8').trim(); } catch { /* 未建隧道 */ }
const rows = SERVICES.map((s) => {
  const local = `http://localhost:${s.port}${s.path}`;
  return {
    ...s,
    local,
    online: probe(local),
  };
});
const cpolarOnline = cpolarUrl ? probe(cpolarUrl + '/') : false;

const lan = lanIp();
const updated = new Date().toLocaleString('zh-CN', { hour12: false });

/* --------------------------------- 渲染 --------------------------------- */

const dot = (ok) => (ok ? '🟢 在线' : '🔴 未启动');

const table = rows
  .map(
    (s) =>
      `| ${s.name} | ${s.local} | ${dot(s.online)} | \`${s.cmd}\` |`
  )
  .join('\n');

const cpolarRow = cpolarUrl
  ? `| 公网访问（外网） | ${cpolarUrl} | ${dot(cpolarOnline)} | \`建公网\` |`
  : `| 公网访问（外网） | 未建立（跑一次 \`建公网\` 即有） | ⚪ 未建 | \`建公网\` |`;

const lanBlock = lan
  ? `## 手机访问（同一热点时）

把地址里的 \`localhost\` 换成电脑当前 IP：\`${lan}\`

例：员工端 → \`http://${lan}:8080\`；看板 → \`http://${lan}:8124/项目进度看板.html\`

> 热点重连后 IP 会变，重跑本脚本刷新。`
  : '## 手机访问\n\n未检测到局域网 IP（电脑可能没联网）。';

const md = `# 访问地址总表

> 由 \`node tools/gen-access.mjs\` 从 dev.sh 等代码**自动提取并实时探测**生成，勿手改。
> 更新于 ${updated}。中文命令见执行卡「七、访问地址与命令中心」。

## 服务清单

| 服务 | 地址 | 状态 | 用中文命令启动 |
|---|---|---|---|
${table}
${cpolarRow}

${lanBlock}

## 端口速查

${rows.map((s) => `- \`${s.port}\` → ${s.name}`).join('\n')}${cpolarUrl ? '\n- 公网 → cpolar 隧道（映射 8080）' : ''}

## 来源（改端口来这里，不要改本文件）

${rows.map((s) => `- ${s.name}：${s.from}`).join('\n')}
`;

fs.writeFileSync(OUT, md, 'utf8');
console.log(`已生成 访问地址.md（${rows.filter((r) => r.online).length}/${rows.length + (cpolarUrl ? 1 : 0)} 项在线）`);
