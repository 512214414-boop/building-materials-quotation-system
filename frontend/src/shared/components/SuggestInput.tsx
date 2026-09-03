// SuggestInput — 输入框快捷辅助录入组件（v9.5 统一抽象）
//
// ============================================================
// §A 组件定位
// ============================================================
// 表单字段场景的"输入框 + 匹配列表"入口组件。
// 内部通过 AutoComplete dropdownRender 调用 SuggestList（唯一列表实现）。
// 列表渲染/新建项/loading/无匹配/容器样式全部由 SuggestList 统一处理。
//
// ============================================================
// §B 何时用 SuggestInput（应用范围）
// ============================================================
//   启用 ⟺ "录入"场景（需选择/新建并回填值到数据表）且满足任一：
//     ① 字段值有复用价值（历史数据可复用，如单位"米"/规格"dn25"）
//     ② 字段是关联字段需要选择 ID（如分类/供应商/价格类型）
//   不启用 ⟺ 以下任一：
//     ① 即时性输入，无复用价值（如订单临时备注）→ 用普通 Input
//     ② 唯一性强的标识（如订单号/客户手机号）→ 用普通 Input
//     ③ 数字/日期等非文本类型 → 用 InputNumber / DatePicker
//   档案列表表头列筛不要用本组件，走 HeaderCascadeFilter（当前结果 facets）。
//
// ============================================================
// §C 新输入框快速启用指南（3 步设计参数）
// ============================================================
//  为新输入框添加实时匹配列表时，按以下 3 步设计参数：
//
//  Step 1【是否新建】问自己：这个字段的值来源是"需要先建档的关联表"吗？
//          是 → allowCreate=true（默认按 field 自动判定：category/supplier/priceType）
//          否 → allowCreate=false（仅检索辅助 + 重复确认）
//          判断依据：
//            ① 字段数据来源 = 关联字段（值来自关联表，需先建档拿 ID）→ 启用
//            ② 关联表能独立建档（不依附父实体）→ 启用
//            ③ 建档所需信息 = 单字段 name（输入框提供的就是 name）→ 启用
//            任一不满足 → 不启用
//          注意：此判断条件无法从程序自动取得，靠开发者逻辑判断，
//                在调用时显式传 allowCreate 或依赖 field 默认映射
//
//  Step 2【填充几个字段】问自己：选中后需要回填几个字段？
//          1 个 → 用 SuggestInput 默认行（单列 label + type 标签）
//                 onSelect 回调填一个字段（如分类只填 categoryId）
//          多个 → 用 ProductPicker（FloatPanel + rowRender + 二级面板）
//                 onSelect 回调填多个字段（如采购报价填 productId+brandId+unitId+price）
//          注意：填充哪些字段由调用方在 onSelect 内决定
//
//  Step 3【检索什么数据】问自己：需要检索什么数据？
//          单字段去重 → 用 useSuggest hook（调 suggest API，返回 SuggestOption[]）
//          多列 SKU → 用自定义 fetcher（调 searchProducts API，返回 SkuRow[]）
//          注意：检索方式由调用方决定，SuggestList 只接收 options 渲染
//
// ============================================================
// §D 字段策略表（现有字段配置参考）
// ============================================================
//   category  → allowCreate=✅（quickAddCategory）  单字段填充  单字段检索
//   supplier  → allowCreate=✅（quickAddSupplier）  单字段填充  单字段检索
//   priceType → allowCreate=✅（createPriceType）   单字段填充  单字段检索
//   brand     → allowCreate=✅（quickAddBrand，v14.0 全局档案）  单字段填充  单字段检索
//   product   → allowCreate=❌（多字段建档走Picker） 多字段填充  多列检索
//   unit      → allowCreate=❌（依附规格事务）       单字段填充  单字段检索
//   specModel → allowCreate=❌（直接字段）           单字段填充  单字段检索
//   remark    → allowCreate=❌（直接字段）           单字段填充  单字段检索
//
// ============================================================
// §E 行为规范（已统一，无需调用方关心）
// ============================================================
//   - 防抖 250ms 调用 suggest(field, kw, { productId })
//   - 列表渲染：SuggestList 统一处理（容器/行高/字体/滚动/hover/新建项/loading/无匹配）
//   - open 受控：输入时打开，选中/点击外部/ESC 关闭
//   - allowClear 默认 true
//   - 选中已有项 → onSelect({id, name, type:'existing'})
//   选中默认项 → onSelect({id:'', name, type:'default'})
//   选中新建项 → onCreate 建档后 onSelect({id, name, type:'create'})

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoComplete } from 'antd';
import type { SuggestField, SuggestOption } from '../services/api/baseDataApi.js';
import {
  quickAddSupplier,
  createPriceType,
  quickAddCategory,
  quickAddBrand,
} from '../services/api/baseDataApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useSuggest } from '../hooks/useSuggest.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';
import { smartPopupContainer } from '../utils/smartPopupContainer.js';
import SuggestList from './SuggestList.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerEditGateProvider, usePickerEditGate } from './product-picker/PickerEditGate.js';
import {
  DICT_DELETE_FN,
  DICT_ENTRY_VIEWS,
  dictChangeKindOfField,
  isDictEntryField,
  renameDictEntry,
  toSuggestOption,
  type DictEntryItem,
} from '../config/dictEntryViews.js';

