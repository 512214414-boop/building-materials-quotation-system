#!/usr/bin/env node
/**
 * 端口守卫 —— 防复发
 *
 * 为什么要有它：
 *   端口从 6 个涨到 8 个，是**人工发现**的。8090、8899 两个幽灵空跑了数天没人管，
 *   根因是随手起服务、无人记账，而 dev.sh 的停止逻辑又从不管 python3 -m http.server。
 *   没有守卫，三个月后同样的问题会再来一次，而且仍需人工发现。
 *
 * 扫 lsof 的监听端口，对照 tools/ports.mjs（唯一真相源），报两类问题：
 *   ① 在监听但没登记  → 下一个 8090，必须在它活过一周前被发现
 *   ② 登记了却没起    → 工具挂了而没人知道
 *
 * 只盯 node / python 起的监听端口：这些是项目会起的。系统服务（ssh、AirPlay 等）
 * 不是我们该管的，混进来只会淹没真正的信号。
 *
 * optional 条目（如独立运行的配置台 8898）：在监听时只提示，未监听也不算缺失。
 *
 * 用法：node tools/check-ports.mjs   （有问题退出码 1，可接门禁）
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPorts } from './ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 项目会起的就这两类进程；系统服务一概不管，避免噪音淹没信号
const WATCHED = new Set(['node', 'Node', 'Python', 'python3', 'python']);

function listening() {
  let out = '';
  try {
    out = execSync('lsof -nP -iTCP -sTCP:LISTEN', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }
  const hits = new Map(); // port -> { cmd, pids:Set }
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s+.*:(\d+)\s+\(LISTEN\)/);
    if (!m) continue;
    const [, cmd, pid, portStr] = m;
    if (!WATCHED.has(cmd)) continue;
    const port = Number(portStr);
    if (!hits.has(port)) hits.set(port, { cmd, pids: new Set() });
    hits.get(port).pids.add(pid);
  }
  return [...hits.entries()].map(([port, v]) => ({ port, cmd: v.cmd, pids: [...v.pids] }));
}

/**
 * 进程的工作目录。用来区分「本项目起的服务」和「IDE / 系统起的服务」——
 * 后者不是我们能管的，报出来只会把真正的信号淹没掉。
 */
/**
 * lsof 会把路径里的非 ASCII 字符（本项目路径含中文）转成八进制转义，
 * 如 建材 → \xe5\xbb\xba。不还原就永远比不上项目目录。
 */
function unescapeLsof(s) {
  if (!s.includes('\\x')) return s;
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
      bytes.push(parseInt(s.slice(i + 2, i + 4), 16));
      i += 3;
    } else {
      bytes.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function cwdOf(pid) {
  try {
    // -a -d cwd -Fn：只要 cwd 这一条、只输出路径（比解析整表稳）
    const out = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      if (line.startsWith('n')) return unescapeLsof(line.slice(1));
    }
  } catch { /* 权限不足或进程已退出 */ }
  return '';
}

const inProject = (cwd) => !!cwd && (cwd === ROOT || cwd.startsWith(ROOT + path.sep));

// IDE / 编辑器自身的进程：它们常在项目目录里启动，光看 cwd 分不出来，
// 只能从命令上认——它们跑的是编辑器自己的程序，不是项目里的脚本。
const IDE_HINTS = ['codebuddy', 'cursor', 'vscode', 'visual studio code', 'windsurf', 'trae'];
const isIde = (cmd) => IDE_HINTS.some((h) => cmd.toLowerCase().includes(h));

function cmdline(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .slice(0, 90);
  } catch {
    return '';
  }
}

export function auditPorts() {
  const reg = allPorts();
  const regPorts = new Map(reg.map((p) => [p.port, p]));
  const live = listening();
  const livePorts = new Set(live.map((l) => l.port));

  // 只认本项目目录里起的服务；IDE / 系统服务另归一类，不算问题也不报警
  const mine = [];
  const foreign = [];
  for (const l of live) {
    const cwd = cwdOf(l.pids[0]);
    const cmd = cmdline(l.pids[0]);
    const ours = inProject(cwd) && !isIde(cmd);
    (ours ? mine : foreign).push({ ...l, cwd, fullCmd: cmd });
  }
  const minePorts = new Set(mine.map((l) => l.port));

  const missing = reg.filter((p) => !p.optional && !minePorts.has(p.port));
  const unregistered = mine.filter((l) => !regPorts.has(l.port));
  const optional = reg.filter((p) => p.optional && minePorts.has(p.port));
  const running = reg.filter((p) => minePorts.has(p.port));

  return { missing, unregistered, optional, running, foreign };
}

// 主模块守卫：被 import 时不打印
if (process.argv[1] && process.argv[1].endsWith('check-ports.mjs')) {
  const { missing, unregistered, optional, running, foreign } = auditPorts();
  const line = '─'.repeat(52);

  console.log('端口守卫（对照 tools/ports.mjs）');
  console.log(line);

  if (running.length) {
    console.log('✓ 在跑的：');
    for (const p of running) {
      console.log(`    ${String(p.port).padEnd(5)} ${p.name}${p.optional ? '（可选·独立运行）' : ''}`);
    }
  }

  if (missing.length) {
    console.log('');
    console.log('⚠ 登记了却没起：');
    for (const p of missing) {
      console.log(`    ${String(p.port).padEnd(5)} ${p.name}  ${p.desc}`);
    }
  }

  if (unregistered.length) {
    console.log('');
    console.log('⚠ 在监听但没登记（下一个幽灵就长这样）：');
    for (const u of unregistered) {
      console.log(`    ${String(u.port).padEnd(5)} ${u.cmd} (PID ${u.pids.join(',')})`);
      if (u.fullCmd) console.log(`          ${u.fullCmd}`);
      console.log(`          确认没用就杀：kill $(lsof -tiTCP:${u.port} -sTCP:LISTEN)`);
    }
  }

  if (optional.length) {
    console.log('');
    console.log('· 可选端口（独立运行时才会出现，不算问题）：');
    for (const p of optional) console.log(`    ${String(p.port).padEnd(5)} ${p.name}`);
  }

  if (foreign.length) {
    console.log('');
    console.log(`· 已忽略 ${foreign.length} 个非本项目进程监听的端口（IDE / 系统服务，不归我们管）`);
  }

  const bad = missing.length + unregistered.length;
  console.log(line);
  console.log(bad === 0 ? '✓ 端口账目清楚' : `✗ 有 ${bad} 处需要处理`);
  process.exit(bad === 0 ? 0 : 1);
}
