/**
 * whyBiz["ui-layer-model"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology.yml → items[ui-layer-model]
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["ui-layer-model"] = {
  "kind": "carry",
  "kicker": "规范 · 表格 UI",
  "title": "一张表格从上到下分五层，上层只做装配，下层只做参数",
  "lead": "全系统 20 个页面共用同一个表格组件，却没共用同一套形态参数——骨架是统一的，格子行为是各页面各写的。根子在列的声明方式：单维 `renderMode` 把「值形态」和「编辑入口」两个正交维度挤在一个字段里，遇到组合就表达不了，结果 135 处列逃进 `custom` 手写 JSX。拆成五层、每层只管一段，形态一致性才由结构保证，而不是靠人盯。",
  "factsKicker": "这一页解决什么",
  "factsTitle": "五层不是切分代码的产物，是从「使用」这条线上长出来的五段",
  "factsLead": "人用一张表是自上而下：先看见页面由哪几行拼，再看行里有什么，再看表格怎么翻，再看某一格是什么，最后才点开确认层改它。五层对应这条线，每层只回答一件事。",
  "facts": [
    {
      "label": "五层各管一段",
      "note": "L1 骨架装配（页面由哪几种行、按什么顺序拼）→ L2 行槽位（每种行的参数与形态）→ L3 表格主体（引擎、空行、分页）→ L4 单元格（值形态 × 编辑入口 × 值状态）→ L5 确认层（输入控件与检索档）。上层只装配，下层只参数。"
    },
    {
      "label": "分层纪律",
      "note": "上层不许替下层决定形态，下层不许越过上层改装配。所谓「页面模式」只是装配组合不同——采购清单是「工具行 + 明细主体（只读）」，售后多装一个「辅助行」，采购报价再多个「统计行」。**不定义三种模式，只定义行槽位序列**：以后任何页面加录入区 = 数组里插一项，不动骨架代码。"
    },
    {
      "label": "判定标准（唯一硬指标）",
      "note": "页面不得在 `renderMode: 'custom'` 内手写单元格交互。任何一处可编辑格都必须能表达为「值形态 × 编辑入口 × 值状态」三个参数的组合。无法归类的例外必须登记在案，并说明为什么不能用参数表达。"
    },
    {
      "label": "交互层职责边界（2026-09-04 裁决）",
      "note": "常驻输入格（inline）的键盘导航归表格层（InteractionLayer）；确认层格（confirm）的键盘由浮层自管，表格层**不接管**。理由：confirm 格点开后是独立浮层，若表格层也接管焦点，会与浮层双重管理焦点。邻格快切由 CellSwitchProvider 承担（colOrder 显式声明方向钮顺序），与 InteractionLayer 是两套正交机制。**提案原第 2 条「验证 InteractionLayer 能接管确认层格子」的前提不成立，已按此修正**。"
    },
    {
      "label": "弹窗剖面（第六观察位）",
      "note": "五层管表格主体；编辑弹窗不看五层看剖面——截图上每个块 → 承载组件 → 数据特征 → 登记表出处，四层对照。弹窗内的表格主体仍走 L1-L5，剖面只补「弹窗骨架」这一段。实例见矩阵页「产品管理 · 编辑弹窗剖面」。"
    },
    {
      "label": "现状（2026-09-04 实测）",
      "note": "L4 层的代码已全部建成（`cellSpec.ts` 三维定义 + `CellSpecRenderer` 渲染 + `cellSpecAdapter` 适配 + `auditCellSpecs` 自检），采购报价已接入（样板跑通，7 处 custom 消灭）。其余 19 个页面 128 处列仍逃在 `custom` 里手写。L5 已是唯一统一实现。L1 / L2 / L3 未落地。"
    }
  ],
  "tables": [
    {
      "kicker": "五层对照",
      "title": "每一层回答什么、参数是什么、现在是哪个组件",
      "colA": "层",
      "colB": "回答什么 · 参数 · 现状组件",
      "rows": [
        [
          "L1 骨架装配层",
          "这个页面由哪几种行、按什么顺序拼 · 行槽位序列（不定义模式，模式只是组合不同） · 容器层（OrderWorkbench：视图导航条 + 单据标签行 + 主表行 `DocumentContextBar`，九视图共享）→ `ViewFrame`：现固定 actionBar + bizStrip + children（另有 preContent / postContent / dialogs 可选槽），待改为可变序列"
        ],
        [
          "L2 行槽位层",
          "每种行槽位的参数与 UI 形态 · 主表行 fields[] / 工具行 count·statusHint·actions[] / 统计行 fields[{label,value,tone,mono,onClick}] / 辅助行 title·fields[]·action·collapsible · `DocumentContextBar` / `StageActionBar` / `StageBizStrip` / **辅助行缺，需新建** · 主表行挂容器层（九视图共享），ViewFrame 内部从工具行开始"
        ],
        [
          "L3 表格主体层",
          "用什么引擎渲染、空行与分页什么策略 · engine(grid\\|matrix) / emptyRow(none\\|inline-append) / paging / selectable / rowExpand / virtual(>50 自动) · `UnifiedTable`：参数是裸的，未抽成一层"
        ],
        [
          "L4 单元格层",
          "这一格是什么值、点下去发生什么 · display × editEntry × valueState，另加 hidden（可见性）与 gate（确认层细化） · `cellSpec.ts` + `CellSpecRenderer` + `cellSpecAdapter`：**已建成，采购报价已接入**（2026-09-04 样板跑通，7 处 custom 消灭）"
        ],
        [
          "L5 确认层",
          "输入控件长什么样、检索出不出 · 纯值输入（无检索槽）/ 字典检索（检索档 + 完整字典档两档，行内改删）/ 选用检索（DsInputDropdown + ▾） · `PickerEditGate`：唯一统一实现"
        ]
      ]
    },
    {
      "kicker": "L4 三维",
      "title": "一格由三个正交维度描述，加两个补充维度",
      "colA": "维度",
      "colB": "分支与含义",
      "rows": [
        [
          "display 值形态",
          "这格显示什么：text 纯文字超出省略 / number 等宽右对齐 / date 灰底 chip / image 24×24 缩略图 / enum-tag 彩色状态标签 / link 下划线品牌色 / multi-record 值 + ▾ 角标"
        ],
        [
          "editEntry 编辑入口",
          "点下去发生什么：none 只读（视觉与可编辑格完全一致，不置灰不消失）/ confirm 确认层 / link 跳转 / expand 展开子记录面板。**inline 常驻输入已废除**（2026-09-04 裁决：与硬纪律「确认层范式·禁止常驻输入框」冲突，editEntry 收为四态；`cellSpec.ts` 里残留的 inline 分支代码随下轮迁移一并删除）"
        ],
        [
          "valueState 值状态",
          "这个值匹配上没有：standard 无附加 / non-standard 值右侧橙色 ⓘ 警示。**与「有字典/无字典」正交**——那是检索能力（决定确认层出不出检索），这是值状态（决定格子显不显示警示），交叉出四种情况，不是同一个轴的两头"
        ],
        [
          "补充：hidden",
          "该行是否隐藏本格。现状靠 render 里写三元表达式，本质是列级参数而非渲染逻辑"
        ],
        [
          "补充：gate",
          "editEntry=confirm 时必填：title / input(text\\|number\\|date) / search(三分支) / bullets / fromText / onApply / allowEmpty"
        ]
      ]
    },
    {
      "kicker": "装配序列",
      "title": "同是表格页面，差别只在装了哪几行（2026-09-04 按代码核实）",
      "colA": "页面",
      "colB": "装配序列（从上到下）",
      "rows": [
        [
          "采购清单（客户端）",
          "工具行 + 明细主体（只读）· 无主表行"
        ],
        [
          "产品管理",
          "工具行 + 明细主体（可编辑）· 无主表行（走 ArchiveListPage）"
        ],
        [
          "采购报价",
          "主表行 + 工具行 + 统计行 + 明细主体（空行录入）"
        ],
        [
          "售后",
          "主表行 + 工具行 + 统计行 + **辅助行** + 明细主体"
        ]
      ]
    },
    {
      "kicker": "迁移进度",
      "title": "四阶段走到哪了（2026-09-04）",
      "colA": "阶段",
      "colB": "内容 · 状态",
      "rows": [
        [
          "阶段 0",
          "修「完整字典」档过滤语义：全量不过滤，输入字只做高亮 + 滚动定位 · ✅ 已落地（`PickerEditGate` + `SuggestList.highlightKeyword` / `countHint`）"
        ],
        [
          "阶段 1",
          "采购报价样板验证：8 列全部改写为三维参数，7 处 custom 消灭 · ✅ 已落地（2026-09-04，e2e 13/13 全过：7 个 confirm 格逐个点开、金额只读、门禁提示、无 JS 错误）"
        ],
        [
          "阶段 2",
          "抽 `AuxToolbarRow` 辅助行组件（售后「新建退换记录区」是唯一实例） · ❌ 未启动"
        ],
        [
          "阶段 3",
          "批量推：20 个页面 135 处 custom 接入 L4 唯一链路 · ❌ 未启动"
        ],
        [
          "阶段 4",
          "验证后并入本规范 · ✅ 已落地（本篇）"
        ]
      ]
    }
  ],
  "rulesKicker": "不管做哪一层",
  "rulesTitle": "越层的改动先看这几条",
  "rules": [
    [
      "上层只装配、下层只参数",
      "上层不许替下层决定形态，下层不许越过上层改装配。新增一种行 = 行槽位数组里插一项，不动骨架代码；新增一种格子形态 = 在 L4 加一个分支，不动页面。"
    ],
    [
      "不得在 custom 内手写单元格交互",
      "任何可编辑格必须能表达为三维参数组合。无法归类的例外登记在案并说明为什么不能用参数表达——custom 的语义是「无法归类」，用它就是认输。"
    ],
    [
      "门禁格视觉必须一致",
      "前置未满足的格子保持与可编辑格完全一致的视觉（hover、分割线、行高），点击给提示「请先 X」。参数化之后门禁 = `editEntry: 'confirm' + disabledReason`，视觉由组件统一保证，页面无权决定。"
    ],
    [
      "待补不静默留白",
      "某表某层暂无实测数据时，页面明写「待补 + 补法」，禁止空白。让人一眼看出是没填还是没有。"
    ],
    [
      "L1 落地决策：改造 ViewFrame",
      "已裁决采用「改造 `ViewFrame` 支持行槽位数组」，而非在其上加一层装配器——理由是避免多一层抽象；代价是需对 9 个工作台视图全量回归。L2 的辅助行是本层唯一需新建的组件。"
    ],
    [
      "对齐由值形态决定，不由页面手设",
      "number 右对齐、text 左对齐、date/image/enum-tag 居中。排版（宽、对齐、固定列）归列级，行为归 CellSpec，两处都设会打架。"
    ],
    [
      "L4 声明落点＝登记表，禁止第二套",
      "L4 三维参数（display × editEntry × valueState）与列清单同源登记在 `entity-meta.yml` 的 pages 段，页面只装配不手写列声明。v31 页面装配器已由登记表驱动列顺序，页面再手写第二套列声明＝违规。"
    ],
    [
      "现状数字以脚本实测为准",
      "「20 页 / 135 处 custom」这类统计由 `auditCellSpecs`（cellSpec.ts）/ grep 实测产出并标日期，禁止手写估计——写死的数字必然漂移。"
    ],
    [
      "矩阵与网格是并列引擎",
      {
        "已裁决：`MatrixTable` 与 `UnifiedTable` 在 L3 为并列引擎（engine": "grid | matrix），矩阵不是网格的子模式。矩阵用于浮层内多记录编辑（C29），网格用于页面主体。"
      }
    ]
  ]
};
