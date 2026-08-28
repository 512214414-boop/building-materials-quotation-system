// SharedBadge Registry — 共享组件编号注册表（v15.4）
//
// 背景（用户「我在前端界面中要能直观看到共享组件，给它编号，一指就能定位」）：
//   - 每个共享组件分配稳定编号（C01+），前端开启「标识模式」后，界面上的共享组件实例
//     会高亮 + 悬浮显示 编号/中文名/分组，让使用者一眼区分「已抽象（有编号）」与「未抽象」。
//   - 使用者说「C05 那个下拉面板」即可精确定位，调整/抽象判断都基于编号。
//
// 使用：
//   - 组件根元素挂 data-shared-badge={编号} → SharedBadgeOverlay 自动识别
//   - 新增共享组件 → 在本表登记编号（按分组顺序 C01+ 递增）+ 组件根元素加属性 + 同步《共享组件与公共能力》文档
//   - 纯逻辑类（无界面根元素，如 FocusBus / PanelTree / hooks / utils）不编号（无 UI 可标）

export interface SharedBadgeInfo {
  /** 编号（C01+，全局唯一） */
  id: string;
  /** 中文名（tooltip 展示） */
  cn: string;
  /** 分组（tooltip 展示，与《共享组件与公共能力》章节一致） */
  group: string;
}

