# 元模型填写口径（meta-schema）

> **用途**：一份口径，三处共用——
> ① Meta Studio 可视化配置界面的字段定义与可选项来源
> ② 文档（架构原则两篇 + 集合体架子各维度）的表述依据
> ③ 生成器 `tools/gen-entity-meta.mjs` 的解析依据
>
> 真相源仍是 `entity-meta.yml`；本文件只是**填写说明**，不是第二份数据。
> 改了口径要同步本文件与 `tools/gen-entity-meta.mjs`。

## 一、文件结构

```yml
version: 3

entities:        # 实体 × 字段（九视角：A身份 B语义 C来源 D关系 E呈现 F行为 G检索 H历史 I权限）
  <实体>:
    label / table / layer / primaryKey / behavior / fields / columns / relations
resources:       # 【新增】实体 → 后端通用接口声明（驱动资源引擎）
pages:           # 【新增】实体 → 前端页面装配声明（驱动页面装配器）
actions:         # 动作 → 操作守卫（8 类判定）
auditActions:    # 审计 action 目录
indicators:      # 统计口径
```

**新增一个表功能的最小填空**：`entities.<实体>`（字段与列）+ `resources.<实体>`（接口）+ `pages.<实体>`（页面）三段。三段填完，前后端自动产出，**零代码侵入**。

## 二、entities 段（九视角）

| 视角 | 回答什么 | 关键维度 | 必填 |
|---|---|---|---|
| A 身份 | 我是谁、挂哪层 | `layer`（globalDict/subject/mount/row/snapshot/annotation/derived）、`primaryKey`、`unique`（global/parent） | ★ |
| B 语义 | 什么含义、能空吗 | `label`、`required`、`defaults`（空值补全） | ★ |
| C 来源 | 值从哪来 | `valueFrom`（own/dict/dictVia/relation/config/derived）、`dictKind`、`dictUnique` | ★ |
| D 关系 | 跟谁有关 | `relations` 七维：关系表 / 方向 / 基数 / 外键字段 / **删除行为** / 关系携带字段 / 可否并档 | ○ |
| E 呈现 | 长什么样、第几列 | `columns`（order/renderMode/minWidth/align/scenes/slot） | ★ |
| F 行为 | 怎么交互 | `confirmStrategy`（direct/dialog/global）、`gate`（格子门禁） | ★ |
| G 检索 | 怎么找到 | `searchLayer`、`suggestField` | ○ |
| H 历史 | 改了跟不跟 | `snapshotFrom`（+ `via` 级联反查） | ○（单据） |
| I 权限 | 谁能动 | `permissionCode` | ○ |

### D 关系 · 删除行为（**逐条关系声明，不是某类表的特征**）

```yml
relations:
  - { field: brandId, to: brand, type: manyToOne, onDelete: decouple }  # 解耦留快照
  - { field: categoryIds, to: category, type: oneToMany, onDelete: restrict }
```

| 取值 | 语义 | 什么时候用 |
|---|---|---|
| `cascade` | 随父删 | 配置子表/从属明细——父没了它也没意义（如 `user_roles` → `users`） |
| `restrict` | 有引用禁删（**默认**） | 被引用时不能删，人多半是这种情况 |
| `decouple` | 解耦留快照 | 业务记录引用业务档案：档案删了，记录仍要靠名称快照读得出 |

**这是「关系」的属性，不是「表」的属性**——同一张表对不同表的关系可以是不同取值。
本项目实例：v11.0 把「业务记录 → 业务档案」（单据/付款/成本/配货/审计日志 → 员工/客户/供应商/产品/品牌）统一设为 `decouple`；而 `user_roles` → `users` 保持 `cascade`（配置子表跟随员工档案）。

**判据**：档案删了以后，这条记录还该不该读得出来？该 → `decouple`；不该（父没了子无意义）→ `cascade`；不确定 → `restrict`。

### F 行为 · 格子门禁（gate）

```yml
specModel: { label: 规格型号, gate: { requires: brand, reason: 请先选择品牌 } }
```

语义：**前置字段为空 → 点击给提示**（不置灰、不静默，见硬纪律「门禁用提示不用静默」）。解读器 `resolveGate`。

## 三、resources 段（后端接口声明）

```yml
resources:
  supplier:
    label: 供应商档案          # 语义名（界面/文档用）
    table: supplier            # 物理表名
    primaryKey: id
    permission: supplier_manage # 权限叶子（对应 VIEW_PERMISSION_MATRIX）
    softDelete: { field: status, off: 0 }   # 软删除：删除即置 off 值
    writable: [name, remark, status]        # 可写字段白名单（越界拒绝）
    # 关联预载：必须是 schema.prisma 里该 model 的真实 relation 名，不能写前端概念名
    #   踩过的坑：写过 businessScope（前端概念），Prisma 无此关联 → 接口 500。
    #   真实关联是 businessCategories + businessBrands（经营范围 = 品类 + 品牌两个关联）
    include: [contacts, addresses, businessCategories, businessBrands]
    audit: [supplier_create, supplier_update, supplier_delete]
    search:
      fields: [name]           # 参与检索的字段
      mode: normalized         # normalized=范式多路召回 / like=直接模糊
      dictUnique: global       # 名字是否全局唯一（决定改名是否全局生效）
```

