// v11.0 图片URL解析工具
//
// 设计依据：config.apiBaseUrl 的两种部署模式
//   1. 本机开发（apiBaseUrl=''）：相对路径 /uploads/... 通过 Vite dev server proxy 转发
//   2. 公网/局域网部署（apiBaseUrl='http://host:port'）：需拼接后端前缀才能访问
//
// 后端存储的图片路径统一为相对路径（/uploads/products/xxx.webp），
// 在 img src 中使用时必须经本函数解析，否则公网访问时图片会加载失败。

import { config } from '../../config';

/**
 * 解析图片URL，确保在任何部署模式下都能正确访问
 *
 * @param url 图片URL（可能是相对路径 /uploads/...、绝对URL、data:、blob:、null/undefined）
 * @returns 可直接用于 <img src> 的URL
 *
 * 规则：
 *   - null/undefined/空字符串 → ''（交由上层处理空态）
 *   - http:// / https:// / data: / blob: → 原样返回（已是绝对URL）
 *   - / 开头的相对路径 → 公网模式下拼接 apiBaseUrl，本机模式下原样返回
 *   - 其他（相对路径无 / 前缀）→ 公网模式下拼接 apiBaseUrl + '/'，原样返回
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';

  // 已有完整协议前缀 → 原样返回
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  // 本机开发模式（apiBaseUrl为空）→ 相对路径直接走 proxy
  if (!config.apiBaseUrl) {
    return url;
  }

  // 公网/局域网部署模式 → 拼接后端地址
  const base = config.apiBaseUrl;
  if (url.startsWith('/')) {
    return `${base}${url}`;
  }
  return `${base}/${url}`;
}

/**
 * 批量解析图片URL数组
 */
export function resolveImageUrls(urls: Array<string | null | undefined>): string[] {
  return urls.map((u) => resolveImageUrl(u)).filter(Boolean);
}
