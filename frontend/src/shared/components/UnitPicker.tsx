// UnitPicker — v11.3 单位选择器（形态A：FloatPanel + useSuggest）
//
// v11.3 换单位=补充档案（对齐分类「没有就新增」范式）：
//   - 标准行（specId 提供）：在该 SKU 下检索/选择已有单位；
//     输入新单位名 → 「新增到该产品」（createUnit 建档）→ 用新单位 ID 绑定。
//     · 单位挂规格（unit.specId），isBase/isDisplay 标记，换算率在 brand_unit_conversion
//     · 新增单位自动为该 SKU 所有品牌关联建立换算率（默认 1）
//   - 非标行（无 specId）：展示「常见单位」列表（本地过滤，v11.11）——产品未建档时全局
//     匹配档案单位没有意义（输入「米」返回一堆含「米」的单位全是已存在），改为常见单位
//     直接点选快速录入；冷门单位直接输入 → 快速新建纯文字（unitId=null）
//
// 交互流程：
//   1. 输入框显示当前值，点击/聚焦 → 浮动面板展开
//   2. 标准行：加载该 SKU 全部单位（listUnits by specId），本地过滤
//      非标行：展示常见单位列表，输入关键词 → 本地过滤（无网络检索）
//   3. 下拉第一行（有未匹配关键词）：标准行=「新增到该产品」建档 / 非标行=「快速新建」
//   4. 点击已有单位 → onSelect({unitName, unitId}) → 关闭面板
//   5. 新增成功 → onSelect({unitName, unitId: 新单位ID}) → 关闭面板
//   6. Enter：标准行匹配本地单位选中 / 未匹配则新增；Escape：关闭面板

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import FloatPanel from './FloatPanel.js';
import DsInput from './DsInput.js';
import {
  createUnit,
  getSkuOptions,
  listUnits,
  resolveSpecBrand,
  type SkuOptionUnit,
  type UnitView,
} from '../services/api/baseDataApi.js';

/**
 * v11.11 常见单位（非标行快速录入用）：
 * 产品未建档时匹配档案单位无意义，改为预设常见单位直接点选——
 * 常见单位一眼可见直接选，冷门单位直接输入新建，无需滚动长列表。
 * 建材行业高频单位，覆盖度足够；语义清晰的可维护常量（非散落 magic value）。
 */
const COMMON_UNITS = [
  '米', '厘米', '毫米', '平方米', '立方米', '升',
  '个', '件', '箱', '包', '卷', '捆', '张', '套', '台',
  '公斤', '千克', '克', '吨',
  '支', '根', '条', '块', '片', '副', '对', '双', '次',
];

