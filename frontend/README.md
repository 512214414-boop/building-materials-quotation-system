# 建材报价系统 - 前端

> 依据《建材报价系统开发文档》v2.0 九视图架构

## 架构概述

前端采用两端代码级隔离架构：

- **客户端**（`apps/customer`）：独立页面程序，仅有准入页 + 采购清单唯一页面，不包含员工端九视图渲染逻辑
- **员工端**（`apps/staff`，含管理端）：合并路由，报价工作台九视图二级导航 + 基础数据 + 系统管理

## 九视图清单

| 序号 | 视图名称 | 数据来源 | 核心逻辑 |
|------|----------|----------|----------|
| 1 | 需求确认 | document_lines | 物料需求核对，敲定基础物料清单 |
| 2 | 报价核算 | quote_lines | 核算对外销售单价、优惠、整单总价 |
| 3 | 收款对账 | payment_records | 登记定金尾款赊账、对账核销、开票 |
| 4 | 仓库配货 | warehouse_lines | 自有仓库出库登记，实时计算缺口 |
| 5 | 采购调货 | purchase_lines | 缺口商品分配外部供应商调拨 |
| 6 | 交付履约 | delivery_records | 交付方式、物流单据、签收确认 |
| 7 | 成本核定 | cost_lines | 后置至交付后，修正各渠道实际成本 |
| 8 | 退换售后 | refund_lines | 继承原单数据，防超退，自动计算金额 |
| 9 | 销售汇总 | 全链路归集 | 归集全链路数据，扣减退换货影响 |

## 技术栈

- React 18 + TypeScript 5
- Vite 5（构建工具）
- Zustand 4（状态管理）
- Ant Design 5（UI组件库）
- React Router 6（路由管理）
- Tailwind CSS 3 + CSS Variables（设计系统tokens）
- WebSocket ws（实时同步）

## 开发命令

```bash
npm install      # 安装依赖
npm run dev      # 开发服务器
npm run build    # 生产构建
npm run preview  # 预览构建产物
```