/** 组件名 → 编号信息（键为组件文件导出的默认组件名） */
export const SHARED_BADGES: Record<string, SharedBadgeInfo> = {
  // 二、基础组件库 Ds*
  DsButton: { id: 'C01', cn: '按钮', group: '基础组件' },
  DsInput: { id: 'C02', cn: '输入框', group: '基础组件' },
  DsNumberInput: { id: 'C03', cn: '数字输入', group: '基础组件' },
  DsSelect: { id: 'C04', cn: '下拉选择', group: '基础组件' },
  DsTag: { id: 'C05', cn: '标签', group: '基础组件' },
  ValueChangePair: { id: 'C70', cn: '原值新值对比', group: '基础组件' },
  DsSegmented: { id: 'C06', cn: '分段控件', group: '基础组件' },
  DsDialog: { id: 'C07', cn: '弹窗', group: '基础组件' },
  DsDrawer: { id: 'C08', cn: '抽屉', group: '基础组件' },
  DsNavButton: { id: 'C09', cn: '导航按钮', group: '基础组件' },
  DsNavLink: { id: 'C10', cn: '导航链接', group: '基础组件' },
  DsShellRow: { id: 'C11', cn: '行盒子', group: '基础组件' },

  // 五、录入/选择组件
  SuggestInput: { id: 'C12', cn: '检索输入', group: '录入选择' },
  SuggestList: { id: 'C13', cn: '匹配列表', group: '录入选择' },
  DictRefCell: { id: 'C14', cn: '档案引用单元格', group: '录入选择' },
  DictRefField: { id: 'C15', cn: '档案引用输入', group: '录入选择' },
  DictFieldInput: { id: 'C16', cn: '字典行内输入', group: '录入选择' },
  DictListPanel: { id: 'C17', cn: '字典管理面板', group: '录入选择' },
  UnitDropdown: { id: 'C18', cn: '单位切换下拉', group: '录入选择' },
  UnitManagePanel: { id: 'C19', cn: '单位管理面板', group: '录入选择' },
  UnitPriceExpandPanel: { id: 'C20', cn: '价格展开面板', group: '录入选择' },
  PricePicker: { id: 'C21', cn: '价格补全入口', group: '录入选择' },
  ProductPicker: { id: 'C22', cn: '选品槽位框架', group: '录入选择' },
  CustomerPicker: { id: 'C23', cn: '客户选用检索', group: '录入选择' },
  EnumPicker: { id: 'C24', cn: '枚举选择器', group: '录入选择' },
  UnitPicker: { id: 'C25', cn: '单位选择器', group: '录入选择' },
  AllocationSourcePicker: { id: 'C26', cn: '配货来源选择器', group: '录入选择' },
  SupplierPicker: { id: 'C67', cn: '供应商选用检索', group: '录入选择' },
  SoldLinePicker: { id: 'C68', cn: '售后已卖行选用', group: '录入选择' },
  DocumentSourcePicker: { id: 'C69', cn: '售后单据选用', group: '录入选择' },
  QuickOptionsBar: { id: 'C27', cn: '预置选项条', group: '录入选择' },
  RecordExpandPanel: { id: 'C28', cn: '展开面板外壳', group: '录入选择' },
  MatrixTable: { id: 'C29', cn: '矩阵面板', group: '录入选择' },
  EntityPanel: { id: 'C65', cn: '浮层表网格基座', group: '录入选择' },

  DictMultiSelectPanel: { id: 'C66', cn: '字典多选面板', group: '录入选择' },

  // 六、快速新建 + 自动补充确认
  QuickCreateConfirmDialog: { id: 'C30', cn: '快速建档弹窗', group: '快速新建' },
  DefaultFillsPreview: { id: 'C31', cn: '档案确认预览', group: '快速新建' },

  // 三、表格体系
  UnifiedTable: { id: 'C32', cn: '统一表格', group: '表格体系' },
  DataViewLayer: { id: 'C33', cn: '表格数据层', group: '表格体系' },
  InteractionLayer: { id: 'C34', cn: '表格交互层', group: '表格体系' },

  // 七、表格列字段
  NameLinkCell: { id: 'C35', cn: '主名称列', group: '表格列' },
  ImageThumbCell: { id: 'C36', cn: '图片缩略图列', group: '表格列' },
  TextCell: { id: 'C37', cn: '文本列', group: '表格列' },
  LongTextCell: { id: 'C38', cn: '长文本列', group: '表格列' },
  DateTimeCell: { id: 'C39', cn: '日期时间列', group: '表格列' },
  StatusTagCell: { id: 'C40', cn: '状态标签列', group: '表格列' },
  EnumInlineEditCell: { id: 'C41', cn: '枚举行内编辑列', group: '表格列' },
  RecordFieldColumn: { id: 'C42', cn: '多记录列', group: '表格列' },
  SkuPriceColumns: { id: 'C43', cn: '价格三列工厂', group: '表格列' },

  // 八、页面骨架与动作条
  AppShell: { id: 'C44', cn: '全局骨架', group: '骨架动作条' },
  ViewFrame: { id: 'C45', cn: '视图骨架', group: '骨架动作条' },
  PageActionBar: { id: 'C46', cn: '页面操作栏', group: '骨架动作条' },
  StageActionBar: { id: 'C47', cn: '视图操作条', group: '骨架动作条' },
  StageBizStrip: { id: 'C48', cn: '环节业务条', group: '骨架动作条' },
  StageDocumentHeader: { id: 'C49', cn: '单据抬头', group: '骨架动作条' },
  DocumentContextBar: { id: 'C50', cn: '单据上下文栏', group: '骨架动作条' },

  // 九、单据视图
  DocumentView: { id: 'C51', cn: '单据视图', group: '单据视图' },
  DocumentPaperView: { id: 'C52', cn: '单据即工作台', group: '单据视图' },
  CreateDocumentModal: { id: 'C53', cn: '新建单据弹窗', group: '单据视图' },
  ReimbursementBillPanel: { id: 'C54', cn: '报销单面板', group: '单据视图' },
  BatchStandardizeDialog: { id: 'C55', cn: '批量补全弹窗', group: '单据视图' },

  // common 权限/反馈
  PermissionDenied: { id: 'C56', cn: '无权限提示', group: '权限反馈' },
  PermissionGuard: { id: 'C57', cn: '权限守卫', group: '权限反馈' },
  SaveStatusProvider: { id: 'C58', cn: '即时保存反馈', group: '权限反馈' },
  StatusBadge: { id: 'C59', cn: '状态徽章', group: '权限反馈' },

  // 四、浮动面板
  FloatPanel: { id: 'C60', cn: '浮动面板基座', group: '浮动面板' },

  // 十、输入+下拉组合
  DsInputDropdown: { id: 'C61', cn: '输入+下拉组合', group: '录入选择' },
};
