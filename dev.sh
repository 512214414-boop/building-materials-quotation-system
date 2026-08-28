#!/bin/bash
# ==============================================================================
# 建材报价系统 — 一键启动
#
# SOP：停旧进程 → 缺依赖才装 → 后端 3000 + 开发 8081 并行
#      → 生产包（没变就跳过）→ preview 8080 → cpolar 映射 8080 → 输出全部地址
#
# 日常访问走 8080（生产构建，秒开）；改代码看热更新走 8081；
# 本机 / 局域网 / 公网 都打生产 8080 的真实地址，不是「未开」。
# ==============================================================================

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
set -eo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

LOG_DIR="/tmp"
BACKEND_LOG="$LOG_DIR/backend_dev.log"
FRONTEND_LOG="$LOG_DIR/frontend_dev.log"
BUILD_LOG="$LOG_DIR/frontend_build.log"
PREVIEW_LOG="$LOG_DIR/frontend_preview.log"
CPOLAR_LOG="$LOG_DIR/cpolar_dev.log"

BACKEND_PID="$LOG_DIR/backend_dev.pid"
FRONTEND_PID="$LOG_DIR/frontend_dev.pid"
PREVIEW_PID="$LOG_DIR/frontend_preview.pid"
CPOLAR_PID="$LOG_DIR/cpolar_dev.pid"
PUBLIC_URL_FILE="$LOG_DIR/cpolar_public_url.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()    { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓ $1${NC}"; }
info()  { echo -e "${BOLD}[$(date +%H:%M:%S)] ➜ $1${NC}"; }
err()   { echo -e "${RED}[$(date +%H:%M:%S)] ✗ $1${NC}"; }
fatal() { echo -e "${RED}${BOLD}[$(date +%H:%M:%S)] ✗ FATAL: $1${NC}"; exit 1; }
warn()  { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠ $1${NC}"; }

http_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$1" 2>/dev/null || echo "000")
  [[ "$code" =~ ^(200|301|302|304|401|403)$ ]]
}

save_pid() {
  local file="$1" port="$2"
  local pid
  pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || echo "")
  [ -n "$pid" ] && echo "$pid" > "$file"
}

# 只杀本项目相关进程，不扫整机 vite/tsx
kill_by_pattern() {
  local pattern="$1"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    log "  → 已结束: $pattern"
  fi
}

kill_listen_port() {
  local port="$1"
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && return 0
  echo "$pids" | xargs kill -9 2>/dev/null || true
  log "  → 已释放端口 $port"
}

wait_port_free() {
  local port="$1" i=0
  while [ $i -lt 8 ]; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.2
  done
}

wait_for_http() {
  local url="$1" name="$2" max_wait="${3:-30}" i=0
  log "  → 等待 $name: $url"
  while [ $i -lt "$max_wait" ]; do
    if http_ok "$url"; then
      ok "$name 就绪"
      return 0
    fi
    i=$((i + 1))
    if [ $i -le 3 ] || [ $((i % 8)) -eq 0 ]; then
      log "  → 等待中 ${i}s / ${max_wait}s"
    fi
    sleep 1
  done
  err "$name 超时"
  return 1
}

launch_detached() {
  local logfile="$1"
  shift
  python3 -c "
import os, sys, subprocess
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)
with open('$logfile', 'a') as f:
    subprocess.Popen(sys.argv[1:], stdin=subprocess.DEVNULL,
                     stdout=f, stderr=subprocess.STDOUT, close_fds=True)
os._exit(0)
" "$@"
}

stop_cpolar() {
  # 新版 cpolar 会变成 "cpolar: master process"，不能只匹配 "cpolar http"
  pkill -f cpolar 2>/dev/null || true
  rm -f "$CPOLAR_PID" "$PUBLIC_URL_FILE"
}

stop_app() {
  info "停止应用（后端 / 8080 / 8081）..."
  kill_by_pattern "$BACKEND_DIR"
  kill_by_pattern "$FRONTEND_DIR/node_modules/.bin/vite"
  kill_listen_port 3000
  kill_listen_port 8080
  kill_listen_port 8081
  wait_port_free 3000
  wait_port_free 8080
  wait_port_free 8081
  rm -f "$BACKEND_PID" "$FRONTEND_PID" "$PREVIEW_PID"
  ok "应用已停"
}

cmd_stop() {
  stop_app
  info "停止公网穿透..."
  stop_cpolar
  ok "全部已停"
}