// ============================================================
// §1 类型定义
// ============================================================

export interface SuggestSelectItem {
  /** 已有项 ID（BigInt 序列化 string；category 为 number 转 string） */
  id: string;
  /** 选中名称 */
  name: string;
  /** 选项类型 */
  type: SuggestOption['type'];
}

export interface SuggestInputProps {
  /** 共享组件编号标识（v15.4）：标识模式下高亮+悬浮显示，默认 C12，包装组件可覆盖 */
  'data-shared-badge'?: string;
  /** 字段类型，决定检索接口和默认新建函数 */
  field: SuggestField;
  /** 输入值（受控） */
  value: string;
  /** 文本变更回调（必选） */
  onChange: (val: string) => void;
  /**
   * 选中下拉项回调（含 id 和类型）
   * - 不传则不处理 id（适用于无需 id 的场景，如 specModel/remark/brand）
   * - 传入则选中已有项回传 id，选中新建项回传建档后的新 id
   */
  onSelect?: (item: SuggestSelectItem) => void;
  /** 占位符 */
  placeholder?: string;
  /** SPU 上下文过滤（brand/specModel/unit/remark 按 productId 检索） */
  productId?: string;
  /** 尺寸（项目惯例 sm/md/lg，默认 'sm'；映射 antd small/middle/large） */
  size?: 'sm' | 'md' | 'lg';
  /** 禁用 */
  disabled?: boolean;
  /**
   * 是否允许快速新建
   * - 默认按 field 数据来源类型自动判定：
   *     关联字段 + 有独立 quickAdd → true（supplier/priceType/category）
   *     其他 → false（product/brand/unit/specModel/remark）
   * - 显式传值可覆盖默认
   */
  allowCreate?: boolean;
  /**
   * 自定义新建函数
   * - 不传则按 field 使用默认映射（supplier→quickAddSupplier 等）
   * - 传入则覆盖默认
   */
  onCreate?: (name: string) => Promise<{ id: string; name: string }>;
  /** 失焦回调（用于空行新增提交） */
  onBlur?: () => void;
  /** 按键回调（用于 Enter 提交） */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** 点击回调（行内编辑阻止行切换冒泡等） */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /**
   * 自定义检索（档案列表表头级联等）。传入则不走 suggest(field)。
   * 空关键词也会查（品牌/规格在上级已锁定时列出当前结果里的下级）。
   */
  fetcher?: (keyword: string) => Promise<SuggestOption[]>;
  /** 下拉打开时即使关键词为空也检索（配合 fetcher） */
  searchWhenEmpty?: boolean;
  /**
   * 视觉变体
   * - plain：纸面底 + 边框（表单/浮层内，默认）
   * - embedded：透明无边框，嵌入表头/单元格，与 DsInput embedded、格内常驻输入同一套度量
   */
  variant?: 'plain' | 'embedded';
  /** 追加到根节点的 class */
  className?: string;
  /** 自定义样式（应用到根容器） */
  style?: React.CSSProperties;
  /** 是否显示清除按钮，默认 true */
  allowClear?: boolean;
  /** 是否使用 public 接口（未登录态），默认 false */
  public?: boolean;
  /** v1.5.4：自动聚焦（行内编辑场景，Popover 打开即聚焦输入框） */
  autoFocus?: boolean;
  /** 自定义下拉挂载点。选品确认浮层里要挂在当前层，点下拉才不会把确认层关掉 */
  getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
}

