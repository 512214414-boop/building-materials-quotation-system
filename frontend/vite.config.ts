import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端服务分两层：
// - dev 模式（8080）：本机/局域网访问，HMR 热更新，/api /ws /uploads 代理到后端 3000
// - preview 模式（8081）：公网访问，生产构建，加载快（避免 dev 模式 ESM 逐模块加载在公网高延迟下白屏）
// allowedHosts: true 允许内网穿透（如 cpolar）域名访问
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8081,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
})