verify_dependencies() {
  info "检查依赖（缺什么补什么，不重复安装、不清缓存）..."
  if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    (cd "$BACKEND_DIR" && npm install) || fatal "后端依赖安装失败"
  fi
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    (cd "$FRONTEND_DIR" && npm install) || fatal "前端依赖安装失败"
  fi
  if [ ! -d "$BACKEND_DIR/node_modules/.prisma/client" ] && [ ! -d "$BACKEND_DIR/node_modules/@prisma/client" ]; then
    (cd "$BACKEND_DIR" && npx prisma generate) || fatal "Prisma Client 生成失败"
  fi
  ok "依赖就绪"
}

dist_is_fresh() {
  local dist="$FRONTEND_DIR/dist/index.html"
  [ -f "$dist" ] || return 1
  local newest
  newest=$(find "$FRONTEND_DIR/src" "$FRONTEND_DIR/index.html" "$FRONTEND_DIR/vite.config.ts" \
    "$FRONTEND_DIR/package.json" -type f -newer "$dist" 2>/dev/null | head -1 || true)
  [ -z "$newest" ]
}

start_backend() {
  if http_ok "http://localhost:3000/api/health"; then
    ok "后端已在 3000 运行，跳过"
    save_pid "$BACKEND_PID" 3000
    return 0
  fi
  info "启动后端 3000..."
  : > "$BACKEND_LOG"
  (cd "$BACKEND_DIR" && launch_detached "$BACKEND_LOG" npm run dev)
  if ! wait_for_http "http://localhost:3000/api/health" "后端 API" 60; then
    tail -40 "$BACKEND_LOG"
    fatal "后端启动失败，日志: $BACKEND_LOG"
  fi
  save_pid "$BACKEND_PID" 3000
}

start_frontend_dev() {
  if http_ok "http://localhost:8081/"; then
    ok "开发前端已在 8081 运行，跳过"
    save_pid "$FRONTEND_PID" 8081
    return 0
  fi
  info "启动开发热更新 8081..."
  : > "$FRONTEND_LOG"
  (cd "$FRONTEND_DIR" && launch_detached "$FRONTEND_LOG" npm run dev -- --port 8081 --host)
  if ! wait_for_http "http://localhost:8081/" "前端 8081" 60; then
    tail -40 "$FRONTEND_LOG"
    fatal "前端 8081 启动失败，日志: $FRONTEND_LOG"
  fi
  save_pid "$FRONTEND_PID" 8081
}

build_frontend() {
  local force="${1:-}"
  if [ "$force" != "force" ] && dist_is_fresh; then
    ok "生产包是新的，跳过打包"
    return 0
  fi
  info "打包生产前端（8080 日常访问用）..."
  if ! (cd "$FRONTEND_DIR" && npm run build > "$BUILD_LOG" 2>&1); then
    tail -40 "$BUILD_LOG"
    fatal "前端打包失败，日志: $BUILD_LOG"
  fi
  ok "生产包已更新"
}

start_frontend_preview() {
  if http_ok "http://localhost:8080/"; then
    ok "日常访问 8080 已在运行，跳过"
    save_pid "$PREVIEW_PID" 8080
    return 0
  fi
  info "启动日常访问 8080（生产构建）..."
  : > "$PREVIEW_LOG"
  (cd "$FRONTEND_DIR" && launch_detached "$PREVIEW_LOG" npm run preview -- --port 8080 --host)
  if ! wait_for_http "http://localhost:8080/" "前端 8080" 20; then
    tail -40 "$PREVIEW_LOG"
    fatal "前端 8080 启动失败，日志: $PREVIEW_LOG"
  fi
  save_pid "$PREVIEW_PID" 8080
}

cpolar_running() {
  pgrep cpolar >/dev/null 2>&1
}

parse_cpolar_url() {
  # 优先 https；兼容新旧日志（Tunnel established at / PublicUrl）
  local url
  url=$(grep -oE 'https://[a-z0-9]+(\.[a-z0-9]+)*\.cpolar\.(cn|top|com)' "$CPOLAR_LOG" 2>/dev/null | tail -1 || true)
  if [ -z "$url" ]; then
    url=$(grep -oE 'http://[a-z0-9]+(\.[a-z0-9]+)*\.cpolar\.(cn|top|com)' "$CPOLAR_LOG" 2>/dev/null | tail -1 || true)
  fi
  echo "$url"
}