// ============================================================
// §2 默认新建函数映射表（按 field 数据来源类型自动判定）
//
// 仅"关联字段 + 有独立 quickAdd API"的字段在此映射：
//   - supplier  → quickAddSupplier（独立 supplier 表）
//   - priceType → createPriceType（独立 price_type 字典表）
//   - category  → quickAddCategory（独立 category 表）
//   - brand     → quickAddBrand（v14.0 全局品牌档案，name 全局唯一，同名幂等）
// 其他关联字段（product/unit）随 saveProduct 事务创建，无独立 quickAdd
// 直接字段（specModel/remark）无需新建
// ============================================================

const DEFAULT_CREATE_FN: Partial<
  Record<SuggestField, (name: string) => Promise<{ id: string; name: string }>>
> = {
  supplier: async (name) => {
    const s = await quickAddSupplier({ name });
    return { id: s.id, name: s.name };
  },
  priceType: async (name) => {
    const p = await createPriceType({ name, status: 1 });
    return { id: p.id, name: p.name };
  },
  category: async (name) => {
    const c = await quickAddCategory(name);
    return { id: String(c.id), name: c.name };
  },
  brand: async (name) => {
    const b = await quickAddBrand(name);
    return { id: String(b.id), name: b.name };
  },
};

// v14.2：导出供 DictRefCell（档案引用单元格）失焦解析复用同一新建映射（quickAdd 幂等）
export { DEFAULT_CREATE_FN };

/**
 * 默认允许快速新建的字段（关联字段 + 有独立 quickAdd）
 * 顶层规则：关联字段需先建档拿 ID 才能用，故启用快速新建
 * v14.0：brand 升级为全局档案（name 唯一 + quickAddBrand），纳入默认可新建
 */
const DEFAULT_CREATABLE_FIELDS: SuggestField[] = ['supplier', 'priceType', 'category', 'brand'];

// ============================================================
// §3 字体大小映射
// ============================================================

const FONT_SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'var(--body-sm-font-size)',
  md: 'var(--body-sm-font-size)',
  lg: 'var(--body-sm-font-size)',
};

/** 项目惯例尺寸 → antd 尺寸 */
const ANTD_SIZE_MAP: Record<'sm' | 'md' | 'lg', 'small' | 'middle' | 'large'> = {
  sm: 'small',
  md: 'middle',
  lg: 'large',
};

// ============================================================
// §4 通用 SuggestInput 组件
// ============================================================

