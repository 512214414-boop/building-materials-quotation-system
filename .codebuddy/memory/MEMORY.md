# 长期记忆（MEMORY.md）

## 用户与协作
- 非技术业务架构师，完全依赖 AI 开发；手机远程下发需求，口语化架构判断（"架构级问题""向上抽象不够"）需取证核实，不当外行话略过。
- **长期架构方向 > 短期低成本**：反对"最小可行"优先；低成本提议先说明长期代价。
- **推荐项必须长期最优，禁止把"成本最低/零风险"包装成"推荐"推给用户**（曾把"前端聚合零风险"当推荐被批；SKU 量级按生产级几百万~上千万设计）。
- **框架要通用、按形状参数（层级/规模/数据源）配置驱动，禁止为单实体开特例"后门"**（把某实体当"唯一例外"写专用槽=后门；正确=通用 displayLevel+childLevel，任何实体声明即生效、框架零改动）。
- **数据量级按生产级设计**：聚合/展开必须走后端索引（GROUP BY + 复用现有 FULLTEXT 召回），禁止前端全量聚合。
- **掌控台 = 开发驱动台**（下一步管道/待拍板/已拍板待开发），非状态播报板。
- **"做完了吗"只认客观信号**（typecheck/build/测试退出码/Playwright），绝不问 AI。已装 playwright，e2e_browser/ 可跑截图冒烟。