export interface UnitPickerProps {
  /** 当前单位值（受控显示） */
  value: string;
  /**
   * 选中单位后回调（回传单位名 + 单位 ID）。
   * unitId：标准行（specId 提供）下取档案单位 ID 或「新增到该产品」的新单位 ID；
   * 非标行（无 specId）直接输入/快速新建为 null。
   * 消费端必须同步更新 unit 文字与 unitId，防止「单位名与引用 ID 不一致」（使用-引用断裂）。
   */
  onSelect: (unit: {
    unitName: string;
    unitId: string | null;
    /** v11.14 换单位插入对应价格：该单位取值链（默认售价 → 推算售价 → 进价 → 0）；无价格数据时缺省 */
    price?: number | null;
    /** v11.14 单价来源（配合 price 着色：'sale' 普通 / 'derived' 推算色 / 'purchase' 进价红） */
    priceSource?: 'sale' | 'derived' | 'purchase' | null;
  }) => void;
  /** 浮动面板定位锚点 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 关闭回调（SuperGrid picker 模式通知 cancelEdit） */
  onClose?: () => void;
  /**
   * v11.3：SKU 规格变体 ID（标准行提供）。
   * 提供时：在该 SKU 下检索/选择已有单位；输入新单位名 → 「新增到该产品」（createUnit 建档绑定）。
   * 未提供（非标行）：useSuggest 全局单位检索 + 快速新建纯文字（unitId=null）。
   */
  specId?: string | null;
  /**
   * v11.14：关联品牌 ID（标准行提供）。
   * 提供时：按 specId+brandId 解析 specBrandId → getSkuOptions 加载该 SKU 全部单位
   * （含价格/换算率）——换单位自动插入对应价格（按来源着色），非基础单位显示换算链
   * （如「1 根 = 3 米」「1 捆 = 20 根 = 60 米」）。
   * 解析失败时退回 listUnits（仅单位名，无价格/换算）。
   */
  brandId?: string | null;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  autoFocus?: boolean;
  /** 是否员工端（默认 true，false 时调用 suggestPublic） */
  isStaff?: boolean;
  /**
   * v2.0 焦点总线契约：open 由 UnifiedTable activeCell 注入，Picker 不允许内部自管
   * - true：激活态，渲染输入框 + 浮动面板
   * - false：非激活态（非表格场景默认 true）
   */
  open?: boolean;
  /**
   * §2.1 关系表字段强约束（默认 false）：
   * - true：失焦/关闭面板时若 keyword 非空且未匹配档案，弹 Modal.confirm「是否新建补全？」
   *   用户确认 → onSelect(keyword)；用户取消 → 清空 keyword 并回滚（不调用 onSelect）
   * - false：保持当前行为，keyword 未匹配时直接快速新建（onSelect）
   */
  enforceRelation?: boolean;
}

/**
 * v9.0 单位标签格式（换算率已移至 brand_unit_conversion，不再显示）：
 * - 基础单位（isBase=true）：显示「{unitName} (基准)」
 * - 非基准：仅显示「{unitName}」
 * isDisplay 标记在列表项右侧单独展示（见渲染逻辑）
 */
function formatUnitLabel(u: UnitView): string {
  if (u.isBase) return `${u.unitName} (基准)`;
  return u.unitName;
}

/** 数字显示：整数直接显示，小数保留 2 位（去尾零） */
function fmtRate(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(2)));
}

/**
 * v11.14 换算链（用户反馈：单位面板显示换算关系，方便回答「一根多长/一捆多少根」）：
 * 按换算率从小到大逐级转换。如 rate 米=1 / 根=3 / 捆=60：
 *   - 根 → 「1 根 = 3 米」
 *   - 捆 → 「1 捆 = 20 根 = 60 米」（相邻级 20 根 + 兜底绝对换算 60 米）
 * @returns 空串表示基础单位（无换算）
 */
function buildConversionChain(
  target: SkuOptionUnit,
  units: SkuOptionUnit[],
  conv: Map<string, number>,
): string {
  const rate = conv.get(target.unitId);
  // 无换算率配置（该单位换算关系未知）或基础单位 → 不显示换算链
  if (rate == null || rate <= 1) return '';
  // 只纳入「已配置换算率」的单位（未配置的默认 1，不可与基础单位混淆参与逐级推导）
  const rated = units
    .filter((u) => conv.has(u.unitId))
    .map((u) => ({ u, r: conv.get(u.unitId) as number }));
  const baseName =
    rated.find((x) => x.r === 1)?.u.unitName ??
    (rated.length > 0 ? rated.reduce((a, b) => (a.r < b.r ? a : b)).u.unitName : '');
  if (!baseName) return '';
  // 换算率小于当前单位的全部单位，从大到小排列（相邻级逐级推导）
  const lower = rated
    .filter((x) => x.r > 0 && x.r < rate && x.u.unitId !== target.unitId)
    .sort((a, b) => b.r - a.r);
  if (lower.length === 0) return '';
  const segs: string[] = [];
  let prevR = rate;
  // 相邻级（不含最后一个=基础单位，基础单位用绝对换算数兜底，避免「3 米」与「60 米」重复）
  for (let i = 0; i < lower.length - 1; i++) {
    const { u, r } = lower[i];
    segs.push(`${fmtRate(prevR / r)} ${u.unitName}`);
    prevR = r;
  }
  segs.push(`${fmtRate(rate)} ${baseName}`);
  return `1 ${target.unitName} = ${segs.join(' = ')}`;
}

