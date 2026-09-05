# 架构总览（Architecture）

> 本文档面向**接手本项目的工程师 / 其它 AI 助手**，用大白话讲清系统是什么、怎么分层、怎么跑、质量怎么守。
> 详细的「从零启动路径 / 重构蓝图」见 `重构蓝图-主交付.md` 与 `docs/architecture/目标架构设计.md`。

## 一、系统是什么

建材门店**进销存一体化平台**：采购 → 库存 → 销售开单 → 配货履约 → 收付款往来 → 售后，远期目标支撑**千万级 SKU 生产运行**。
业务用户通过表格/表单，用中文业务字段（如 品牌ID、品牌名称）和主外键关系直接编辑数据。

正确性是已经做对的（务必保留）：
- **全域解耦**（无物理外键，靠 ID 引用 + 名称快照，避免级联炸库）
- **单据快照范式**（单据行存业务快照，不随主档变更而变）
- **库存加权均价**、**审计/变更日志**、**按千万行预规划的复合索引**

## 二、技术栈（实测现状）

| 层 | 技术 |
|---|---|
| 前端 | React 19 + antd 6 + TypeScript，Vite 构建，vitest 单测 |
| 前端结构 | monorepo：`apps/{auth,staff,customer}`（应用壳）+ `shared/*`（公共能力） |
| 后端 | Express + TypeScript（ESM，`tsc` 编译到 `dist/`，`tsx` 热重载），`zod` 校验 |
| 数据 | Prisma 5 + **MySQL 8**（UTF8MB4）；`prisma/dev.db` 残留已清理 |
| 契约 | Swagger（`swagger-jsdoc` + `swagger-ui-express`），`/api-docs` 可交互 |
| 基建 | `docker-compose.yml`（MySQL + adminer）、`.github/workflows/verify.yml`、每日备份脚本 |

## 三、目录结构（实际）

```
建材报价系统/
├── backend/                      # 后端 API（Express + TS）
│   ├── src/
│   │   ├── app.ts               # createApp()：组装中间件与路由
│   │   ├── index.ts             # 启动入口（HTTP server + WebSocket 同端口）
│   │   ├── routes/              # 路由层（public / customer / staff）
│   │   ├── controllers/         # 控制器（请求处理）
│   │   ├── services/            # 业务逻辑
│   │   ├── engines/             # 引擎（定价/规则等）
│   │   ├── middleware/          # 鉴权/审计/错误处理
│   │   ├── config/              # 配置 + Prisma 客户端
│   │   ├── utils/               # 工具（含 snowflake.ts 主键生成器）
│   │   ├── docs/                # Swagger 契约中心（swagger.ts / generate.ts）
│   │   └── ws/                  # WebSocket
│   ├── tests/                   # node:test 单测（如 snowflake.test.ts）
│   ├── prisma/                  # schema.prisma + 迁移记录
│   └── openapi.json / openapi.baseline.json  # 契约文件（门禁对拍）
│
├── frontend/                     # 前端（Vite + React）
│   ├── src/
│   │   ├── apps/{auth,staff,customer}/  # 三个应用壳（员工端/客户自助端/登录）
│   │   └── shared/                    # 公共：types/config/stores/utils/styles/components/engines/hooks/services
│   └── tests/                   # vitest 单测
│
├── tools/                        # 工程门禁脚本（verify / check-* / scan-signals / gen-*）
├── docker-compose.yml            # 生产基建（MySQL + adminer）
├── .github/workflows/verify.yml  # CI：PR/push 跑质量门禁
└── scripts/backup-db.sh          # 每日 MySQL 备份
```

## 四、分层目标（当前 vs 蓝图）

现状是「路由→控制器→服务」的朴素分层；重构蓝图（`docs/architecture/目标架构设计.md`）要求后端升级为
**DDD 四层**（interface / application / domain / infrastructure，依赖倒置，domain 零框架依赖），
前端补 `@platform/*` 与 `features/*`。**迁移是增量、不中断线上**，详见重构蓝图 P0–P6。

## 五、物理数据模型要点（供接手者留意）

- 主键策略：正从 `autoincrement BigInt` / `P+时间戳+随机` 业务编码，迁移到 **Snowflake 64 位聚簇主键**（见 `backend/src/utils/snowflake.ts`）。
- **无物理外键**：表间靠逻辑 ID 引用 + 名称快照，迁移后务必跑「孤儿行扫描」校验。
- 分区/分片、读写分离、多租户、独立搜索引擎、异步队列：当前**尚未落地**，是 P3–P6 的重点（详见蓝图）。

## 六、质量门禁（改动前必跑）

根目录执行：`npm run verify:static -- --full`（全量静态门禁，含前后端）。

| 门禁 | 名称 | 守什么 |
|---|---|---|
| S0 | meta-consistency | yml/生成物对拍 |
| S0b | arch-lint | 架构违规 / 目录越界 |
| S1 | fe-typecheck | 前端类型（**曾红，已修绿**） |
| S2 | fe-lint | 前端风格 |
| S3 | fe-dupe | 重复文件 |
| S3b | fe-test | 前端单测（vitest） |
| S3c | cell-layer | 单元格层一致性 |
| S4 | be-test | 后端单测（node:test） |
| S5 | be-lint | 后端类型 |
| S7 | sqlite-residual | 禁止 SQLite 残留 |
| S9 | signal-gate | 信号雷达（业务页 custom 逃逸 ≤ 白名单） |
| S11 | contract-gate | 接口契约基线 diff（breaking 删除即阻断） |

> 门禁铁律：**真实、可机判、非 0 即失败、禁止 AI 自评通过**。`verify-report.json` 是客观证据。

## 七、怎么跑

```bash
./dev.sh                       # 一键启动：后端 3000 + 前端预览 8080 + cpolar 公网
docker compose up -d mysql     # 或走容器化 MySQL（不强制）
npm run verify:static -- --full  # 提交前跑门禁
cd backend && npm run gen:openapi  # 改了接口注解后刷新契约
./scripts/backup-db.sh         # 每日备份（建议 cron 03:00）
```

## 八、重构路线图指针

- `重构蓝图-主交付.md`：决策版（差距 / 目标 / P0–P6 / 安全网 / 待拍板）
- `docs/architecture/目标架构设计.md`：架构师详版（含 Mermaid 分层图、ER 图、目录树）
- `重构期质量安全网方案-Edward.md`：QA 详版（4 大安全支柱 + 10 道门禁）
- `P0重构安全网执行记录.md`：本次 P0 已落地项与验收
- `从零启动路径与偏差对标分析.md`：现状偏差对标
