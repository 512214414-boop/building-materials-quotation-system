// v9.2 单单位价格展开面板（公共组件，产品编辑弹窗与产品列表共用）
//
// 设计原则（ask3+ask5）：
//   - 产品编辑弹窗与产品列表的价格单元格使用同一个 UnitPriceExpandPanel 组件
//   - 列表价格显示以 isDefault=true 为准（与编辑弹窗一致）
//   - 浮动面板内可通过 Tab 切换售价明细/进价明细
//   - 单位从标题括号抽出，做成下拉切换（个▽），只能在已存在单位间切换
//
// 面板结构（ask4：售价/进价完全对等）：
//   顶部：Tab 切换 [售价明细 | 进价明细]  +  单位切换下拉（个▽）
//   表格：名称(10em) | 价格(5em) | 默认(32px) | 操作(28px)
//   末尾：空行用于新增

import { useEffect, useRef, useState } from 'react';
import { App as AntdApp } from 'antd';
import { SuggestInput, DsInput, DictRefField } from './index.js';
import DsButton from './DsButton.js';
import MatrixTable, { type MatrixRowConfig } from './MatrixTable.js';
import RecordExpandPanel from './RecordExpandPanel.js';
import { supplierDict } from '../config/recordDicts.js';
import { calcEffectivePrice } from '../utils/format.js';
import { calcDerivedUnitPrice } from '../engines/pricing-engine.js';
import { sortUnitsByRate } from '../utils/unitRateText.js';
import {
  createPriceType,
  listPriceTypes,
  quickAddSupplier,
  updatePriceType,
  deletePriceType,
  type PriceTypeView,
} from '../services/api/baseDataApi.js';

// ============================================================
// §1 数据类型（与 ProductEditDialog 共享）
// ============================================================

/** 售价项（SKU 级，brandIdx + unitIdx 索引） */
export interface SalePriceItem {
  rowKey: string;
  brandIdx: number;
  unitIdx: number;
  /** v9.2：价格类型 ID（关联 price_type 字典表） */
  priceTypeId: string;
  /** v9.2：价格类型名称（用于显示） */
  priceTypeName: string;
  price: string;
  /** v9.1：是否默认售价（同 SKU 下互斥） */
  isDefault: boolean;
}

/** 进价项（SKU 级，supplierId 替代 supplierName + isDefault） */
export interface PurchasePriceItem {
  rowKey: string;
  brandIdx: number;
  unitIdx: number;
  /** v9.0：供应商 ID（BigInt 序列化 string） */
  supplierId: string;
  /** v9.0：供应商名称（用于显示） */
  supplierName: string;
  /** v9.0：是否默认供应商 */
  isDefault: boolean;
  /** v12.0：面价（录入值，点位变化不改变） */
  price: string;
  /** v12.0：该组点位（来自 supplier_point_rule，无规则默认 1） */
  point?: number | null;
  /** v12.0：进价 = 面价 × 点位（无点位规则时 = 面价） */
  effectivePrice?: number | null;
}

/** 单位选项（面板内下拉切换用） */
export interface UnitOption {
  /** unitIdx（在 brands/units 数组中的索引） */
  idx: number;
  /** 单位名称 */
  name: string;
}

// ============================================================
// §2 工具函数
// ============================================================

let rowKeyCounter = 0;
export function genRowKey(prefix: string): string {
  rowKeyCounter += 1;
  return `${prefix}_${Date.now()}_${rowKeyCounter}`;
}

// ============================================================
// §3 通用样式
// ============================================================

// v10.2：样式统一由 DsInput variant 体系 + elements.css 处理
//   - 名称列：SuggestInput（内部加 ds-suggest-input CSS 类，视觉与 DsInput 一致）
//   - 价格列：DsInput variant="price"（等宽 + 居中 + 可选红色 numericColor）
//   删除散落的 buildPriceInputStyle / NAME_INPUT_STYLE 临时常量
const NAME_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  fontSize: 'var(--body-xs-font-size)',
};

// ============================================================
// §4 供应商检索输入框（进价面板名称列）
// v9.4：已抽象为通用 SuggestInput（shared/components/SuggestInput.tsx）
//   售价价格类型 / 进价供应商 统一使用 SuggestInput，行为完全一致
//   差异仅通过 props 体现：field='priceType' | 'supplier'
// ============================================================
// v1.7.1.5：矩阵表格已收敛为共享组件 MatrixTable（shared/components/MatrixTable.tsx），
//   售价/进价/联系信息矩阵同一实现，差异仅 props 注入；内部 PriceMatrixTable 已删除

// ============================================================
// §5 价格矩阵表格 → 已收敛为共享组件 MatrixTable
// v1.7.1.5：售价/进价/联系信息矩阵同一实现（shared/components/MatrixTable.tsx），
//   差异仅通过 props 注入（表头文字、名称列 cell、值列渲染、默认列位置、空行交互）
// ============================================================

