// 后端地址策略（源自用户档案）：
// - 本机地址（localhost/127.0.0.1 回环）→ 前端 Node 服务代理转发，使用相对路径
// - 公网地址（其他所有地址）→ 前端直接请求，使用完整 URL
// 绝不使用硬编码 IP 段识别规则；前端无论何时都支持局域网访问
// 内网穿透映射前端 8080 端口，不属于项目本身

function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.trim() !== '') {
    // 显式配置了公网后端地址，直接请求
    return envUrl.replace(/\/$/, '');
  }
  // 默认本机后端，走前端代理（相对路径）
  return '';
}

function resolveWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.replace(/\/$/, '');
  }
  // 默认基于 location.host 推导，走前端代理
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export const config = {
  // 空字符串表示走前端代理（本机后端）；非空表示公网后端直连
  apiBaseUrl: resolveApiBaseUrl(),
  // WebSocket 地址，默认基于 location.host 推导
  wsUrl: resolveWsUrl(),
  appName: '订单中心 订单协同工作台',
} as const;
