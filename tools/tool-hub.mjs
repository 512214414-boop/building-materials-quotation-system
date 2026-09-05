#!/usr/bin/env node
/**
 * 工具台 —— 开发期外围工具的统一入口（单进程 · 单端口）
 *
 * 为什么存在：
 *   此前外围工具各占各的端口——文档站 8123（python）、掌控台 8124（node）、
 *   登记表配置台 8898（node），外加两个没人认领的幽灵 8090/8899。
 *   数量是症状，病根是**随手起、无人记账**：dev.sh 的停止逻辑只管 backend 与 vite，
 *   从不管 python3 -m http.server，所以端口越堆越多。
 *
 * 本服务把三个工具收进**一个进程、一个端口**：
 *   /       导航页（三张工具卡片 + 实时状态 + 三套地址）
 *   /board  掌控台（沿用「访问即重跑生成器」的设计，打开即最新）
 *   /doc/   文档可视化站（进程内静态托管，python3 -m http.server 退役）
 *   /meta/  登记表配置台（**进程内调用** handleMetaRequest，不是 HTTP 转发）
 *
 * 关于「整合」而非「转发」（用户裁决）：
 *   配置台已从独立服务降级为模块（tools/meta-studio.mjs 的 handleMetaRequest），
 *   这里直接把请求交给它处理，走的是函数调用，不经过网络、不占第二个端口。
 *   用 HTTP 反代只是转发，配置台仍在后台跑着、仍占端口——那是半吊子。
 *
 * 边界（用户裁决）：这是**开发期工具，生产部署不带**。
 *   业务系统（3000/8080/8081）与它零依赖：工具台挂了、没起、生产环境没有，业务照常跑。
 *   业务代码、前端页面、后端接口均不得引用本服务任何路径。
 *
 * 端口来自 tools/ports.mjs（唯一真相源），此处不写死数字。
 * 用法：node tools/tool-hub.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PORTS } from './ports.mjs';
import { handleMetaRequest } from './meta-studio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, '文档可视化');
const PORT = PORTS.hub.port;
const PAGE = '项目掌控台.html';
const META_PREFIX = '/meta';
const DOC_PREFIX = '/doc';

/* ------------------------------ 掌控台 ------------------------------ */
// 沿用 control-server.mjs 的设计：访问即重跑生成器，打开永远是最新；
// 3 秒缓存防止连点重复生成；生成失败时降级用旧缓存，页面不至于打不开。
let cached = { t: 0, body: null, regening: false };

// 首次（无缓存）必须同步生成；之后走后台异步重生成，避免 execSync 把事件循环
// 堵死——否则连 /health、/doc/ 都会排不上队（gen-boss-view 是重量级生成）。
function regenSync() {
  try {
    execSync('node tools/gen-boss-view.mjs', { cwd: ROOT, stdio: 'ignore', timeout: 20000 });
    cached.body = fs.readFileSync(path.join(ROOT, PAGE));
    cached.t = Date.now();
    return true;
  } catch {
    return false;
  }
}

function freshBoard() {
  if (!cached.body) {
    regenSync();
    return cached.body;
  }
  const stale = Date.now() - cached.t > 3000;
  if (stale && !cached.regening) {
    cached.regening = true;
    spawn('node', ['tools/gen-boss-view.mjs'], { cwd: ROOT, stdio: 'ignore' })
      .on('exit', () => {
        try {
          cached.body = fs.readFileSync(path.join(ROOT, PAGE));
        } catch { /* 用旧缓存 */ }
        cached.t = Date.now();
        cached.regening = false;
      });
  }
  return cached.body;
}

/* --------------------------- /doc/ 静态托管 --------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
};

function serveDoc(req, res, relPath) {
  // 防路径穿越：normalize 之后必须仍在 DOCS_DIR 内
  const target = path.resolve(DOCS_DIR, '.' + path.posix.normalize(relPath));
  if (target !== DOCS_DIR && !target.startsWith(DOCS_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 越界');
    return;
  }
  let file = target;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(target, 'index.html');
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`找不到：${relPath}`);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------ 导航页 ------------------------------ */
function lanIp() {
  for (const iface of ['en0', 'en1', 'en2', 'en3']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (ip) return ip;
    } catch { /* 换下一个网卡 */ }
  }
  return '';
}