## 项目架构
- 单仓：frontend/(React+antd+Vite)+backend/(ts/js)+MySQL。
- 平台内核 frontend/src/shared/**（ArchiveListPage/UnifiedTable/PickerEditGate/editorRegistry/ArchiveSlotHost）；业务页 apps/*/pages/* 复用。
- 真相源 1：data-source/entity-meta.yml → tools/gen-entity-meta.mjs → 生成物。*.generated.* 禁手改，差异走 *.override.ts。Meta Studio(8898) 直读直写该 yml 整文件覆盖→保持单文件不分片。
- 真相源 2：文档可视化/data-source/methodology/(_meta+_assets+items/<navId>.yml+_index.yml) → node tools/gen-docs.mjs 生成文档站/侧栏/技能索引/AGENTS.md。加一篇=两步(建 items 文件→_index.yml groups 加一行)，禁手写 05-nav-groups.js。
- 本地服务：后端 3000 / 生产前端 8080 / 开发前端 8081(./dev.sh)；文档站 8123；掌控台 8124。冒烟 admin/Admin@123。路由真相源 menu.config.ts → tools/gen-routes.mjs 派生 e2e_browser/routes.generated.json(冒烟禁硬编码 URL)。

## 门禁（交付判定 = 退出码）
- npm run verify(完整，需 3000/8080) / npm run verify:static(静态，服务不在时不得标已交付)。阶段 S0 yml↔generated→S1 fe-typecheck→S2 fe-lint→S3 fe-dupe→S3b fe-test(Vitest)→S4 be-test(node:test)→S5 be-lint→S6 e2e-smoke。跑完全部再汇总，不 fail-fast。报告 verify-report.json。
- 门禁提速(2026-09-05)：spawn 并发+Promise.all；跨会话去重(.verify.lock+指纹复用)；变更感知子集(--full 关)。**去重铁律（2026-09-05 假绿修复后）**：复用只认「报告 ranIds 已跑集合 ⊇ 本次所需 needIds」+ 全绿 + 指纹一致；scope 字段不再作复用判据（曾因 --skip-smoke 跑完把 scope 标 full 被全量 verify 复用、静默跳过 S6——根因是按"本次自己的 STAGES"算 scope）。负向/正向均已实测：静态缓存 → full 拒绝复用并真跑含 S6 10/10；同状态 full → 二次复用 0ms。
- ⚠️ 类型检查禁增量(tsBuildInfoFile 致结果不可复现)，typecheck 用 tsc -p、incremental:false，任何门禁不得依赖增量缓存。
- ⚠️ 锁/单测必须做负向验证（注入破坏证 exit 1）：曾假绿 verify_pages_8080.js(15 过期 URL 永 0)、增量缓存。单测故意改坏源码证转红。
- ⚠️ 严禁盲目 write_to_file 覆盖既有 tools/ 脚本（曾误覆盖 verify.mjs）。

## 已定设计决策（勿再抛给用户选）
- 元模型两条边界：①配置边界按「声明 vs 行为」切→所有实体含单据都要登记(字段/列/校验/权限/审计/统计口径)，单据只「写操作」走代码；②引擎边界按「单表 vs 事务」切→档案零代码 CRUD，单据只登记读与列表。不得放宽。
- 元数据驱动≠低代码：可配置化的是「结构」，行为(事务/状态机/跨表对账/金额)走代码。
- 第三道锁=生成器对拍(gen-entity-meta.mjs --check 重生成逐字节比对)，禁快照断言代替。
- 类型债已结案：strict:true 零错误。
- 逃逸口=显式登记(@escape:原因+到期)，禁隐式绕过。
- 过度抽象红线：标准 3NF 已满足业务目标时不额外造宽表/字典("能跑"≠"该抽象")。
- v23 产品名升全局字典+分类改关系表：用户反思作废(标准 3NF 已满足)，外科手术式回退(保留复合体框架)；最终裁决 A 落地 schema @@unique([name]) 全局唯一+迁移 20260905120000 已 deploy，完整 verify 10/10。机器守卫 B(同实体双定义拦截)+C(arch-lint 禁派生宽表)已落地。论证见 docs-coverage.md v23 段与《根因分析与预防措施.md》。
- 架构蓝图 v3=双向架构(自上而下推导链+ L1–L5 层栈/红线/DoD)。
- 三类失败模式(入 know-loop)：①形状≠身份(写"实体专用/例外/开洞"前跑参数化测试)②规模预算进抽象(取数聚合先问前端行数上限几百)③推荐先资格过滤(选项先用用户长期原则+量级预算过滤，被否决不入候选不标推荐)。
- 文档之家(裁决 A)：人读文档在 文档可视化/(方法论 data-source/methodology/** + 系统决策设计 项目文档/**)；仓库根只留工具加载层(AGENTS/docs-coverage/开发规划/掌控台等生成物)。
- 框架归属两判据(know-table)：①"有没有树"=实体自身有可逐层增删改的层级数据 ②"主操作"=改档案字段还是执行动作。roles 不归档案框架；users 走 cellSpecs 与 ArchiveSlotHost 两套框架不可互证。

## 记账与死内容纪律
- 掌控台是 docs-coverage.md 解析产物，台账失真=掌控台失真；核实待办回台账行+代码取证。
- 吸收完划删除线(~~x~~ ✅ 已吸收已删)；历史只加删除线不物理删。
- 状态四档：✅已完成/🕐已安排未做完/⏳长期目标态(方向定、不阻塞、写启动触发条件)/❌还没做。⏳不进管道不占分母。
- 死内容判定="有没有代码引用"非"导航能不能点到"；actionMeta 非死数据(resolveGuard.ts:30 消费)。

## 既有收口成果（勿重复劳动）
- 确认层全站唯一 PickerEditGate；cellSpec 三件套零外部消费方但删除已获用户取消。
- 只读展示页配置驱动收口(staff 端 11 表)；workbench 四视图 custom 列全归零(editorRegistry + compositeColumns.tsx)。
- Meta Studio 新增实体向导已交付(POST /api/entity，confirm:true 落盘，禁 yaml.dump)。
- 单元格层收敛：fieldDefs 段→fieldDefs.generated.ts；resolveFieldDef 唯一推导；唯一出口 cells/FieldCell.tsx；守卫 check-cell-layer.mjs(S3c)。全量收敛按爆炸半径分期，cellSpec 删除用户已取消。

## Git 工作流
- 按逻辑隔离提交(chore/feat/docs 分开)，禁大杂烩；推送时机由用户定，未获指示不 push(origin=GitHub)。
- 本机 git 身份 Gitee(user.name=熊庆历力)，未要求不改。CLI 闸门：git push/DB 结构升级=ask；reset --hard/强推=deny。
- 数据库变更(Prisma 迁移/SQL)须经用户确认才执行，禁擅自 migrate deploy 或改数据。
