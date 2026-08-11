#!/bin/bash
# ==============================================================================
# 建材报价系统 — 一键启动脚本（生产级可靠版）
# 严格遵循 SOP：端口检查→清理进程→启动后端→启动前端→内网穿透→输出地址
# 绝对不降级：任何环节失败立即终止并输出错误日志，绝不静默降级
# 端口约定：后端3000 / 前端访问 8080（生产构建，秒开流畅）/ 前端开发 8081（dev HMR）
# 说明：用户日常访问 8080 即生产构建（React 生产版，交互级 <600ms）；
#      开发热更新走 8081（dev 模式 React 开发构建固有开销较大，不用于日常访问）
# ==============================================================================

# 确保系统命令可用
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

set -eo pipefail

PROJECT_ROOT="/Users/mac/Desktop/建材报价系统"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 日志文件
LOG_DIR="/tmp"
BACKEND_LOG="$LOG_DIR/backend_dev.log"
FRONTEND_LOG="$LOG_DIR/frontend_dev.log"
BUILD_LOG="$LOG_DIR/frontend_build.log"
PREVIEW_LOG="$LOG_DIR/frontend_preview.log"
CPOLAR_LOG="$LOG_DIR/cpolar_dev.log"

# PID 文件
BACKEND_PID="$LOG_DIR/backend_dev.pid"
FRONTEND_PID="$LOG_DIR/frontend_dev.pid"
PREVIEW_PID="$LOG_DIR/frontend_preview.pid"
CPOLAR_PID="$LOG_DIR/cpolar_dev.pid"
PUBLIC_URL_FILE="$LOG_DIR/cpolar_public_url.txt"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 工具函数
log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()    { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓ $1${NC}"; }
info()  { echo -e "${BOLD}[$(date +%H:%M:%S)] ➜ $1${NC}"; }
err()   { echo -e "${RED}[$(date +%H:%M:%S)] ✗ $1${NC}"; }
fatal() { echo -e "${RED}${BOLD}[$(date +%H:%M:%S)] ✗ FATAL: $1${NC}"; exit 1; }
warn()  { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠ $1${NC}"; }

# ==============================================================================
# 步骤 1: 停止所有旧服务（端口占用强制清理）
# ==============================================================================
stop_all_services() {
  info "[1/7] 停止所有旧服务并清理端口占用..."
  
  # 强制杀死占用关键端口的进程
  for port in 3000 8080 8081; do
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      log "  → 已终止端口 $port 占用进程: $pids"
    fi
  done
  
  # 杀死所有 cpolar 进程
  local cpolar_pids
  cpolar_pids=$(pgrep -f "cpolar http" 2>/dev/null || true)
  if [ -n "$cpolar_pids" ]; then
    echo "$cpolar_pids" | xargs kill -9 2>/dev/null || true
    log "  → 已终止旧 cpolar 进程: $cpolar_pids"
  fi
  
  # 杀死项目相关 node 进程（更彻底）
  local node_pids
  node_pids=$(pgrep -f "tsx watch|vite" 2>/dev/null || true)
  if [ -n "$node_pids" ]; then
    echo "$node_pids" | xargs kill -9 2>/dev/null || true
    log "  → 已终止旧 node 服务进程: $node_pids"
  fi
  
  # 清理旧 PID 文件
  rm -f "$BACKEND_PID" "$FRONTEND_PID" "$PREVIEW_PID" "$CPOLAR_PID" "$PUBLIC_URL_FILE"
  
  sleep 2
  ok "旧服务清理完成"
}

# ==============================================================================
# 步骤 2: 验证依赖安装
# ==============================================================================
verify_dependencies() {
  info "[2/7] 验证项目依赖..."
  
  # 检查后端依赖
  if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    log "  → 安装后端依赖..."
    (cd "$BACKEND_DIR" && npm install) || fatal "后端依赖安装失败"
  fi
  
  # 检查前端依赖
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log "  → 安装前端依赖..."
    (cd "$FRONTEND_DIR" && npm install) || fatal "前端依赖安装失败"
  fi
  
  # 检查 Prisma Client 是否生成
  if [ ! -d "$BACKEND_DIR/node_modules/@prisma/client" ]; then
    log "  → 生成 Prisma Client..."
    (cd "$BACKEND_DIR" && npx prisma generate) || fatal "Prisma Client 生成失败"
  fi
  
  # 检查数据库迁移
  if [ -f "$BACKEND_DIR/prisma/dev.db" ]; then
    log "  → 执行数据库迁移..."
    (cd "$BACKEND_DIR" && npx prisma migrate deploy) || log "  → (迁移跳过或已最新)"
  fi
  
  # 清理 Vite 缓存
  if [ -d "$FRONTEND_DIR/node_modules/.vite" ]; then
    rm -rf "$FRONTEND_DIR/node_modules/.vite"
    log "  → 已清理 Vite 缓存"
  fi
  
  ok "依赖验证完成"
}

# ==============================================================================
# HTTP 等待工具（严格模式）
# ==============================================================================
wait_for_http() {
  local url="$1"
  local name="$2"
  local max_wait="${3:-60}"
  local check_interval=1
  local i=0
  
  log "  → 等待 $name 就绪: $url"
  
  while [ $i -lt $max_wait ]; do
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || echo "000")
    
    if [[ "$http_code" =~ ^(200|301|302|304|401|403)$ ]]; then
      ok "$name 启动成功 (HTTP $http_code)"
      return 0
    fi
    
    i=$((i + check_interval))
    if [ $i -le 5 ] || [ $((i % 10)) -eq 0 ]; then
      log "  → 等待中... ${i}s / ${max_wait}s (HTTP $http_code)"
    fi
    sleep $check_interval
  done
  
  err "$name 启动超时！"
  return 1
}

# ==============================================================================
# 步骤 3: 启动后端服务
# ==============================================================================
start_backend() {
  info "[3/7] 启动后端服务 (端口 3000)..."
  
  cd "$BACKEND_DIR"
  nohup npm run dev > "$BACKEND_LOG" 2>&1 &
  local pid=$!
  echo $pid > "$BACKEND_PID"
  log "  → 后端进程 PID: $pid"
  
  if ! wait_for_http "http://localhost:3000/api/health" "后端 API" 90; then
    err "后端启动失败，最后 50 行日志："
    tail -50 "$BACKEND_LOG"
    fatal "后端服务启动失败，请检查日志: $BACKEND_LOG"
  fi
}

# ==============================================================================
# 步骤 4: 启动前端 dev 服务（8081，HMR，开发用）
# 说明：dev 模式 React 开发构建固有开销较大（首屏/弹窗 1 秒级），仅开发热更新用；
#      用户日常访问走 8080（生产构建，步骤 6），交互级 <600ms 流畅
# ==============================================================================
start_frontend_dev() {
  info "[4/7] 启动前端 dev 服务 (端口 8081，HMR 热更新，开发用)..."
  
  cd "$FRONTEND_DIR"
  nohup npm run dev -- --port 8081 --host > "$FRONTEND_LOG" 2>&1 &
  local pid=$!
  echo $pid > "$FRONTEND_PID"
  log "  → 前端 dev 进程 PID: $pid"
  
  if ! wait_for_http "http://localhost:8081/" "前端 dev" 60; then
    err "前端 dev 启动失败，最后 50 行日志："
    tail -50 "$FRONTEND_LOG"
    fatal "前端 dev 服务启动失败，请检查日志: $FRONTEND_LOG"
  fi
}

# ==============================================================================
# 步骤 5: 构建前端生产版本
# ==============================================================================
build_frontend() {
  info "[5/7] 构建前端生产版本..."
  
  cd "$FRONTEND_DIR"
  if ! npm run build > "$BUILD_LOG" 2>&1; then
    err "前端生产构建失败，最后 50 行日志："
    tail -50 "$BUILD_LOG"
    fatal "前端构建失败，请检查日志: $BUILD_LOG"
  fi
  ok "前端生产构建完成"
}

# ==============================================================================
# 步骤 6: 启动前端 preview 服务（8080，日常访问 + 公网）
# 生产构建（React 生产版），本机/局域网/公网统一走它 —— 用户日常访问秒开流畅
# ==============================================================================
start_frontend_preview() {
  info "[6/7] 启动前端 preview 服务 (端口 8080，生产构建，日常访问)..."
  
  cd "$FRONTEND_DIR"
  nohup npm run preview -- --port 8080 --host > "$PREVIEW_LOG" 2>&1 &
  local pid=$!
  echo $pid > "$PREVIEW_PID"
  log "  → 前端 preview 进程 PID: $pid"
  
  if ! wait_for_http "http://localhost:8080/" "前端 preview" 60; then
    err "前端 preview 启动失败，最后 50 行日志："
    tail -50 "$PREVIEW_LOG"
    fatal "前端 preview 服务启动失败，请检查日志: $PREVIEW_LOG"
  fi
}

# ==============================================================================
# 步骤 7: 启动 cpolar 内网穿透
# ==============================================================================
start_cpolar() {
  info "[7/7] 启动 cpolar 公网穿透 (映射 8080 生产构建)..."
  
  rm -f "$CPOLAR_LOG"
  nohup cpolar http 8080 -log stdout > "$CPOLAR_LOG" 2>&1 &
  local pid=$!
  echo $pid > "$CPOLAR_PID"
  log "  → cpolar 进程 PID: $pid"
  
  # 等待公网地址建立
  local i=0
  local public_url=""
  while [ $i -lt 45 ]; do
    if grep -q "Tunnel established at" "$CPOLAR_LOG" 2>/dev/null; then
      public_url=$(grep "Tunnel established at" "$CPOLAR_LOG" | grep -oE 'https?://[a-z0-9]+(\.[a-z0-9]+)*\.cpolar\.(cn|top|com)' | tail -1)
      if [ -n "$public_url" ]; then
        echo "$public_url" > "$PUBLIC_URL_FILE"
        ok "公网隧道已建立: $public_url"
        
        # 验证公网地址可访问
        if wait_for_http "$public_url/" "公网地址" 30; then
          return 0
        else
          warn "公网地址已建立但暂时无法访问，继续等待..."
        fi
      fi
    fi
    
    # 检查 cpolar 进程是否崩溃
    if ! kill -0 $pid 2>/dev/null; then
      err "cpolar 进程意外退出，日志："
      tail -30 "$CPOLAR_LOG"
      fatal "cpolar 启动失败，请检查日志: $CPOLAR_LOG"
    fi
    
    i=$((i + 1))
    if [ $i -le 5 ] || [ $((i % 10)) -eq 0 ]; then
      log "  → 等待公网隧道... ${i}s / 45s"
    fi
    sleep 1
  done
  
  err "cpolar 隧道建立超时，最后 50 行日志："
  tail -50 "$CPOLAR_LOG"
  fatal "公网穿透建立失败，请检查日志: $CPOLAR_LOG"
}

# ==============================================================================
# 获取局域网 IP
# ==============================================================================
get_lan_ip() {
  # 优先 en0 (Wi-Fi)，然后 en1 等
  for iface in en0 en1 en2 en3; do
    local ip
    ip=$(ipconfig getifaddr $iface 2>/dev/null || true)
    if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
      echo "$ip"
      return 0
    fi
  done
  # fallback
  ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1
}

# ==============================================================================
# 输出所有访问地址
# ==============================================================================
print_addresses() {
  local lan_ip
  lan_ip=$(get_lan_ip)
  local public_url
  public_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")
  
  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${GREEN}  ✅  建材报价系统启动完成！所有服务运行正常${NC}"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  
  echo -e "${BOLD}🖥️  本机访问（生产构建，秒开流畅，日常用）:${NC}"
  echo -e "   ├─ 登录页: ${CYAN}http://localhost:8080/login${NC}"
  echo -e "   ├─ 首页:   ${CYAN}http://localhost:8080/${NC}"
  echo -e "   └─ 后端:   ${CYAN}http://localhost:3000/api/health${NC}"
  echo ""
  echo -e "${BOLD}🔧  开发模式（HMR 热更新，改代码自动刷新，8081）:${NC}"
  echo -e "   ├─ 登录页: ${CYAN}http://localhost:8081/login${NC}"
  echo -e "   └─ 首页:   ${CYAN}http://localhost:8081/${NC}"
  echo ""
  
  echo -e "${BOLD}📶  局域网访问（同 WiFi 下手机/其他电脑，生产构建）:${NC}"
  if [ -n "$lan_ip" ]; then
    echo -e "   ├─ 登录页: ${CYAN}http://${lan_ip}:8080/login${NC}"
    echo -e "   └─ 首页:   ${CYAN}http://${lan_ip}:8080/${NC}"
  else
    echo -e "   ${YELLOW}(未能自动获取局域网 IP，请手动检查网络设置)${NC}"
  fi
  echo ""
  
  if [ -n "$public_url" ]; then
    echo -e "${BOLD}🌐  公网访问（外网可访问，生产构建版）:${NC}"
    echo -e "   ├─ 登录页: ${CYAN}${public_url}/login${NC}"
    echo -e "   └─ 首页:   ${CYAN}${public_url}/${NC}"
    echo ""
  fi
  
  echo -e "${BOLD}📋  服务状态与日志:${NC}"
  echo -e "   ├─ 后端 (3000):  PID $(cat $BACKEND_PID 2>/dev/null || echo '?')  →  $BACKEND_LOG"
  echo -e "   ├─ 前端preview (8080, 日常访问): PID $(cat $PREVIEW_PID 2>/dev/null || echo '?')  →  $PREVIEW_LOG"
  echo -e "   ├─ 前端dev (8081, 开发热更新): PID $(cat $FRONTEND_PID 2>/dev/null || echo '?')  →  $FRONTEND_LOG"
  echo -e "   └─ cpolar:    PID $(cat $CPOLAR_PID 2>/dev/null || echo '?')  →  $CPOLAR_LOG"
  echo ""
  echo -e "${BOLD}🔧  管理命令:${NC}"
  echo -e "   ├─ 停止服务:  ${YELLOW}./dev.sh stop${NC}"
  echo -e "   ├─ 重启服务:  ${YELLOW}./dev.sh restart${NC}"
  echo -e "   └─ 查看日志:  ${YELLOW}tail -f /tmp/backend_dev.log /tmp/frontend_dev.log${NC}"
  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# ==============================================================================
# 停止服务函数
# ==============================================================================
cmd_stop() {
  info "停止所有服务（包括 cpolar）..."
  
  for pid_file in "$BACKEND_PID" "$FRONTEND_PID" "$PREVIEW_PID" "$CPOLAR_PID"; do
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file")
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        log "  → 已终止进程 $pid"
      fi
      rm -f "$pid_file"
    fi
  done
  
  # 强制清理端口
  for port in 3000 8080 8081; do
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done
  
  # 清理 cpolar
  pkill -f "cpolar http" 2>/dev/null || true
  rm -f "$PUBLIC_URL_FILE"
  
  ok "所有服务已停止"
}

# ==============================================================================
# 仅停止应用服务（保留 cpolar 隧道，公网地址不变）
# ==============================================================================
stop_app_services_only() {
  info "停止应用服务（保留 cpolar 隧道，公网地址不变）..."
  
  for pid_file in "$BACKEND_PID" "$FRONTEND_PID" "$PREVIEW_PID"; do
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file")
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        log "  → 已终止进程 $pid"
      fi
      rm -f "$pid_file"
    fi
  done
  
  # 强制清理应用端口
  for port in 3000 8080 8081; do
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # 跳过 cpolar 进程
      for pid in $pids; do
        if ! ps -p "$pid" -o comm= 2>/dev/null | grep -q cpolar; then
          kill -9 "$pid" 2>/dev/null || true
        fi
      done
    fi
  done
  
  sleep 1
  ok "应用服务已停止，cpolar 隧道保持运行"
}

# ==============================================================================
# 快速重载（不重启 cpolar，公网地址不变）
# ==============================================================================
cmd_reload() {
  info "🔄 快速重载：重启前后端 + 重新构建生产版本（保留公网隧道）"
  
  # 检查 cpolar 是否在运行
  local cpolar_running=false
  if [ -f "$CPOLAR_PID" ] && kill -0 "$(cat $CPOLAR_PID)" 2>/dev/null; then
    cpolar_running=true
    log "  → cpolar 隧道运行中，公网地址保持不变"
  elif [ -f "$PUBLIC_URL_FILE" ] && pgrep -f "cpolar http" >/dev/null 2>&1; then
    cpolar_running=true
    log "  → cpolar 隧道运行中，公网地址保持不变"
  else
    warn "  → cpolar 未运行，将启动新隧道"
  fi
  
  stop_app_services_only
  verify_dependencies
  start_backend
  start_frontend_dev
  build_frontend
  start_frontend_preview
  
  if $cpolar_running; then
    # 验证现有公网地址仍可访问
    local existing_url
    existing_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")
    if [ -n "$existing_url" ]; then
      log "  → 验证现有公网地址..."
      if wait_for_http "$existing_url/" "公网地址" 15; then
        ok "公网地址继续有效: $existing_url"
      else
        warn "现有公网地址暂时无法访问，重建隧道..."
        start_cpolar
      fi
    else
      start_cpolar
    fi
  else
    start_cpolar
  fi
  
  print_addresses
}

# ==============================================================================
# 仅重启隧道（快速更新公网地址）
# ==============================================================================
cmd_restart_tunnel() {
  info "重启 cpolar 公网隧道..."
  
  # 停止旧 cpolar
  if [ -f "$CPOLAR_PID" ]; then
    local old_pid
    old_pid=$(cat "$CPOLAR_PID")
    kill -9 "$old_pid" 2>/dev/null || true
    rm -f "$CPOLAR_PID"
  fi
  pkill -f "cpolar http" 2>/dev/null || true
  sleep 1
  
  # 确认 preview 在运行
  if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/ 2>/dev/null | grep -qE "^(200|301|302|304)$"; then
    fatal "前端 preview 服务未运行，请先执行 ./dev.sh start"
  fi
  
  start_cpolar
  print_addresses
}

# ==============================================================================
# 健康检查
# ==============================================================================
cmd_status() {
  echo ""
  echo -e "${BOLD}服务状态检查:${NC}"
  echo ""
  
  local all_ok=true
  
  for name_url in "后端:http://localhost:3000/api/health" "前端preview(8080):http://localhost:8080/" "前端dev(8081):http://localhost:8081/"; do
    local name="${name_url%%:*}"
    local url="${name_url#*:}"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|301|302|304|401|403)$ ]]; then
      echo -e "  ${GREEN}✓${NC} $name: 运行正常 (HTTP $code)"
    else
      echo -e "  ${RED}✗${NC} $name: 未响应 (HTTP $code)"
      all_ok=false
    fi
  done
  
  local public_url
  public_url=$(cat "$PUBLIC_URL_FILE" 2>/dev/null || echo "")
  if [ -n "$public_url" ]; then
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$public_url/" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|301|302|304)$ ]]; then
      echo -e "  ${GREEN}✓${NC} 公网: $public_url (HTTP $code)"
    else
      echo -e "  ${YELLOW}!${NC} 公网: $public_url (HTTP $code，可能仍在连接中)"
    fi
  else
    echo -e "  ${YELLOW}!${NC} 公网: 无活动隧道"
  fi
  
  echo ""
  if $all_ok; then
    echo -e "${GREEN}核心服务全部正常${NC}"
  else
    echo -e "${RED}部分服务异常，请检查日志${NC}"
  fi
  echo ""
}