start_cpolar() {
  if ! command -v cpolar >/dev/null 2>&1; then
    fatal "未安装 cpolar，公网地址出不来。装好后再执行 ./dev.sh"
  fi
  if ! http_ok "http://localhost:8080/"; then
    fatal "公网映射的是 8080，请先保证日常访问已启动"
  fi
  info "启动公网穿透（映射 8080）..."
  stop_cpolar
  : > "$CPOLAR_LOG"
  launch_detached "$CPOLAR_LOG" cpolar http 8080 -log stdout
  local i=0 public_url=""
  while [ $i -lt 45 ]; do
    public_url=$(parse_cpolar_url)
    if [ -n "$public_url" ]; then
      echo "$public_url" > "$PUBLIC_URL_FILE"
      ok "公网隧道已建立: $public_url"
      local pid
      pid=$(pgrep cpolar 2>/dev/null | head -1 || echo "")
      [ -n "$pid" ] && echo "$pid" > "$CPOLAR_PID"
      if wait_for_http "$public_url/" "公网地址" 30; then
        return 0
      fi
      warn "公网地址已建立但暂时连不上，仍写入输出"
      return 0
    fi
    if [ $i -gt 12 ] && ! cpolar_running; then
      tail -30 "$CPOLAR_LOG"
      fatal "cpolar 退出，日志: $CPOLAR_LOG"
    fi
    i=$((i + 1))
    if [ $i -le 5 ] || [ $((i % 10)) -eq 0 ]; then
      log "  → 等待公网隧道... ${i}s / 45s"
    fi
    sleep 1
  done
  tail -50 "$CPOLAR_LOG"
  fatal "公网穿透建立失败，日志: $CPOLAR_LOG"
}

get_lan_ip() {
  local iface ip
  for iface in en0 en1 en2 en3; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
      echo "$ip"
      return 0
    fi
  done
  ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1
}

# 四种访问方式必须都打出来：本机 8080、开发 8081、局域网 8080、公网 8080
print_addresses() {
  local lan_ip public_url
  lan_ip=$(get_lan_ip)
  public_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")

  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${GREEN}  建材报价系统启动完成${NC}"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  echo -e "${BOLD}本机访问（生产构建，秒开流畅，日常用）:${NC}"
  echo -e "   ├─ 登录页: ${CYAN}http://localhost:8080/login${NC}"
  echo -e "   ├─ 首页:   ${CYAN}http://localhost:8080/${NC}"
  echo -e "   └─ 后端:   ${CYAN}http://localhost:3000/api/health${NC}"
  echo ""

  echo -e "${BOLD}开发模式（HMR 热更新，改代码自动刷新，8081）:${NC}"
  echo -e "   ├─ 登录页: ${CYAN}http://localhost:8081/login${NC}"
  echo -e "   └─ 首页:   ${CYAN}http://localhost:8081/${NC}"
  echo ""

  echo -e "${BOLD}局域网访问（同 WiFi 下手机/其他电脑，生产构建）:${NC}"
  if [ -n "$lan_ip" ]; then
    echo -e "   ├─ 登录页: ${CYAN}http://${lan_ip}:8080/login${NC}"
    echo -e "   └─ 首页:   ${CYAN}http://${lan_ip}:8080/${NC}"
  else
    echo -e "   ${YELLOW}(未能自动获取局域网 IP，请手动检查网络设置)${NC}"
  fi
  echo ""

  echo -e "${BOLD}公网访问（外网可访问，生产构建版）:${NC}"
  if [ -n "$public_url" ]; then
    echo -e "   ├─ 登录页: ${CYAN}${public_url}/login${NC}"
    echo -e "   └─ 首页:   ${CYAN}${public_url}/${NC}"
  else
    echo -e "   ${YELLOW}(公网隧道未建立，执行 ./dev.sh tunnel)${NC}"
  fi
  echo ""

  echo -e "${BOLD}服务与日志:${NC}"
  echo -e "   ├─ 后端 (3000): PID $(cat "$BACKEND_PID" 2>/dev/null || echo '?')  →  $BACKEND_LOG"
  echo -e "   ├─ 日常访问 8080: PID $(cat "$PREVIEW_PID" 2>/dev/null || echo '?')  →  $PREVIEW_LOG"
  echo -e "   ├─ 开发热更新 8081: PID $(cat "$FRONTEND_PID" 2>/dev/null || echo '?')  →  $FRONTEND_LOG"
  echo -e "   └─ cpolar: PID $(cat "$CPOLAR_PID" 2>/dev/null || echo '?')  →  $CPOLAR_LOG"
  echo ""
  echo -e "${BOLD}管理命令:${NC}"
  echo -e "   ├─ 改完代码更新 8080/公网（地址不变）: ${YELLOW}./dev.sh reload${NC}"
  echo -e "   ├─ 只重建公网: ${YELLOW}./dev.sh tunnel${NC}"
  echo -e "   ├─ 完全重启（公网地址会变）: ${YELLOW}./dev.sh restart${NC}"
  echo -e "   └─ 停止: ${YELLOW}./dev.sh stop${NC}    状态: ${YELLOW}./dev.sh status${NC}"
  echo ""
}