// ============================================================
// §6 单单位价格展开面板（公共组件，产品编辑弹窗与产品列表共用）
// ============================================================

interface UnitPriceExpandPanelProps {
  /** 当前选中的单位 idx */
  unitIdx: number;
  /** 当前单位名称（用于显示） */
  unitName: string;
  /** 可切换的单位列表（已存在单位，不含新增） */
  units: UnitOption[];
  /** 单位切换回调 */
  onUnitChange: (unitIdx: number) => void;
  /** 当前品牌索引 */
  brandIdx: number;
  /**
   * v1.5.4：各单位的换算率数组（索引与 units 对齐，基准单位=1，无换算率=null）
   * 用于「售价兜底」：某单位未录售价时，按基准单位售价 × 该单位换算率推算展示（不写库）
   */
  unitConversions?: Array<number | null>;
  /** 当前品牌的所有售价 */
  salePrices: SalePriceItem[];
  onSalePricesChange: (prices: SalePriceItem[]) => void;
  /** 当前品牌的所有进价 */
  purchasePrices: PurchasePriceItem[];
  onPurchasePricesChange: (prices: PurchasePriceItem[]) => void;
  /** v9.2：全局价格类型字典 */
  priceTypes: PriceTypeView[];
  /** v9.2：价格类型字典变更回调 */
  onPriceTypesChange: (priceTypes: PriceTypeView[]) => void;
  /** 初始展示的 Tab：售价/进价 */
  defaultTab?: 'sale' | 'purchase';
  /** v10.4：面板是否展开，open 从 false→true 时重置 Tab 到 defaultTab */
  open?: boolean;
  /** v11.3：点击点位 → 打开批量调整进价弹窗（上下文由调用方在回调内自行组装） */
  onEditPoint?: (purchase: PurchasePriceItem) => void;
  /** v2.0：当前显示的售价类型 ID（本地态，单元格显示跟随；面板行点击切换） */
  selectedSalePriceTypeId?: string;
  /** v2.0：切换当前显示的售价类型（本地态，不落库） */
  onSaleSelect?: (priceTypeId: string) => void;
  /** v2.0：当前显示的进价供应商 ID（本地态，单元格显示跟随；面板行点击切换） */
  selectedPurchaseSupplierId?: string;
  /** v2.0：切换当前显示的进价供应商（本地态，不落库） */
  onPurchaseSelect?: (supplierId: string) => void;
  disabled?: boolean;
}