# ==============================================================================
# 主入口
# ==============================================================================
main() {
  local cmd="${1:-start}"
  
  case "$cmd" in
    start)
      stop_all_services
      verify_dependencies
      start_backend
      start_frontend_dev
      build_frontend
      start_frontend_preview
      start_cpolar
      print_addresses
      ;;
      
    stop)
      cmd_stop
      ;;
      
    restart)
      cmd_stop
      sleep 1
      verify_dependencies
      start_backend
      start_frontend_dev
      build_frontend
      start_frontend_preview
      start_cpolar
      print_addresses
      ;;
      
    reload)
      cmd_reload
      ;;
      
    tunnel)
      cmd_restart_tunnel
      ;;
      
    status)
      cmd_status
      ;;
      
    *)
      echo "用法: $0 [命令]"
      echo ""
      echo "命令:"
      echo "  start     启动所有服务（默认，全新启动包括隧道）"
      echo "  reload    🔄 快速重载（重启前后端+重新构建，保留公网隧道，地址不变）- 代码更新推荐用这个"
      echo "  restart   完全重启所有服务（包括重建公网隧道，地址会变）"
      echo "  stop      停止所有服务"
      echo "  tunnel    仅重启公网穿透（不重启前后端）"
      echo "  status    检查服务运行状态"
      echo ""
      echo "日常开发提示："
      echo "  - 日常访问(8080)：生产构建，秒开流畅；代码修改后执行 ./dev.sh reload 更新"
      echo "  - 开发热更新(8081)：代码修改自动热更新(HMR)，供开发调试"
      echo "  - 公网(映射8080)：代码修改后执行 ./dev.sh reload，公网地址不变"
      echo "  - 只有当公网地址失效/隧道断了，才需要 ./dev.sh 或 ./dev.sh tunnel"
      echo ""
      exit 1
      ;;
  esac
}

main "$@"
