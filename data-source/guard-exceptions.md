# 操作守卫 · 真·例外登记表

> 纪律：判定数据能描述为「字段 / 行数 / 状态 / 角色」的守卫 → 声明化进 `entity-meta.yml` 的 `actions.guard`（`resolveGuard` 解读）。
> **例外必须登记在案，不能成为默认。** 本表是唯一的例外清单——新增例外先补这里，否则视为回潮。
> 判定（先命中先拦）：requires → requiresAny → minSelected → numbers → rowNumerics → formats → states

## 一、多请求时序（await 后校验返回数据）

| 位置 | 判定 | 为什么例外 | 建议 |
|---|---|---|---|
| ProductManage.tsx:722 | await getProduct 后 `!product.brands \|\| !product.units` | 判定数据在异步响应里，声明化只能拿到"空"概念，拿不到"响应内容" | 保持代码 + 此处登记 |
| ProductManage.tsx:728 / 914 | await 后 `brandIdx < 0`（品牌未找到） | 同上，依赖响应内索引查找 | 保持代码 |
| PricePicker.tsx:156 | await loadPriceTypes 后 `priceTypes.length === 0` | 判定在异步加载完成后，声明化无法表达"加载完再看" | 保持代码 |
| ProductPicker.tsx:1571 | await 派生后 `!unit` | 同上 | 保持代码 |

**响应/异常处理类**（错误转提示，不属于前置守卫）：ProductEditDialog.tsx:457/:1132、QuickCreateConfirmDialog.tsx:119、SpecListPanel.tsx:125、AccessRequests.tsx:110、BatchStandardizeDialog.tsx:183 —— 全部是后端响应 / 唯一冲突异常 → message 转换，不是"动作前拦截"，天然不属于 guard。

## 二、派生计算 / 聚合布尔

| 位置 | 判定 | 为什么例外 |
|---|---|---|
| RefundAfterSale.tsx:428 | `remaining = originalQty - (refundedByLine - editTarget.refundQty)`，再比 newQty | remaining 是**跨行汇总算术**，判定数据不是四类中的任何一类 |
| ArchiveView.tsx:356 | `!allPrerequisitesPassed`（V2~V9 全部 confirmed） | 多个前置环节的**聚合布尔**，声明化只能表达单状态 |
| PurchaseList.tsx:529 | `!canRemoveLine` | 订单状态 + 权限的聚合布尔 |
| ProductEditDialog.tsx:960 | `brands.find((b) => b.id && !b.name.trim())` 品牌名空 | **集合内元素字段校验**——判定目标是 brands 数组中某元素的字段，声明化只能查单字段 |

## 三、重复 / 唯一性校验（集合内查重）

> **大部分已归队**（`rowUnique` DSL，组合唯一 keys + 排除自身 except + 空值跳过）：
> sale_price_apply / purchase_price_edit_supplier / purchase_price_add_derived / spec_rename / dict_item_add / dict_item_rename。
> 防回潮：新集合查重优先用 `rowUnique`，例外必须登记本表。
> **dict_item_rename 口径变更（2026-09，用户拍板）**：字典类（brand/unit/category/priceType/supplier）管理面板改名输入已有同名不再拦截，改为 dictMerge 并档（previewDictChange 影响确认 → applyDictChange）。`rowUnique` 守卫保留给非字典类档案改名；`dict_item_add`（新增同名）拦截不变——新增同名是空操作，并档语义只属于改名。
> 以下因条件分支 / 条件文案 / 派生布尔暂留例外：

| 位置 | 判定 | 为什么例外 |
|---|---|---|
| UnitPriceExpandPanel.tsx:373 | 价格类型「已存在」 | name 空时走另一流程 + 清空输入副作用，分支逻辑无法声明 |
| UnitPriceExpandPanel.tsx:485 | 供应商已存在（两套文案） | 提示语依赖 sname 有无——条件文案，DSL 无法静态表达 |
| ProductEditDialog.tsx:930 | 规格重复 | specDuplicate 是派生布尔（跨品牌唯一计算），非集合查重 |

## 四、交互约束（picker 禁手输，强制列表选择）

| 位置 | 提示 | 为什么例外 |
|---|---|---|
| RefundAfterSale.tsx:930 | 请从列表勾选单据 | onApply 无条件拦截手输——没有"判定数据"，是交互方式约束 |
| RefundAfterSale.tsx:965 | 请从列表点选或插入已卖行 | 同上 |
| OrderWorkbench.tsx:157 | 请从列表点单号打开 | 同上 |
| DocumentContextBar.tsx:251 | 请从列表点选客户 | 同上 |

> 本质是 picker 的确认策略（confirmStrategy），未来可挂到检索组件声明，不进动作守卫。

## 五、特殊/已排除

| 位置 | 说明 |
|---|---|
| canvasModal.ts:36 | `modal.warning` 方法包装，非守卫 |
| PickerInlineCells.tsx:88/:102 | 格子门禁（gate）的 rejectReason 兜底提示，属 gate 体系 |
| ArchiveSlotHost.tsx:151 | 权限只读提示（permissionReadonlyTip），属权限维度 |
| ArchiveSlotHost.tsx:257 | 自定义 `validate` 回调（可插拔校验接口），已是声明化接口 |

## 防回潮规则

1. 新写守卫时：能声明 → 进 yml；不能 → 先在本表登记，再写代码。
2. 本表登记项若未来 DSL 能覆盖（如 `rowUnique`），收拢后从本表移除。
3. 代码里 `message.warning('...')` 的**业务守卫**（动作前拦截）出现新位置，默认视为回潮，先审查。