function SuggestInputInner({
  field,
  value,
  onChange,
  onSelect,
  placeholder,
  productId,
  size = 'sm',
  disabled,
  allowCreate,
  onCreate,
  onBlur,
  onKeyDown,
  onClick,
  fetcher,
  searchWhenEmpty = false,
  variant = 'plain',
  className,
  style,
  allowClear = true,
  public: isPublic = false,
  autoFocus,
  getPopupContainer,
  'data-shared-badge': badgeOverride,
}: SuggestInputProps) {
  const [searchKw, setSearchKw] = useState('');
  const [open, setOpen] = useState(() => Boolean(autoFocus && searchWhenEmpty));
  const [createLoading, setCreateLoading] = useState(false);
  const debouncedKw = useDebounce(searchKw, 250);
  const { message, modal } = useCanvasApp();
  const gate = usePickerEditGate();
  const rootRef = useRef<HTMLDivElement>(null);

  // ---- 字典类字段：两档入口（检索结果 / 完整字典）+ 行内改/删 ----
  // 表头级联（fetcher）与未登录 public 接口不走全局字典，不出现切换条
  const showDictEntry = isDictEntryField(field) && !fetcher && !isPublic;
  const [viewMode, setViewMode] = useState<'suggest' | 'dict'>('suggest');
  const [dictItems, setDictItems] = useState<DictEntryItem[]>([]);
  const [dictLoading, setDictLoading] = useState(false);

  const refreshDict = useCallback(async () => {
    const listFn = DICT_LIST_FN[field];
    if (!listFn) return;
    setDictLoading(true);
    try {
      setDictItems(await listFn());
    } catch {
      setDictItems([]);
    } finally {
      setDictLoading(false);
    }
  }, [field]);

  useEffect(() => {
    if (showDictEntry && open && viewMode === 'dict') void refreshDict();
  }, [showDictEntry, open, viewMode, refreshDict]);

  const dictOptions = useMemo(
    () => dictItems.map(toSuggestOption),
    [dictItems],
  );
  const filteredDictOptions = useMemo(() => {
    const kw = searchKw.trim().toLowerCase();
    if (!kw) return dictOptions;
    return dictOptions.filter((o) => o.value.toLowerCase().includes(kw));
  }, [dictOptions, searchKw]);

  // 行内「改」→ PickerEditGate 确认层（preview 影响行数 → 改名/并档 → apply）。
  // 不传 apply：字典项改名本身就是全局动作，确认层只出「改全局」。
  const openRenameGate = useCallback(
    (opt: SuggestOption) => {
      if (opt.id == null || opt.id === '' || !rootRef.current) return;
      const fromId = String(opt.id);
      const kind = dictChangeKindOfField(field);
      setOpen(false);
      gate.open(
        {
          kind,
          from: opt.value,
          fromId,
          dictField: kind,
          input: 'text',
          applyGlobal: async (next) => {
            const result = await renameDictEntry(field, fromId, next);
            void refreshDict();
            if (value.trim() === opt.value) {
              onChange(next);
              onSelect?.({ id: result.toId, name: result.toName, type: 'existing' });
            }
          },
        },
        rootRef.current,
        { allowRoot: true },
      );
    },
    [field, gate, onChange, onSelect, refreshDict, value],
  );

  // 行内「删」→ 单条 modal.confirm（历史值作为字符串保留；被引用由后端拦截）
  const confirmDelete = useCallback(
    (opt: SuggestOption) => {
      const deleteFn = DICT_DELETE_FN[field];
      if (opt.id == null || opt.id === '' || !deleteFn) return;
      modal.confirm({
        title: `删除「${opt.value}」？`,
        content: '已使用的历史值作为字符串保留在业务数据中，不受影响。',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteFn(String(opt.id));
            void refreshDict();
            if (value.trim() === opt.value) onChange('');
            message.success(`已删除「${opt.value}」`);
          } catch {
            message.error('删除失败，该项可能仍被引用');
          }
        },
      });
    },
    [field, modal, message, refreshDict, value, onChange],
  );

  // 默认 allowCreate 按 field 判定
  const finalAllowCreate = allowCreate ?? DEFAULT_CREATABLE_FIELDS.includes(field);
  // 默认 onCreate 按 field 映射
  const finalOnCreate = onCreate ?? DEFAULT_CREATE_FN[field];

  // v9.5：useSuggest allowCreate 始终传 false（过滤后端返回的 create 项），
  //   新建项由 SuggestList 独立渲染和处理（showCreate 逻辑），避免新建项重复显示
  const { options: filteredOptions, loading } = useSuggest({
    field,
    keyword: debouncedKw,
    productId,
    isPublic,
    fetcher,
    allowEmptyKeyword: searchWhenEmpty,
    enabled: open,
    allowCreate: false,
  });

  // v9.5：选中已有项/默认项（由 SuggestList onSelect 调用）
  const handleSelect = (opt: SuggestOption) => {
    onChange(opt.value);
    onSelect?.({ id: opt.id != null ? String(opt.id) : '', name: opt.value, type: opt.type });
    setOpen(false);
  };

  // v9.5：新建项（由 SuggestList onCreate 调用）
  const handleCreate = async (name: string) => {
    if (!finalAllowCreate || !finalOnCreate) return;
    setCreateLoading(true);
    try {
      const created = await finalOnCreate(name);
      onChange(created.name);
      onSelect?.({ id: created.id, name: created.name, type: 'create' });
    } catch {
      onChange(name);
      onSelect?.({ id: '', name, type: 'create' });
    } finally {
      setCreateLoading(false);
      setOpen(false);
    }
  };

  // v11.0.7 修复【关键】：末尾空行场景（allowCreate=true）下，
  //   用户输入新名称后按 Enter 或失焦应触发新建。
  //   原设计只依赖外部 onKeyDown/onBlur 回调，但 Antd 6 AutoComplete
  //   在 allowCreate=false 时下拉不显示"新建"项，用户看不到提示，
  //   且外部回调与 SuggestInput 内部状态不同步。
  //   修复：SuggestInput 内部统一处理 Enter/onBlur 触发 handleCreate，
  //         外部 onKeyDown/onBlur 仍先执行（兼容行内改名等场景）。
  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLElement>) => {
    // 先执行外部 onKeyDown（如行内改名 Enter 提交）
    (onKeyDown as React.KeyboardEventHandler<HTMLElement> | undefined)?.(e);
    // allowCreate=true 场景：Enter 触发新建
    if (finalAllowCreate && e.key === 'Enter' && searchKw.trim() && !createLoading) {
      e.preventDefault();
      void handleCreate(searchKw.trim());
    }
  };

  const handleBlurInternal = () => {
    // 先执行外部 onBlur（如行内改名失焦提交）
    onBlur?.();
    // allowCreate=true 场景：失焦触发新建（末尾空行设计：失焦即新建）
    if (finalAllowCreate && searchKw.trim() && !createLoading) {
      void handleCreate(searchKw.trim());
    }
  };

  const fontSize = FONT_SIZE_MAP[size];
  // v15.4 共享组件编号：包装组件（DictRefCell 等）可覆盖，默认 C12
  const badge = badgeOverride ?? 'C12';
  const rootClass = [
    'ds-suggest-input',
    variant === 'embedded' ? 'ds-suggest-input-embedded' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} style={{ width: '100%' }}>
    <AutoComplete
      className={rootClass}
      data-shared-badge={badge}
      size={ANTD_SIZE_MAP[size]}
      value={value}
      onChange={onChange}
      onSearch={(v) => {
        setSearchKw(v);
        // v11.0.4 修复【关键】：Antd 6 的 AutoComplete 基于 Select，
        //   onChange 只在选中 option 时触发，不在用户输入时触发。
        //   如果不在 onSearch 中同步 onChange，所有 SuggestInput 字段
        //   （规格型号、产品名称、备注等）的值都不会更新，
        //   导致保存时校验失败（用户报告的"无法保存"问题）。
        onChange(v);
        if (v.trim() || searchWhenEmpty) setOpen(true);
      }}
      open={open}
      onOpenChange={(visible) => {
        setOpen(visible);
        if (visible) {
          // 表头级联：打开时按空词拉「当前结果里的下级」，展示值仍是已选项
          setSearchKw(searchWhenEmpty ? '' : value);
        } else {
          // 每次进来先看「检索结果」档，不保留上次的「完整字典」档
          setViewMode('suggest');
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      style={{ width: '100%', ...style }}
      styles={{
        input: { fontSize },
        // v11.2：不再设 inline z-index，浮动面板挂载到 .ant-modal-wrap 后自然在 Modal 内容之上
        popup: { root: { padding: 0, minWidth: 220, maxWidth: 380 } },
      }}
      // antd 6：popupClassName 已弃用 → classNames.popup.root
      classNames={{ popup: { root: 'ds-suggest-dropdown' } }}
      // v11.2：统一浮动面板挂载策略 → 使用全局 smartPopupContainer
      //   自动检测 Modal/Drawer 上下文，不再用 z-index 数值竞争
      getPopupContainer={getPopupContainer ?? smartPopupContainer}
      filterOption={false}
      // v9.5：传占位 option，让 antd 认为有内容可显示（options=[] 会导致 onOpenChange 立即关闭下拉）
      //   实际列表渲染由 popupRender 中的 SuggestList 负责，占位 option 不渲染
      options={[{ value: '__suggest_placeholder__' }]}
      notFoundContent={null}
      // v9.5：下拉宽度自适应内容（不跟随窄输入框），与 ProductPicker FloatPanel 行为一致
      //   minWidth 保证不比内容窄，maxWidth 防止过宽
      popupMatchSelectWidth={false}
      // v9.5：列表渲染统一由 SuggestList 组件负责（与 ProductPicker 共用同一列表实现）
      popupRender={() => (
        <>
          {showDictEntry && (
            <PickerTreeViewBar
              views={DICT_ENTRY_VIEWS}
              value={viewMode}
              onChange={setViewMode}
            />
          )}
          <SuggestList
            options={viewMode === 'dict' ? filteredDictOptions : filteredOptions}
            loading={viewMode === 'dict' ? dictLoading : loading}
            keyword={searchKw}
            allowCreate={finalAllowCreate}
            onSelect={handleSelect}
            onCreate={handleCreate}
            createLoading={createLoading}
            // 行内管理（仅 existing 项 hover 显示）：改=确认层并档，删=单条确认
            onRename={showDictEntry ? openRenameGate : undefined}
            onDelete={showDictEntry ? confirmDelete : undefined}
            idleText={viewMode === 'dict' ? '字典为空' : undefined}
          />
        </>
      )}
      allowClear={allowClear}
      suffixIcon={null}
      onBlur={handleBlurInternal}
      onKeyDown={handleKeyDownInternal}
      onClick={onClick}
    />
    </div>
  );
}

/**
 * 对外导出：内包 PickerEditGateProvider——
 * 字典类字段的行内「改」在任何宿主（Modal/弹层/表格）都能打开确认层，
 * 不依赖外层是否已挂选品确认层框架。非字典字段该 Provider 零渲染成本。
 */
export function SuggestInput(props: SuggestInputProps) {
  return (
    <PickerEditGateProvider>
      <SuggestInputInner {...props} />
    </PickerEditGateProvider>
  );
}

export default SuggestInput;