function publicUrl() {
  try {
    const u = fs.readFileSync('/tmp/cpolar_public_url.txt', 'utf8').trim();
    return /^https?:\/\//.test(u) ? u : '';
  } catch {
    return '';
  }
}

function navPage() {
  const ip = lanIp();
  const pub = publicUrl();
  const tools = [
    { href: '/board', name: '掌控台', desc: '看进度、待拍板、待办。打开即最新，不用手动刷新' },
    { href: '/doc/', name: '文档可视化站', desc: '方法论规则（AI 行为规则的源头）' },
    { href: '/meta/', name: '登记表配置台', desc: '给 AI 用的高级工具，日常不用管它' },
  ];
  const cards = tools
    .map(
      (t) => `<a class="card" href="${t.href}">
      <div class="cname">${t.name}</div>
      <div class="cdesc">${t.desc}</div>
      <div class="cstate" data-probe="${t.href}"><span class="dot wait"></span><span class="stxt">检测中…</span></div>
    </a>`,
    )
    .join('');

  return `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>工具台 · 建材报价系统</title>
<style>
  :root{--ink:#1C2024;--sub:#666E7A;--line:#e5e8ec;--bg:#F6F7F9;--card:#fff;
    --ok:#12A150;--warn:#C9821A;--primary:#2563EB}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
  header{background:var(--ink);color:#fff;padding:16px 20px}
  header .wrap{max-width:860px;margin:0 auto;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
  h1{margin:0;font-size:18px;font-weight:600}
  header .tag{font-size:12px;color:#9aa3ae}
  main{max-width:860px;margin:0 auto;padding:20px 16px 8px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
  .card{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:16px;text-decoration:none;color:inherit;transition:transform .15s,border-color .15s,box-shadow .15s}
  .card:hover,.card:focus{transform:translateY(-2px);border-color:var(--primary);
    box-shadow:0 6px 18px rgba(37,99,235,.10);outline:none}
  .cname{font-size:16px;font-weight:600}
  .cdesc{font-size:13px;color:var(--sub);margin-top:4px;min-height:40px}
  .cstate{margin-top:10px;font-size:12px;color:var(--sub);display:flex;align-items:center;gap:6px}
  .dot{width:8px;height:8px;border-radius:50%;background:#c9ced6;flex:0 0 auto}
  .dot.on{background:var(--ok)}
  .dot.off{background:var(--warn)}
  .note{background:#fffbea;border:1px solid #f0d98a;border-radius:10px;padding:12px 14px;
    font-size:13px;color:#6b5510;margin:18px 0 0}
  footer{max-width:860px;margin:0 auto;padding:12px 16px 28px}
  .addrs{display:flex;flex-wrap:wrap;gap:8px}
  .btn{padding:8px 14px;border-radius:9px;font-size:14px;text-decoration:none;font-weight:600;
    border:1px solid var(--line);background:#f2f4f7;color:#9aa3ae}
  .btn.on{background:#e8f5ee;border-color:var(--ok);color:#0d7a3c}
  .hint{font-size:12px;color:var(--sub);margin-bottom:8px}
  @media (max-width:640px){
    .cards{grid-template-columns:1fr}
    .cdesc{min-height:0}
  }
</style></head><body>
<header><div class="wrap">
  <h1>工具台</h1>
  <span class="tag">开发环境专用 · 生产部署不含这一块</span>
</div></header>
<main>
  <div class="cards">${cards}</div>
  <div class="note"><strong>这一块不跟着系统上线。</strong>它是开发期给 AI 和你自己用的工具箱，
  交付给客户的系统里没有它——你在手机上能用，是因为这台开发机开着、并且做了公网映射。</div>
</main>
<footer>
  <div class="hint" id="hint">正在探测哪些地址你现在能打开…</div>
  <div class="addrs" id="addrs"></div>
</footer>
<script>
var CFG = ${JSON.stringify({ lanIp: ip, publicUrl: pub, port: PORT })};
function probe(u){return new Promise(function(res){
  var done=false,t=setTimeout(function(){if(!done){done=true;res(false)}},2000);
  fetch(u,{mode:"no-cors",cache:"no-store"}).then(function(){if(!done){done=true;res(true)}})
    .catch(function(){if(!done){done=true;res(false)}});
})}
function cands(){
  var list=[{k:"本机",u:"http://localhost:"+CFG.port+"/"}];
  if(CFG.lanIp)list.push({k:"同热点",u:"http://"+CFG.lanIp+":"+CFG.port+"/"});
  if(CFG.publicUrl)list.push({k:"公网",u:CFG.publicUrl+"/"});
  return list;
}
function paintStates(){
  document.querySelectorAll(".cstate").forEach(function(el){
    var p=el.getAttribute("data-probe");
    probe(p).then(function(ok){
      var dot=el.querySelector(".dot"),txt=el.querySelector(".stxt");
      dot.className="dot "+(ok?"on":"off");
      txt.textContent=ok?"在线":"未启动";
      if(!ok)el.title="这个工具没在跑。电脑上敲：node tools/tool-hub.mjs";
    });
  });
}
function paintAddrs(){
  var box=document.getElementById("addrs"),hint=document.getElementById("hint");
  var list=cands(),pending=list.length,alive=[];
  list.forEach(function(c){
    probe(c.u).then(function(ok){
      if(ok)alive.push(c);
      if(--pending===0){
        hint.textContent=alive.length?"下面亮着的是你现在能打开的地址（推荐第一个）"
          :"当前一个地址都探测不到——工具台可能没启动。电脑上敲：node tools/tool-hub.mjs";
        box.innerHTML="";
        list.forEach(function(x){
          var a=document.createElement("a");
          var on=alive.indexOf(x)>=0;
          a.className="btn"+(on?" on":"");
          a.textContent=x.k+(on&&alive.length&&x.k===alive[0].k?" ★":"");
          if(on)a.href=x.u,a.target="_blank";
          box.appendChild(a);
        });
      }
    });
  });
}
paintStates();
paintAddrs();
</script>
</body></html>`;
}