| 维度 | 语义 | 取值/说明 |
|---|---|---|
| `label` | 语义名 | 中文，界面与文档用 |
| `table` | 物理表 | 与 Prisma model 的 `@@map` 一致 |
| `primaryKey` | 主键字段 | 默认 `id` |
| `permission` | 权限叶子 | 与菜单 `requireViews` 同一套 |
| `softDelete` | 软删除 | `{ field, off }`；不填=物理删除 |
| `writable` | 可写字段 | 白名单，防止越界写入 |
| `include` | 关联预载 | 详情/列表要带的子表 |
| `audit` | 审计动作 | 动作名须在 `auditActions` 中已登记 |
| `search.mode` | 检索方式 | `normalized`（范式，推荐）/ `like` |
| `search.dictUnique` | 名字唯一范围 | `global`（全局唯一）/ `parent`（父下唯一） |

## 四、pages 段（前端页面装配）

```yml
pages:
  supplier:
    label: 供应商管理
    list: ArchiveListPage      # 列表组件
    rowKey: id
    fixedSlots: [op, seq, status]   # 固定槽位（操作/序号/状态）
    slots:                     # 数组顺序 = 列表列顺序
      - { key: name, title: 供应商名称, slot: name, editor: NameLinkCell }
      - { key: contacts, title: 联系信息, slot: matrix, editor: ArchiveContactMatrixEditor }
      - { key: addresses, title: 地址, slot: matrix, editor: ArchiveSupplierAddressMatrixEditor }
      - { key: businessScope, title: 经营范围, slot: custom, editor: SupplierBusinessScopePicker }
      - { key: remark, title: 备注, slot: scalar, editor: ArchiveFieldCell }
```

### 槽位类型（`slot`）与形态推导

| 槽位 | 用于什么形态 | 共用组件 |
|---|---|---|
| `name` | 根实体主名称 | NameLinkCell |
| `matrix` | 挂载子表（N 条记录 + 空行晋升） | MatrixTable / useMatrixRecords |
| `custom` | 字典勾选等专属形态 | 专属 Picker（如 SupplierBusinessScopePicker） |
| `scalar` | 单值字段（点值→确认层） | ArchiveFieldCell |
| `enum` | 字典枚举 | PickerNameCell / PickerNumCell |

**形态由「层级 + 表类型」推导**（硬纪律）：父实体=名称链接；挂载子表=矩阵；行级数=行内确认层；跨记录=展开面板；全局字典=检索+快建。新增表先画关系图定层级，形态自动确定，不靠人挑组件。

## 五、actions 段（操作守卫）

```yml
actions:
  purchase_inbound_confirm:
    label: 确认采购入库
    guard:
      requires: [{ fields: [supplierId], reason: 请选择供应商 }]
```

**判定顺序（先命中先拦）**：`requires → requiresAny → minSelected → numbers → rowNumerics → formats → states → rowUnique`

| 类 | 拦什么 | 声明 |
|---|---|---|
| `requires` | 字段必填（组内缺任一） | `{ fields: [...], reason }` |
| `requiresAny` | 至少填一个（全空才拦） | `{ fields: [...], reason }` |
| `minSelected` | 有效行数下限 | `{ n, reason }` |
| `numbers` | 表单数值校验 | `{ field, op: gt/ge/lt/le, ref, reason }` |
| `rowNumerics` | 每行数值校验 | `{ field, op, ref 或 refField, reason }`（`{占位}` 从该行取值） |
| `formats` | 字段格式（正则） | `{ field, pattern, reason }` |
| `states` | 状态机 | `{ allow, forbid, reason }` |
| `rowUnique` | 集合内组合唯一 | `{ in, keys: [{field, against}], except?, reason }` |

**边界**：判定数据能描述为「字段/行数/状态/角色」→ 声明化；依赖多请求时序、派生计算、条件文案、交互约束 → 例外登记 `guard-exceptions.md`。

## 六、枚举值总表（配置界面可选项的唯一来源）

| 类别 | 取值 |
|---|---|
| 层 `layer` | globalDict / subject / mount / row / snapshot / annotation / derived |
| 值来源 `valueFrom` | own / dict / dictVia / relation / config / derived |
| 渲染 `renderMode` | static / text / number / picker / custom |
| 确认策略 `confirmStrategy` | direct / dialog / global |
| 槽位 `slot` | name / matrix / custom / scalar / enum |
| 关系基数 | oneToOne / oneToMany / manyToOne / manyToMany |
| 检索模式 `search.mode` | normalized / like |
| 名字唯一 `dictUnique` | global / parent |
| 守卫判定 `op` | gt / ge / lt / le |

## 七、自检清单（填完必查）

1. `entities` 九视角填全了吗？**值来源（C）与关系方向（D）不能空**
2. `resources.writable` 是否只含真正可写字段？越界字段会被资源引擎拒绝
3. `resources.audit` 的动作名在 `auditActions` 里登记了吗？
4. `pages.slots` 顺序 = 期望的列顺序吗？（顺序是配置值，不是推导）
5. 槽位类型与「层级+表类型」推导的形态一致吗？（不一致=层级判错，回去改关系图）
6. 有没有第二套手写列 / 第二套确认？（有=绕过登记表，违规）
7. 改完跑：`node tools/gen-entity-meta.mjs` → `npx tsc --noEmit`（前后端）→ `node tools/check-docs.mjs`