export default function UnitPicker({
  value,
  onSelect,
  anchorRef,
  onClose,
  open = true,
  specId = null,
  brandId = null,
  placeholder = '选择/输入单位',
  disabled = false,
  size = 'sm',
  autoFocus = false,
}: UnitPickerProps) {
  const { message, modal } = AntdApp.useApp();
  // v2.0 焦点总线契约：移除内部 open state，改为 prop 受控
  // keyword 是 UI state（输入框值），保留
  const [keyword, setKeyword] = useState(value || '');
  // 标准行（specId 提供）：该 SKU 的全部单位
  const [productUnits, setProductUnits] = useState<UnitView[]>([]);
  // v11.14：标准行 getSkuOptions 数据源（含价格 + 换算率）——优先于 listUnits
  const [skuUnits, setSkuUnits] = useState<SkuOptionUnit[]>([]);
  const [convMap, setConvMap] = useState<Map<string, number>>(new Map());
  /** v11.14 标准行数据源：'options'=getSkuOptions（含价格/换算）｜'units'=listUnits（仅单位名）｜null=未加载 */
  const [dataSource, setDataSource] = useState<'options' | 'units' | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  /** v11.3：新增单位到该 SKU 档案 loading（防止并发重复建档） */
  const [creating, setCreating] = useState(false);
  /** v11.8：新增单位确认弹窗防重入（失焦/Enter/按钮点击多路触发时只弹一次） */
  const confirmingRef = useRef(false);
  /** 输入框 wrapper（用于内层 FloatPanel 锚点） */
  const innerWrapRef = useRef<HTMLDivElement>(null);

  // v11.4：兜底 0 = 未关联规格（BigInt 序列化为字符串 "0"）→ 视为无规格（非标行常见单位）
  const hasSpec = specId != null && String(specId) !== '0';

  // v11.13 过滤生效判定：仅当用户修改过输入（keyword ≠ 当前单位值）时才过滤。
  //   展开时初始 keyword = 当前单位值，若直接参与过滤会把该 SKU 其他单位全部过滤掉
  //   （如当前「米」，20 个单位只剩「米」）——用户看不到可切换的其他单位。
  //   对齐需求：展开面板应展示全部单位供切换，输入关键词后才过滤。
  const filterActive =
    keyword.trim().length > 0 &&
    keyword.trim().toLowerCase() !== (value || '').toLowerCase();

  // v11.11 非标行（无 specId）常见单位本地过滤（无网络检索——产品未建档时全局匹配无意义）
  const filteredCommonUnits = useMemo(() => {
    if (!filterActive) return COMMON_UNITS;
    const kw = keyword.trim().toLowerCase();
    return COMMON_UNITS.filter((u) => u.toLowerCase().includes(kw));
  }, [filterActive, keyword]);

  // 受控显示：面板打开时显示关键词，关闭时显示 value
  const displayText = useMemo(() => (open ? keyword : value), [open, keyword, value]);

  // ---------- 标准行模式：加载该 SKU 全部单位 ----------
  // v11.14：优先 getSkuOptions(specBrandId)（单位含价格/换算率，支持换单位插入价格 + 换算链显示）；
  //   解析 specBrandId 失败 → 退回 listUnits（仅单位名，无价格/换算，行为同 v11.13 前）
  const loadProductUnits = useCallback(async () => {
    if (!specId || String(specId) === '0') {
      setProductUnits([]);
      setSkuUnits([]);
      setDataSource(null);
      return;
    }
    setProductLoading(true);
    try {
      let loadedOptions = false;
      if (brandId) {
        try {
          const r = await resolveSpecBrand(String(specId), String(brandId));
          if (r.specBrandId) {
            const result = await getSkuOptions(r.specBrandId);
            setSkuUnits(result.units ?? []);
            setConvMap(
              new Map((result.conversions ?? []).map((c) => [c.unitId, c.conversionRate])),
            );
            setDataSource('options');
            setProductUnits([]);
            loadedOptions = true;
          }
        } catch {
          // resolve/getSkuOptions 失败 → 走 listUnits 兜底
        }
      }
      if (!loadedOptions) {
        const result = await listUnits({ specId, page: 1, pageSize: 200 });
        setProductUnits(result.list ?? []);
        setSkuUnits([]);
        setDataSource('units');
      }
    } catch {
      setProductUnits([]);
      setSkuUnits([]);
      setDataSource(null);
    } finally {
      setProductLoading(false);
    }
  }, [specId, brandId]);

  // v2.0 焦点总线契约：open 变 true 时（挂载或外部激活）初始化 keyword + 加载产品单位
  // 替代原 handleOpen 的副作用（setOpen 已移除，由外部控制）
  useEffect(() => {
    if (open) {
      setKeyword(value || '');
      if (hasSpec) {
        void loadProductUnits();
      }
    }
    // 故意只依赖 open：value/hasSpec/loadProductUnits 在挂载时已通过初始值处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleKeywordChange = (v: string) => {
    setKeyword(v);
  };

  // ---------- 展开/关闭 ----------
  // v2.0 焦点总线契约：open 由外部控制，handleOpen 不再 setOpen
  // 副作用（setKeyword + loadProductUnits）由 useEffect 监听 open 处理
  const handleOpen = () => {
    if (disabled) return;
    // open 已由外部控制，这里不做任何事
  };

  const handleClose = () => {
    const trimmed = keyword.trim();
    // v11.3 直接输入模式：
    //   - 失焦时如果有关键词：
    //       · 标准行（specId）：未匹配档案 → 自动「新增到该产品」（建档绑定，而非纯文字）
    //       · 非标行（无 specId）：onSelect 纯文字（unitId=null，无档案可挂）
    //   - 无关键词 → onClose（取消路径，cancelAndClose）
    if (trimmed && trimmed.toLowerCase() !== (value || '').toLowerCase()) {
      if (hasSpec) {
        // v11.8：新增单位确认弹窗已弹出时失焦不再重复触发建档，直接关面板恢复原值
        if (confirmingRef.current) {
          onClose?.();
          setKeyword('');
          return;
        }
        void handleAddUnitToProduct(trimmed);
      } else {
        onSelect({ unitName: trimmed, unitId: null });
      }
    } else {
      onClose?.();
    }
    setKeyword('');
  };

  // ---------- 选择 ----------
  // v2.0 焦点总线契约：选择/新建走 onSelect（提交路径，commitCell 会 closeAfterCommit）
  // 不再调用 setOpen(false)（open 由外部控制）和 onClose（避免重复关闭）
  const handleSelectUnitName = (
    unitName: string,
    unitId: string | null = null,
    priceInfo?: { price: number; priceSource: 'sale' | 'derived' | 'purchase' | null },
  ) => {
    onSelect({
      unitName,
      unitId,
      price: priceInfo?.price ?? null,
      priceSource: priceInfo?.priceSource ?? null,
    });
    setKeyword('');
  };

  /**
   * v11.14 价格取值链（对齐产品选品）：
   *   默认售价 → 推算售价 → 进价兜底 → 0；换单位自动插入对应价格（按来源着色）
   */
  const pickPrice = (u: SkuOptionUnit): { price: number; priceSource: 'sale' | 'derived' | 'purchase' | null } => {
    if (u.defaultSalePrice != null) return { price: Number(u.defaultSalePrice), priceSource: 'sale' };
    if (u.derivedSalePrice != null) return { price: Number(u.derivedSalePrice), priceSource: 'derived' };
    if (u.defaultPurchasePrice != null) return { price: Number(u.defaultPurchasePrice), priceSource: 'purchase' };
    return { price: 0, priceSource: null };
  };

  /** v11.14 标准行 options 数据源（getSkuOptions）：选中单位 → 插入该单位对应价格 */
  const handleSelectSkuUnit = (u: SkuOptionUnit) => {
    onSelect({ unitName: u.unitName, unitId: u.unitId, ...pickPrice(u) });
    setKeyword('');
  };

  /**
   * v11.3 新增单位到该 SKU 档案（标准行；对齐分类「没有就新增」范式）：
   *   createUnit({ specId, unitName }) 建档 → 用新单位 ID 绑定（onSelect）
   *   · 该 SKU 下同名单位已存在 → 后端 422，提示用户从列表选择
   *   · 非标行（无 specId）：保持纯文字快速新建（unitId=null）
   */
  const handleAddUnitToProduct = async (unitName: string) => {
    const trimmed = unitName.trim();
    if (!trimmed) return;
    if (!hasSpec || !specId) {
      onSelect({ unitName: trimmed, unitId: null });
      setKeyword('');
      return;
    }
    if (creating || confirmingRef.current) return;
    confirmingRef.current = true;
    // v11.8 用户感知：建档（新增单位到该产品）前弹确认，防止误录累积垃圾单位。
    //   先关面板 + 清关键词，避免确认弹窗按钮 mousedown 被 FloatPanel 判为「点击外部」
    //   再次触发 handleClose → 重复弹确认。
    setKeyword('');
    onClose?.();
    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: '新增单位',
        content: `该产品暂无单位「${trimmed}」，确认新增到该产品档案？`,
        okText: '确认新增',
        cancelText: '取消',
        okButtonProps: { size: 'small' },
        cancelButtonProps: { size: 'small' },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    confirmingRef.current = false;
    if (!confirmed) {
      // 取消 → 不建档，保持原值（用户可重新点开下拉选择已有单位）
      message.info(`未新增单位「${trimmed}」，已保留原值`);
      return;
    }
    setCreating(true);
    try {
      const created = await createUnit({ specId, unitName: trimmed });
      // v11.14：新建单位无价格 → 插入 0（换单位=换该单位行情价，无价即空待录）
      onSelect({ unitName: created.unitName, unitId: created.id, price: 0, priceSource: null });
      setKeyword('');
    } catch (e) {
      message.error((e as Error).message || '新增单位失败');
    } finally {
      setCreating(false);
    }
  };

  // ---------- 键盘交互 ----------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = keyword.trim();
      if (!trimmed) return;
      if (hasSpec) {
        // 标准行：优先匹配本地（该 SKU）单位（v11.14：options 数据源含价格 → 走 handleSelectSkuUnit）
        if (dataSource === 'options') {
          const matched = skuUnits.find(
            (u) => u.unitName.toLowerCase() === trimmed.toLowerCase(),
          );
          if (matched) {
            handleSelectSkuUnit(matched);
          } else {
            void handleAddUnitToProduct(trimmed);
          }
        } else {
          const matched = productUnits.find(
            (u) => u.unitName.toLowerCase() === trimmed.toLowerCase(),
          );
          if (matched) {
            handleSelectUnitName(matched.unitName, matched.id);
          } else {
            void handleAddUnitToProduct(trimmed);
          }
        }
      } else {
        const matched = filteredCommonUnits.find(
          (u) => u.toLowerCase() === trimmed.toLowerCase(),
        );
        if (matched) {
          handleSelectUnitName(matched);
        } else {
          handleQuickCreate();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  // 非标行快速新建（纯文字，unitId=null）
  const handleQuickCreate = () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    onSelect({ unitName: trimmed, unitId: null });
    setKeyword('');
  };

  // ---------- 过滤（标准行本地过滤） ----------
  // v11.13：初始关键词（=当前单位值）不参与过滤，展开时展示该 SKU 全部单位供切换
  // v11.14：options 数据源（getSkuOptions，含价格/换算）与 units 数据源（listUnits）共用过滤
  const filteredSkuUnits = useMemo(() => {
    if (!hasSpec || dataSource !== 'options') return [];
    if (!filterActive) return skuUnits;
    const kw = keyword.trim().toLowerCase();
    return skuUnits.filter((u) => u.unitName.toLowerCase().includes(kw));
  }, [hasSpec, dataSource, filterActive, keyword, skuUnits]);

  const filteredProductUnits = useMemo(() => {
    if (!hasSpec || dataSource !== 'units') return [];
    if (!filterActive) return productUnits;
    const kw = keyword.trim().toLowerCase();
    return productUnits.filter((u) => u.unitName.toLowerCase().includes(kw));
  }, [hasSpec, dataSource, filterActive, keyword, productUnits]);

  // 判断关键词是否已在产品单位列表内（控制新增行显示）
  const isKeywordInProductUnits = useMemo(() => {
    if (!hasSpec) return false;
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return false;
    const pool = dataSource === 'options' ? skuUnits : productUnits;
    return pool.some((u) => u.unitName.toLowerCase() === trimmed);
  }, [hasSpec, dataSource, keyword, skuUnits, productUnits]);

  // 非标行：判断关键词是否已在常见单位内（控制新建行显示）
  const isKeywordInCommonUnits = useMemo(() => {
    if (hasSpec) return false;
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return false;
    return COMMON_UNITS.some((u) => u.toLowerCase() === trimmed);
  }, [hasSpec, keyword]);

  // 内层锚点：优先用 innerWrapRef，回退到外部 anchorRef
  const innerAnchor = (innerWrapRef.current ? innerWrapRef : anchorRef) as React.RefObject<HTMLElement | null>;

  const showQuickCreate =
    keyword.trim().length > 0 &&
    (!hasSpec || !isKeywordInProductUnits) &&
    (hasSpec || !isKeywordInCommonUnits);
  const loading = hasSpec ? productLoading : false;

  return (
    <>
      <div ref={innerWrapRef} data-shared-badge="C25" style={{ position: 'relative', width: '100%' }}>
        <DsInput
          variant="embedded"
          size={size}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={displayText}
          disabled={disabled}
          onChange={(e) => {
            // v2.0 焦点总线契约：open 由外部控制，输入不再触发 setOpen
            handleKeywordChange(e.target.value);
          }}
          onFocus={handleOpen}
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          style={{ width: '100%' }}
        />
      </div>

      <FloatPanel
        open={open}
        anchorRef={innerAnchor}
        onClose={handleClose}
        maxHeight={340}
        offset={2}
        style={{ padding: 0 }}
      >
        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* 首位：标准行=「新增到该产品」建档 / 非标行=「快速新建」纯文字
              （有关键词且不在列表内时显示）—— 深色系半透明绿 + PlusOutlined（对齐 SuggestList 规范） */}
          {showQuickCreate && (
            <button
              type="button"
              onClick={() => (hasSpec ? void handleAddUnitToProduct(keyword) : handleQuickCreate())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '4px 8px',
                border: 'none',
                borderBottom: '1px solid var(--border-neutral-l1)',
                background: 'var(--bg-brand-popup)',
                color: 'var(--text-brand)',
                cursor: creating ? 'wait' : 'pointer',
                textAlign: 'left',
                fontSize: 'var(--body-xs-font-size)',
                lineHeight: 1.4,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                if (!creating) e.currentTarget.style.background = 'var(--bg-brand-disabled)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-brand-popup)';
              }}
            >
              {creating ? (
                <Spin size="small" />
              ) : (
                <PlusOutlined style={{ fontSize: 12 }} />
              )}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {hasSpec ? `新增到该产品: ${keyword.trim()}` : `快速新建: ${keyword.trim()}`}
              </span>
            </button>
          )}

          {loading ? (
            <div style={{ padding: '12px 8px', textAlign: 'center' }}>
              <Spin size="small" />
            </div>
          ) : hasSpec && dataSource === 'options' ? (
            /* v11.14 标准行 options 数据源（getSkuOptions）：单位名 + 换算链（非基础单位），
               选中 → 插入该单位对应价格（按来源着色） */
            filteredSkuUnits.length === 0 ? (
              <div
                style={{
                  padding: '12px 8px',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                  textAlign: 'center',
                }}
              >
                {keyword.trim()
                  ? '未匹配到该产品的单位，可点上方新建'
                  : skuUnits.length === 0
                    ? '该产品暂无单位，输入后点上方新建'
                    : '该产品暂无匹配单位'}
              </div>
            ) : (
              filteredSkuUnits.map((u) => {
                const isActive = u.unitName === value;
                const chain = buildConversionChain(u, skuUnits, convMap);
                return (
                  <button
                    key={u.unitId}
                    type="button"
                    onClick={() => handleSelectSkuUnit(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      padding: '4px 8px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      background: isActive ? 'var(--bg-brand-popup)' : 'transparent',
                      color: isActive ? 'var(--text-brand)' : 'var(--text-default)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 'var(--body-xs-font-size)',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.isBase ? `${u.unitName} (基准)` : u.unitName}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-tertiary)',
                        fontSize: 11,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        paddingLeft: 8,
                      }}
                    >
                      {chain || (u.isDisplay ? '显示' : '')}
                    </span>
                  </button>
                );
              })
            )
          ) : hasSpec ? (
            /* 标准行 units 数据源（listUnits 兜底，无价格/换算）：展示该 SKU 的单位列表 */
            filteredProductUnits.length === 0 ? (
              <div
                style={{
                  padding: '12px 8px',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                  textAlign: 'center',
                }}
              >
                {keyword.trim()
                  ? '未匹配到该产品的单位，可点上方新建'
                  : productUnits.length === 0
                    ? '该产品暂无单位，输入后点上方新建'
                    : '该产品暂无匹配单位'}
              </div>
            ) : (
              filteredProductUnits.map((u) => {
                const label = formatUnitLabel(u);
                const isActive = u.unitName === value;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUnitName(u.unitName, u.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      padding: '4px 8px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      background: isActive ? 'var(--bg-brand-popup)' : 'transparent',
                      color: isActive ? 'var(--text-brand)' : 'var(--text-default)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 'var(--body-xs-font-size)',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{label}</span>
                    <span
                      style={{
                        color: 'var(--text-tertiary)',
                        fontSize: 11,
                        fontFamily: 'var(--font-family-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {u.isBase ? '· 基准' : ''}
                      {u.isDisplay ? ' · 显示' : ''}
                    </span>
                  </button>
                );
              })
            )
          ) : (
            /* 非标行模式（无 specId）：展示常见单位列表（v11.11 本地过滤，无网络检索） */
            filteredCommonUnits.length === 0 ? (
              <div
                style={{
                  padding: '12px 8px',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                  textAlign: 'center',
                }}
              >
                {keyword.trim()
                  ? '常见单位无匹配，可点上方快速新建'
                  : '输入关键词过滤常见单位'}
              </div>
            ) : (
              filteredCommonUnits.map((unitName, idx) => {
                const isActive = unitName === value;
                return (
                  <button
                    key={`${unitName}-${idx}`}
                    type="button"
                    onClick={() => handleSelectUnitName(unitName)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      width: '100%',
                      padding: '4px 8px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      background: isActive ? 'var(--bg-brand-popup)' : 'transparent',
                      color: isActive ? 'var(--text-brand)' : 'var(--text-default)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 'var(--body-xs-font-size)',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {unitName}
                    </span>
                    {!keyword.trim() && (
                      <span
                        style={{
                          color: 'var(--text-tertiary)',
                          fontSize: 11,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        常用
                      </span>
                    )}
                  </button>
                );
              })
            )
          )}
        </div>
      </FloatPanel>
    </>
  );
}