/* ------------------------------ 路由 ------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  // 健康检查：开工.sh 靠它探活
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  // 登记表配置台：进程内调用，不走网络、不占第二个端口
  if (url === META_PREFIX || url.startsWith(META_PREFIX + '/')) {
    const rest = url.slice(META_PREFIX.length) || '/';
    try {
      await handleMetaRequest(req, res, rest, META_PREFIX);
    } catch (e) {
      if (res.headersSent) return;
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('登记表配置台出错：' + String(e.message || e));
    }
    return;
  }

  // 文档可视化站：进程内静态托管
  if (url === DOC_PREFIX || url.startsWith(DOC_PREFIX + '/')) {
    const rel = url.slice(DOC_PREFIX.length) || '/index.html';
    serveDoc(req, res, rel);
    return;
  }

  // 掌控台（含旧链接 /项目掌控台.html，兼容既有习惯）
  if (url === '/board' || url === '/' + encodeURIComponent(PAGE) || url === '/' + PAGE) {
    const body = freshBoard();
    if (body === null) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('掌控台生成失败：先在电脑上跑 node tools/gen-boss-view.mjs 看报错');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  // 导航页
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(navPage());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(
    [
      '没有这个路径：' + url,
      '',
      '可用的：',
      '  /       工具台首页',
      '  /board  掌控台',
      '  /doc/   文档可视化站',
      '  /meta/  登记表配置台',
      '  /health 健康检查',
    ].join('\n'),
  );
});

// 主模块守卫：被 import 时不启服务（便于测试）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`工具台已就绪：http://localhost:${PORT}`);
    console.log(`  /       工具台首页（三个工具的入口）`);
    console.log(`  /board  掌控台（打开即最新）`);
    console.log(`  /doc/   文档可视化站`);
    console.log(`  /meta/  登记表配置台（进程内模块，不占端口）`);
    console.log(`开发环境专用，生产部署不含这一块。`);
  });
}

export { navPage, server };