boot_all() {
  verify_dependencies
  start_backend &
  local bp=$!
  start_frontend_dev &
  local fp=$!
  wait "$bp"
  wait "$fp"
  build_frontend
  start_frontend_preview
  start_cpolar
}

cmd_reload() {
  info "快速重载：重启前后端并刷新 8080 生产包，公网隧道保留、地址不变"
  local keep_tunnel=false
  if cpolar_running; then
    keep_tunnel=true
    log "  → cpolar 运行中，公网地址保持不变"
  else
    warn "  → cpolar 未运行，重载后会新建隧道"
  fi

  stop_app
  verify_dependencies
  start_backend &
  local bp=$!
  start_frontend_dev &
  local fp=$!
  wait "$bp"
  wait "$fp"
  build_frontend force
  start_frontend_preview

  if $keep_tunnel; then
    local existing_url
    existing_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")
    if [ -n "$existing_url" ] && wait_for_http "$existing_url/" "公网地址" 15; then
      ok "公网地址继续有效: $existing_url"
    else
      warn "现有公网地址无效，重建隧道..."
      start_cpolar
    fi
  else
    start_cpolar
  fi
  print_addresses
}

cmd_status() {
  echo ""
  echo -e "${BOLD}服务状态:${NC}"
  echo ""
  local name url code all_ok=true
  for pair in "后端 3000:http://localhost:3000/api/health" "日常访问 8080:http://localhost:8080/" "开发热更新 8081:http://localhost:8081/"; do
    name="${pair%%:*}"
    url="${pair#*:}"
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|301|302|304|401|403)$ ]]; then
      echo -e "  ${GREEN}✓${NC} $name (HTTP $code)"
    else
      echo -e "  ${RED}✗${NC} $name 未响应 (HTTP $code)"
      all_ok=false
    fi
  done
  local public_url
  public_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")
  if [ -n "$public_url" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$public_url/" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|301|302|304)$ ]]; then
      echo -e "  ${GREEN}✓${NC} 公网 $public_url (HTTP $code)"
    else
      echo -e "  ${YELLOW}!${NC} 公网 $public_url (HTTP $code，可能仍在连接中)"
    fi
  else
    echo -e "  ${YELLOW}!${NC} 公网: 无活动隧道"
    all_ok=false
  fi
  echo ""
  if $all_ok; then
    echo -e "${GREEN}核心服务全部正常${NC}"
  else
    echo -e "${YELLOW}部分服务未就绪${NC}"
  fi
  print_addresses
}

usage() {
  cat <<EOF
用法: $0 [命令]

  ./dev.sh           启动全部（默认，同 start）：3000 + 8081 + 8080 + 公网
  ./dev.sh start     同上
  ./dev.sh reload    刷新 8080 生产包，公网地址不变（改完代码用这个）
  ./dev.sh restart   全部停掉再起，公网地址会变
  ./dev.sh tunnel    只重建公网（8080 要已在跑）
  ./dev.sh stop      全部停下
  ./dev.sh status    健康检查 + 全部访问地址

日常访问走 8080；改代码看 8081 热更新；公网映射 8080。
EOF
}

main() {
  local cmd="${1:-start}"
  case "$cmd" in
    start|all|"")
      cmd_stop
      boot_all
      print_addresses
      ;;
    stop)
      cmd_stop
      ;;
    restart)
      cmd_stop
      boot_all
      print_addresses
      ;;
    reload)
      cmd_reload
      ;;
    tunnel)
      start_cpolar
      print_addresses
      ;;
    status)
      cmd_status
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