export function UnitPriceExpandPanel({
  unitIdx,
  unitName,
  units,
  onUnitChange,
  brandIdx,
  unitConversions,
  salePrices,
  onSalePricesChange,
  purchasePrices,
  onPurchasePricesChange,
  priceTypes,
  onPriceTypesChange,
  defaultTab = 'sale',
  open,
  onEditPoint,
  selectedSalePriceTypeId,
  onSaleSelect,
  selectedPurchaseSupplierId,
  onPurchaseSelect,
  disabled,
}: UnitPriceExpandPanelProps) {
  const [tab, setTab] = useState<'sale' | 'purchase'>(defaultTab);
  const { message, modal } = AntdApp.useApp();

  // v10.4：面板每次展开时重置 Tab 到 defaultTab
  //   修复原缺陷：defaultTab 仅首次挂载生效，用户在面板内切到进价 Tab 后关闭重开，
  //   Tab 仍停留在进价（应回到售价，因为这是售价单元格触发的面板）
  //   实现：监听 open 从 false→true 的瞬间，setTab(defaultTab)
  //   注意：不依赖 defaultTab 变化（每个面板实例 defaultTab 固定），而是依赖 open 变化
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (!prevOpenRef.current && open) {
      // false → true：面板刚打开，重置 Tab
      setTab(defaultTab);
    }
    prevOpenRef.current = open;
  }, [open, defaultTab]);

  // 售价末尾空行（新增价格类型字典项）
  const [addPriceTypeName, setAddPriceTypeName] = useState('');
  const [addSalePriceVal, setAddSalePriceVal] = useState('');
  // 售价名称编辑临时态
  const [editingPriceTypeName, setEditingPriceTypeName] = useState<Record<string, string>>({});

  // 进价末尾空行
  const [addPurchaseSupplierId, setAddPurchaseSupplierId] = useState('');
  // v14.2：进价推算行面价输入值（key=推算行 rowKey）——推算显示在面价输入框内，输入/失焦即创建真实行
  const [derivedFaceVals, setDerivedFaceVals] = useState<Record<string, string>>({});
  const [addPurchaseSupplierName, setAddPurchaseSupplierName] = useState('');
  const [addPurchasePriceVal, setAddPurchasePriceVal] = useState('');

  // ===== 售价处理 =====
  const unitSalePrices = salePrices.filter((p) => p.unitIdx === unitIdx);

  const handleSalePriceChange = (priceTypeId: string, priceTypeName: string, val: string) => {
    const existing = salePrices.find((x) => x.unitIdx === unitIdx && x.priceTypeId === priceTypeId);
    if (existing) {
      if (val.trim() === '') {
        onSalePricesChange(salePrices.filter((p) => p.rowKey !== existing.rowKey));
      } else {
        onSalePricesChange(salePrices.map((p) => (p.rowKey === existing.rowKey ? { ...p, price: val } : p)));
      }
    } else if (val.trim() !== '') {
      onSalePricesChange([
        ...salePrices,
        { rowKey: `sale_${brandIdx}_${unitIdx}_${priceTypeId}`, brandIdx, unitIdx, priceTypeId, priceTypeName, price: val, isDefault: false },
      ]);
    }
  };

  const handleSaleIsDefaultChange = (priceTypeId: string, isDefault: boolean) => {
    onSalePricesChange(
      salePrices.map((p) => {
        if (p.unitIdx !== unitIdx) return p;
        if (p.priceTypeId === priceTypeId) return { ...p, isDefault };
        if (isDefault) return { ...p, isDefault: false };
        return p;
      }),
    );
  };

  const handlePriceTypeNameBlur = (pt: PriceTypeView) => {
    const editing = editingPriceTypeName[pt.id];
    if (editing === undefined) return;
    setEditingPriceTypeName((prev) => {
      const next = { ...prev };
      delete next[pt.id];
      return next;
    });
    const newName = editing.trim();
    if (!newName || newName === pt.name) return;
    if (priceTypes.some((p) => p.id !== pt.id && p.name === newName)) {
      message.warning(`价格类型「${newName}」已存在，不可重复`);
      return;
    }
    modal.confirm({
      title: '修改价格类型名称',
      content: `价格类型「${pt.name}」是全局共享字典项，修改后将影响所有产品。确认改为「${newName}」？`,
      okText: '确认修改',
      cancelText: '取消',
      onOk: async () => {
        try {
          await updatePriceType(pt.id, { name: newName });
          onPriceTypesChange(priceTypes.map((p) => (p.id === pt.id ? { ...p, name: newName } : p)));
          onSalePricesChange(salePrices.map((p) => (p.priceTypeId === pt.id ? { ...p, priceTypeName: newName } : p)));
          message.success('价格类型名称已更新');
        } catch {
          message.error('修改失败，请重试');
        }
      },
    });
  };

  const handleDeletePriceType = (pt: PriceTypeView) => {
    const refCount = salePrices.filter((p) => p.priceTypeId === pt.id).length;
    modal.confirm({
      title: '删除价格类型',
      content: `价格类型「${pt.name}」是全局共享字典项，删除后将影响所有产品${
        refCount > 0 ? `，且当前有 ${refCount} 条售价记录将被一并删除` : ''
      }。确认删除？`,
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await deletePriceType(pt.id);
          onPriceTypesChange(priceTypes.filter((p) => p.id !== pt.id));
          onSalePricesChange(salePrices.filter((p) => p.priceTypeId !== pt.id));
          message.success('价格类型已删除');
        } catch {
          message.error('删除失败，可能存在关联售价记录，请先迁移');
        }
      },
    });
  };

  const handleAddPriceTypeCommit = () => {
    const name = addPriceTypeName.trim();
    // v13.1：价格类型可空——只填价格未输类型名时，自动归入系统默认「零售价」（数据规范.md 缺省值注册表）
    if (!name && !addSalePriceVal.trim()) {
      setAddSalePriceVal('');
      return;
    }
    const targetName = name || '零售价';
    const existing = priceTypes.find((p) => p.name === targetName);
    if (existing) {
      // 输入了已存在的类型名 → 提示去上方行直接编辑（保持原行为）
      // 只填价格未输类型名 → 自动归入「零售价」（v13.1 缺省值注册表）
      if (name) {
        message.warning(`价格类型「${name}」已存在，可在上方行直接编辑`);
        setAddPriceTypeName('');
        setAddSalePriceVal('');
        return;
      }
      if (addSalePriceVal.trim()) {
        onSalePricesChange([
          ...salePrices,
          { rowKey: `sale_${brandIdx}_${unitIdx}_${existing.id}`, brandIdx, unitIdx, priceTypeId: existing.id, priceTypeName: existing.name, price: addSalePriceVal.trim(), isDefault: false },
        ]);
      }
      setAddPriceTypeName('');
      setAddSalePriceVal('');
      return;
    }
    createPriceType({ name: targetName, status: 1 })
      .then((newPt) => {
        onPriceTypesChange([...priceTypes, newPt]);
        if (addSalePriceVal.trim()) {
          onSalePricesChange([
            ...salePrices,
            { rowKey: `sale_${brandIdx}_${unitIdx}_${newPt.id}`, brandIdx, unitIdx, priceTypeId: newPt.id, priceTypeName: newPt.name, price: addSalePriceVal.trim(), isDefault: false },
          ]);
        }
        setAddPriceTypeName('');
        setAddSalePriceVal('');
      })
      .catch(() => message.error('新增价格类型失败，请重试'));
  };

  // ===== 进价处理 =====
  const unitPurchasePrices = purchasePrices.filter((p) => p.unitIdx === unitIdx);

  const handlePurchaseSupplierChange = (rowKey: string, newId: string, newName: string) => {
    const dup = purchasePrices.find((x) => x.rowKey !== rowKey && x.unitIdx === unitIdx && x.supplierId === newId && newId !== '');
    if (newId && dup) {
      message.warning(`供应商「${newName}」已存在，不可重复`);
      return;
    }
    onPurchasePricesChange(purchasePrices.map((p) => (p.rowKey === rowKey ? { ...p, supplierId: newId, supplierName: newName } : p)));
  };

  const handlePurchasePriceChange = (rowKey: string, val: string) => {
    onPurchasePricesChange(purchasePrices.map((p) => (p.rowKey === rowKey ? { ...p, price: val } : p)));
  };

  const handleIsDefaultChange = (supplierId: string, isDefault: boolean) => {
    onPurchasePricesChange(
      purchasePrices.map((p) => {
        if (p.unitIdx !== unitIdx) return p;
        if (p.supplierId === supplierId) return { ...p, isDefault };
        if (isDefault) return { ...p, isDefault: false };
        return p;
      }),
    );
  };

  const handleDeletePurchaseRow = (rowKey: string) => {
    onPurchasePricesChange(purchasePrices.filter((p) => p.rowKey !== rowKey));
  };

  const handleAddPurchaseRowCommit = async () => {
    const sname = addPurchaseSupplierName.trim();
    // v13.0：供应商允许后补——只填价格即可添加；供应商为空由后端补系统默认「面价渠道」
    if (!addPurchasePriceVal.trim() && !sname) {
      setAddPurchasePriceVal('');
      setAddPurchaseSupplierId('');
      return;
    }
    let sid = addPurchaseSupplierId.trim();
    // v9.4：用户输入名称但未选中已有项（id 为空），尝试建档
    if (!sid && sname) {
      try {
        const newSupplier = await quickAddSupplier({ name: sname });
        sid = newSupplier.id;
      } catch {
        message.error('新建供应商失败，请重试');
        return;
      }
    }
    // sid 为空（只填价格）：进价行供应商留空，保存时后端补默认「面价渠道」
    const dup = purchasePrices.find((x) => x.unitIdx === unitIdx && x.supplierId === sid);
    if (dup) {
      message.warning(sname ? `供应商「${sname}」已存在，不可重复` : '该 SKU 已存在默认供应商进价，可直接编辑');
      return;
    }
    onPurchasePricesChange([
      ...purchasePrices,
      { rowKey: `purchase_${brandIdx}_${unitIdx}_${sid}`, brandIdx, unitIdx, supplierId: sid, supplierName: sname, isDefault: false, price: addPurchasePriceVal.trim() },
    ]);
    setAddPurchaseSupplierId('');
    setAddPurchaseSupplierName('');
    setAddPurchasePriceVal('');
  };

  // v14.2：进价推算行「输入即录」——推算面价显示在输入框内（placeholder），输入有效值失焦/Enter 创建真实行
  //   对齐售价明细推算范式（推算显示在输入框内，点击马上可输入真实价）
  const handleAddDerivedPurchaseCommit = (rowKey: string, bp: PurchasePriceItem) => {
    const val = (derivedFaceVals[rowKey] ?? '').trim();
    if (!val || isNaN(parseFloat(val))) {
      // 无效输入 → 清空但保留推算占位行
      if (val) setDerivedFaceVals((prev) => ({ ...prev, [rowKey]: '' }));
      return;
    }
    // 同单位同供应商已存在（防重复）
    if (purchasePrices.some((x) => x.unitIdx === unitIdx && x.supplierId === bp.supplierId)) {
      message.warning(`供应商「${bp.supplierName}」已存在，可直接编辑`);
      setDerivedFaceVals((prev) => ({ ...prev, [rowKey]: '' }));
      return;
    }
    onPurchasePricesChange([
      ...purchasePrices,
      {
        rowKey: `purchase_${brandIdx}_${unitIdx}_${bp.supplierId}`,
        brandIdx,
        unitIdx,
        supplierId: bp.supplierId,
        supplierName: bp.supplierName,
        isDefault: false,
        price: val,
      },
    ]);
    setDerivedFaceVals((prev) => ({ ...prev, [rowKey]: '' }));
  };

  // ===== 售价表格行配置（注入名称列 SuggestInput）=====
  // v1.5.4：售价兜底——基准单位（换算率=1）已录售价、当前单位未录时，
  //   按 基准价 × 当前单位换算率 推算展示（placeholder + 「推算」标识 + 虚线边框），
  //   仅前端展示不写库（很多产品遵循自动换算，但按个/按箱等可能有独立定价，不干扰用户输入）
  const baseUnitIdx = unitConversions?.findIndex((r) => r === 1) ?? -1;
  // v2.0：可切换显示的售价/进价行集合（已录价或可推算才可切换显示；空行不可切换）
  const saleSelectableRowKeys = new Set<string>();
  const purchaseSelectableRowKeys = new Set<string>();
  const calcFallbackSalePrice = (ptId: string): number | null => {
    if (unitConversions == null || baseUnitIdx < 0 || baseUnitIdx === unitIdx) return null;
    const rate = unitConversions[unitIdx];
    if (rate == null || rate === 1) return null;
    const baseSp = salePrices.find(
      (p) => p.unitIdx === baseUnitIdx && p.priceTypeId === ptId && p.price.trim() !== '',
    );
    if (!baseSp) return null;
    const basePrice = parseFloat(baseSp.price);
    if (isNaN(basePrice)) return null;
    // v1.5.6.3：推算公式统一走 calcDerivedUnitPrice（pricing-engine，SSOT，禁止本地重写）
    return calcDerivedUnitPrice(basePrice, rate);
  };

  const saleRows: MatrixRowConfig[] = priceTypes.map((pt) => {
    const sp = unitSalePrices.find((p) => p.priceTypeId === pt.id);
    const priceVal = sp?.price ?? '';
    const isDefault = sp?.isDefault ?? false;
    // v2.0：rowKey 统一为稳定 key（含 priceTypeId），selectKey = 价格类型 ID（切换选中业务 key）
    const rowKey = `sale_${brandIdx}_${unitIdx}_${pt.id}`;
    const editingName = editingPriceTypeName[pt.id] ?? pt.name;
    const fallbackPrice = priceVal.trim() === '' ? calcFallbackSalePrice(pt.id) : null;
    // v2.0：已录价或有推算占位 → 可切换显示；否则（空行）不可切换
    if (priceVal.trim() !== '' || fallbackPrice != null) saleSelectableRowKeys.add(rowKey);
    return {
      rowKey,
      selectKey: pt.id,
      nameCell: (
        <SuggestInput
          field="priceType"
          value={editingName}
          onChange={(val) => setEditingPriceTypeName((prev) => ({ ...prev, [pt.id]: val }))}
          onBlur={() => handlePriceTypeNameBlur(pt)}
          placeholder="价格类型"
          disabled={disabled}
          allowCreate={false}
          style={NAME_INPUT_STYLE}
        />
      ),
      price: priceVal,
      onPriceChange: (val) => handleSalePriceChange(pt.id, pt.name, val),
      // v1.5.4：推算价占位显示（点击输入框即空，输入真实价覆盖）
      priceRender:
        fallbackPrice != null ? (
          <div style={{ position: 'relative' }}>
            <DsInput
              size="sm"
              variant="price"
              value={priceVal}
              onChange={(e) => handleSalePriceChange(pt.id, pt.name, e.target.value)}
              inputMode="decimal"
              placeholder={String(fallbackPrice)}
              disabled={disabled}
              // v1.8：推算占位统一系统补全语义色（醒目，禁止暗色）
              // v14.2：placeholder 颜色经 placeholderColor 注入（style.color 对 ::placeholder 无效）
              style={{ borderStyle: 'dashed' }}
              placeholderColor="var(--text-placeholder-accent)"
              title={`按基准单位售价 × 换算率推算（待补充），输入实际价后写入`}
            />
            {/* v14.2：推算标签改为右侧垂直居中（原 right:3/bottom:1 右下角靠拢，与全局居中视觉不统一） */}
            <span
              style={{
                position: 'absolute',
                right: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 9,
                lineHeight: 1,
                color: 'var(--text-placeholder-accent)',
                pointerEvents: 'none',
              }}
            >
              推算
            </span>
          </div>
        ) : undefined,
      isDefault,
      onIsDefaultChange: () => handleSaleIsDefaultChange(pt.id, !isDefault),
      defaultTitle: isDefault ? '当前默认售价' : '设为默认售价',
      defaultDisabled: !priceVal && fallbackPrice == null,
      onDelete: () => handleDeletePriceType(pt),
      deleteTitle: '删除价格类型（影响全局）',
    };
  });

  // ===== 进价表格行配置（注入名称列 SuggestInput）=====
  // v12.0 定价语义：price 存「面价」（面价列输入框编辑），进价 = 面价 × 点位（价格列只读展示）
  //   - 点位列可点击进入批量调整弹窗（点位是组级规则，按 供应商+品牌+分类 圈组批量更新）
  const purchaseRows: MatrixRowConfig[] = unitPurchasePrices.map((pp) => {
    const pointVal = pp.point ?? 1;
    // v12.0：进价 = 面价 × 点位（calcEffectivePrice 单一实现，与后端一致 round2）
    const effectiveVal = (() => {
      const eff = calcEffectivePrice(pp);
      return isNaN(eff) ? null : eff;
    })();
    // v2.0：有效进价 → 可切换显示（空进价行不可切换）；selectKey = 供应商 ID（切换选中业务 key）
    if (effectiveVal != null) purchaseSelectableRowKeys.add(pp.rowKey);
    return {
      rowKey: pp.rowKey,
      selectKey: pp.supplierId,
      nameCell: (
        // v14.2：供应商为全局档案引用 → DictRefCell 统一语义
        //   （匹配复用/快捷新建/失焦解析统一带 id；根治原 onChange 改 name 保留旧 id 的静默失效）
        // v14.3：同质同构根上收敛 → DictRefField（输入框 + 管理下拉按钮 + 供应商档案面板 一体化），
        //   改档案名走管理面板（所有引用方跟随），输入匹配 = 换引用
        <DictRefField
          field="supplier"
          value={pp.supplierName}
          onResolve={(item) => handlePurchaseSupplierChange(pp.rowKey, item.id, item.name)}
          currentId={pp.supplierId}
          dict={supplierDict}
          placeholder="供应商A"
          disabled={disabled}
          inputStyle={{ fontSize: 'var(--body-xs-font-size)' }}
        />
      ),
      midCells: [
        <DsInput
          key="face"
          size="sm"
          variant="price"
          numericColor="var(--status-danger-default)"
          value={pp.price}
          onChange={(e) => handlePurchasePriceChange(pp.rowKey, e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          disabled={disabled}
          title="面价（录入值，进价 = 面价 × 点位）"
        />,
        <DsButton
          key="point"
          size="sm"
          variant="ghost"
          onClick={() => onEditPoint?.(pp)}
          style={{ padding: '0 6px', height: 20, fontSize: 11, minWidth: 40 }}
          title={`当前点位 ${pointVal}，点击按新点位批量调整该组进价（进价 = 面价 × 点位）`}
        >
          {String(pointVal)}
        </DsButton>,
      ],
      price: pp.price,
      onPriceChange: (val) => handlePurchasePriceChange(pp.rowKey, val),
      priceRender: (
        <span
          key="eff"
          style={{
            color: 'var(--status-danger-default)',
            fontSize: 'var(--body-xs-font-size)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
          title={`进价 = 面价 ${pp.price || '0'} × 点位 ${pointVal}`}
        >
          {effectiveVal != null ? String(effectiveVal) : '—'}
        </span>
      ),
      isDefault: pp.isDefault,
      onIsDefaultChange: () => handleIsDefaultChange(pp.supplierId, !pp.isDefault),
      defaultTitle: pp.isDefault ? '当前默认供应商' : '设为默认供应商',
      onDelete: () => handleDeletePurchaseRow(pp.rowKey),
      deleteTitle: '删除该供应商进价',
    };
  });

  // ===== 进价明细推算行（v1.5.6.3：与售价 Tab fallback 对等）=====
  // 基准单位（换算率=1）已录进价、当前单位未录该供应商时，按 基准进价(effective) × 当前单位换算率
  // 推算展示（面价/进价列只读占位 + 弱化样式），仅前端展示不写库；录入真实进价请用下方末尾空行。
  // 推算公式统一走 calcDerivedUnitPrice（pricing-engine，SSOT，禁止本地重写）。
  const derivedPurchaseRows: MatrixRowConfig[] =
    baseUnitIdx >= 0 && baseUnitIdx !== unitIdx
      ? purchasePrices
          .filter((p) => p.unitIdx === baseUnitIdx && !isNaN(calcEffectivePrice(p)))
          .filter(
            (bp) =>
              !purchasePrices.some(
                (p) => p.unitIdx === unitIdx && p.supplierId === bp.supplierId,
              ),
          )
          .map((bp) => {
            const rate = unitConversions?.[unitIdx];
            const rateNum = rate != null && !isNaN(rate) && rate !== 1 ? rate : null;
            // v14.2：推算行稳定 key（本地面价输入态用）
            const rowKey = `purchase_${brandIdx}_${unitIdx}_${bp.supplierId}_derived`;
            // 推算面价 = 基准面价 × 率；推算进价 = 基准有效进价 × 率（v12.0：进价 = 面价 × 点位）
            const derivedFace =
              rateNum != null ? calcDerivedUnitPrice(Number(bp.price) || 0, rateNum) : null;
            const derivedEff =
              rateNum != null ? calcDerivedUnitPrice(calcEffectivePrice(bp), rateNum) : null;
            return {
              rowKey,
              nameCell: (
                <div
                  style={{
                    fontSize: 'var(--body-xs-font-size)',
                    // v1.8：推算行统一系统补全语义色（醒目，禁止暗色）
                    color: 'var(--text-placeholder-accent)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={bp.supplierName}
                >
                  {bp.supplierName}
                  <span
                    style={{
                      marginLeft: 4,
                      fontSize: 9,
                      lineHeight: 1,
                      color: 'var(--text-placeholder-accent)',
                    }}
                  >
                    推算
                  </span>
                </div>
              ),
              midCells: [
                // v14.2：推算面价显示在输入框内（placeholder，语义色 + 虚线框），点击马上可输入真实面价
                //   输入有效值失焦/Enter → 创建真实进价行（与售价明细推算同范式，统一「推算即输入占位」）
                <DsInput
                  key="face"
                  size="sm"
                  variant="price"
                  numericColor="var(--status-danger-default)"
                  value={derivedFaceVals[rowKey] ?? ''}
                  onChange={(e) =>
                    setDerivedFaceVals((prev) => ({ ...prev, [rowKey]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder={derivedFace != null ? String(derivedFace) : '0.00'}
                  placeholderColor="var(--text-placeholder-accent)"
                  disabled={disabled}
                  style={{ borderStyle: 'dashed' }}
                  title="推算面价（基准单位面价 × 换算率），点击输入真实面价"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDerivedPurchaseCommit(rowKey, bp);
                    }
                  }}
                  onBlur={() => handleAddDerivedPurchaseCommit(rowKey, bp)}
                />,
                <span
                  key="point"
                  style={{
                    fontSize: 'var(--body-xs-font-size)',
                    color: 'var(--text-placeholder-accent)',
                    fontFamily: 'var(--font-family-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                  title="点位为组级规则（同供应商+品牌+分类），与基准单位一致"
                >
                  {String(bp.point ?? 1)}
                </span>,
              ],
              price: '',
              onPriceChange: () => undefined,
              priceRender: (
                <span
                  key="eff"
                  style={{
                    color: 'var(--text-placeholder-accent)',
                    fontSize: 'var(--body-xs-font-size)',
                    fontFamily: 'var(--font-family-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}
                  title="按基准单位进价 × 换算率推算（待补充），录入真实进价请用下方末尾空行"
                >
                  {derivedEff != null ? String(derivedEff) : '—'}
                </span>
              ),
              isDefault: false,
              onIsDefaultChange: () => undefined,
              defaultTitle: '推算进价（基准单位进价 × 换算率）',
              defaultDisabled: true,
              onDelete: () => undefined,
              deleteTitle: '',
              hideDelete: true,
            };
          })
      : [];

  // ===== 单位切换下拉菜单（外壳 switcher 用）=====
  // v1.8：单位选项按换算率升序排列（基准恒首），与单位面板/列表顺序一致（与录入顺序无关）
  const sortedUnitOptions = sortUnitsByRate(units, (u) => unitConversions?.[u.idx] ?? null);
  const unitSwitcher = {
    current: {
      key: String(unitIdx),
      label: unitName,
    },
    options: sortedUnitOptions.map((u) => ({
      key: String(u.idx),
      label: u.name,
    })),
    onSelect: (key: string) => onUnitChange(Number(key)),
  };

  return (
    <RecordExpandPanel
      tabs={[
        { key: 'sale', label: '售价明细' },
        { key: 'purchase', label: '进价明细' },
      ]}
      activeTab={tab}
      onTabChange={(k) => setTab(k as 'sale' | 'purchase')}
      switcher={unitSwitcher}
      renderTab={(tabKey) =>
        tabKey === 'sale' ? (
          <MatrixTable
            headerName="价格类型"
            headerPrice="价格"
            rows={saleRows}
            // v2.0：多记录字段「切换选中（本地态）」——行点击切换当前显示的价格类型（selectKey=priceTypeId）
            selectedRowKey={selectedSalePriceTypeId}
            onRowSelect={onSaleSelect}
            rowSelectDisabled={(rk) => !saleSelectableRowKeys.has(rk)}
            addNameCell={
              <SuggestInput
                field="priceType"
                value={addPriceTypeName}
                onChange={setAddPriceTypeName}
                placeholder="输入新价格类型名称"
                disabled={disabled}
                allowCreate={true}
                style={NAME_INPUT_STYLE}
                // v11.0.7：移除外部 onKeyDown/onBlur，改由 SuggestInput 内部
                //   handleKeyDownInternal/handleBlurInternal 统一触发 handleCreate。
                //   选中已有项或新建项后，onSelect 回调同步 priceTypes 与 salePrices。
                onSelect={(item) => {
                  if (item.type === 'create') {
                    if (!item.id) {
                      // 创建失败（如重名），清空输入
                      setAddPriceTypeName('');
                      setAddSalePriceVal('');
                      return;
                    }
                    // 新建成功：重新加载价格类型字典 + 添加 salePrice（如有价格）
                    listPriceTypes()
                      .then((list) => onPriceTypesChange(list.filter((p) => p.status === 1)))
                      .catch(() => undefined);
                    if (addSalePriceVal.trim()) {
                      onSalePricesChange([
                        ...salePrices,
                        {
                          rowKey: `sale_${brandIdx}_${unitIdx}_${item.id}`,
                          brandIdx,
                          unitIdx,
                          priceTypeId: item.id,
                          priceTypeName: item.name,
                          price: addSalePriceVal.trim(),
                          isDefault: false,
                        },
                      ]);
                    }
                    setAddPriceTypeName('');
                    setAddSalePriceVal('');
                  } else if (item.type === 'existing') {
                    // 末尾空行选中已有项：提示已存在，不可重复新建
                    message.warning(`价格类型「${item.name}」已存在，可在上方行直接编辑`);
                    setAddPriceTypeName('');
                  }
                }}
              />
            }
            addPriceCell={
              <DsInput
                size="sm"
                variant="price"
                value={addSalePriceVal}
                onChange={(e) => setAddSalePriceVal(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPriceTypeCommit();
                  }
                }}
              />
            }
            onAddCommit={handleAddPriceTypeCommit}
            // v13.1：类型可空——只填价格也可添加（自动归入「零售价」）
            addDisabled={!addPriceTypeName.trim() && !addSalePriceVal.trim()}
            disabled={disabled}
          />
        ) : (
          <MatrixTable
            headerName="供应商"
            headerPrice="进价"
            midCols={['面价', '点位']}
            rows={[...purchaseRows, ...derivedPurchaseRows]}
            priceColor="var(--status-discount-default)"
            // v2.0：多记录字段「切换选中（本地态）」——行点击切换当前显示的供应商进价（selectKey=supplierId）
            selectedRowKey={selectedPurchaseSupplierId}
            onRowSelect={onPurchaseSelect}
            rowSelectDisabled={(rk) => !purchaseSelectableRowKeys.has(rk)}
            addNameCell={
              <SuggestInput
                field="supplier"
                value={addPurchaseSupplierName}
                onChange={setAddPurchaseSupplierName}
                placeholder="供应商A"
                disabled={disabled}
                allowCreate={true}
                style={NAME_INPUT_STYLE}
                // v11.0.7：allowCreate=true + 内部 handleCreate 自动 quickAddSupplier
                //   onSelect 统一处理新建/选中已有：去重检查 + 添加 purchasePrice 行
                onSelect={(item) => {
                  if (!item.id) {
                    // 创建失败或选中默认项，清空
                    setAddPurchaseSupplierId('');
                    setAddPurchaseSupplierName('');
                    return;
                  }
                  // 去重检查
                  const dup = purchasePrices.find(
                    (x) => x.unitIdx === unitIdx && x.supplierId === item.id,
                  );
                  if (dup) {
                    message.warning(`供应商「${item.name}」已存在，不可重复`);
                    setAddPurchaseSupplierId('');
                    setAddPurchaseSupplierName('');
                    return;
                  }
                  // 添加 purchasePrice 行（含价格，如果有）
                  onPurchasePricesChange([
                    ...purchasePrices,
                    {
                      rowKey: `purchase_${brandIdx}_${unitIdx}_${item.id}`,
                      brandIdx,
                      unitIdx,
                      supplierId: item.id,
                      supplierName: item.name,
                      isDefault: false,
                      price: addPurchasePriceVal.trim(),
                    },
                  ]);
                  setAddPurchaseSupplierId('');
                  setAddPurchaseSupplierName('');
                  setAddPurchasePriceVal('');
                }}
              />
            }
            addPriceCell={
              <DsInput
                size="sm"
                variant="price"
                numericColor="var(--status-discount-default)"
                value={addPurchasePriceVal}
                onChange={(e) => setAddPurchasePriceVal(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPurchaseRowCommit();
                  }
                }}
              />
            }
            onAddCommit={handleAddPurchaseRowCommit}
            // v13.0：供应商允许后补——只填价格即可添加，供应商为空由后端补系统默认「面价渠道」
            addDisabled={!addPurchasePriceVal.trim()}
            disabled={disabled}
          />
        )
      }
    />
  );
}

export default UnitPriceExpandPanel;
