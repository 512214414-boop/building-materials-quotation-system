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
import MatrixTable, { type MatrixRowConfig } from './MatrixTable.js';
import RecordExpandPanel from './RecordExpandPanel.js';
import { SupplierCandidateBrowse } from './product-picker/SupplierCandidateBrowse.js';
import type { SupplierCandidateContext } from '../utils/supplierCandidateFetcher.js';
import { PickerNumCell } from './product-picker/PickerInlineCells.js';
import { FieldCell } from './cells/FieldCell.js';
import { calcEffectivePrice, formatPoint } from '../utils/format.js';
import { calcDerivedUnitPrice } from '../engines/pricing-engine.js';
import { sortUnitsByRate } from '../utils/unitRateText.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';
import { resolveGuard } from '../config/resolveGuard.js';
import {
  applyDictChange,
  createPriceType,
  listPriceTypes,
  quickAddSupplier,
  deletePriceType,
  previewPointChange,
  upsertSaleSpecPoint,
  upsertPurchaseSpecPoint,
  upsertSaleGroupPoint,
  upsertPurchaseGroupPoint,
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
  /** 点位：规格例外 → 组默认 → 1 */
  point?: number | null;
  /** 实际售价 = 面价 × 点位 */
  effectivePrice?: number | null;
  /** 点位来自规格例外 */
  specPoint?: boolean;
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
  /** 点位来自规格例外 */
  specPoint?: boolean;
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
// §3 价格矩阵表格 → 已收敛为共享组件 MatrixTable
// 名称 / 面价格子走选品同款点值确认层，不再每行挂常驻输入框。
// ============================================================

// ============================================================
// §5 价格矩阵表格 → 已收敛为共享组件 MatrixTable
// v1.7.1.5：售价/进价/联系信息矩阵同一实现（shared/components/MatrixTable.tsx），
//   差异仅通过 props 注入（表头文字、名称列 cell、值列渲染、默认列位置、空行交互）
// ============================================================

// ============================================================
// §6 单单位价格展开面板（公共组件，产品编辑弹窗与产品列表共用）
// ============================================================

/**
 * 点位写入核心（售价 / 进价共用）。
 *
 * 抽出来的理由不是省行数，是这条规则必须两侧一致：
 *   **specPoint 传 'keepFollow' 时，已经单独改过点位的规格不跟着变。**
 * 这是「整批调整不覆盖个性化点位」的实现，散在售价和进价两处就会改了一处忘另一处，
 * 而点位直接参与算价（实际价 = 面价 × 点位），错了就是算错钱。
 *
 * 用泛型 + match 回调而不是把字段名传进来，是为了保住类型安全——
 * 售价用 priceTypeId、进价用 supplierId，用字符串字段名索引会退化成 any。
 */
function patchPointList<T extends { point?: number | null; specPoint?: boolean; price: string }>(
  list: T[],
  match: (item: T) => boolean,
  n: number,
  specPoint: boolean | 'keepFollow',
): T[] {
  return list.map((p) => {
    if (!match(p)) return p;
    if (specPoint === 'keepFollow' && p.specPoint) return p;
    return {
      ...p,
      point: n,
      specPoint: specPoint === true,
      effectivePrice: calcEffectivePrice({ price: p.price, point: n }),
    } as T;
  });
}

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
  /**
   * 点位写库上下文。有品牌+分类即可改全局（组默认）；有 specBrandId 才能写规格例外。
   * 档案列表立即写库；编辑弹窗已落档的规格同样立即写点位表（不跟整档保存走）。
   */
  pointCtx?: {
    specBrandId?: string;
    brandName: string;
    categoryName: string;
    onPersisted?: () => void | Promise<void>;
  };
  /** 进价面板 · 查看可能渠道（只读查询槽，不占供应渠道格子） */
  supplierCandidateCtx?: SupplierCandidateContext;
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
  pointCtx,
  supplierCandidateCtx,
  selectedSalePriceTypeId,
  onSaleSelect,
  selectedPurchaseSupplierId,
  onPurchaseSelect,
  disabled,
}: UnitPriceExpandPanelProps) {
  const [tab, setTab] = useState<'sale' | 'purchase'>(defaultTab);
  const { message, modal } = useCanvasApp();

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

  // 进价末尾空行
  const [addPurchaseSupplierId, setAddPurchaseSupplierId] = useState('');
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
        onSalePricesChange(salePrices.map((p) => (p.rowKey === existing.rowKey ? { ...p, price: val, effectivePrice: calcEffectivePrice({ price: val, point: p.point }) } : p)));
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

  const handlePriceTypeApply = async (pt: PriceTypeView, name: string) => {
    const newName = name.trim();
    if (!newName || newName === pt.name) return;
    try {
      const types = await listPriceTypes();
      let next = types.find((t) => t.name === newName);
      if (!next) next = await createPriceType({ name: newName, status: 1 });
      if (next.id === pt.id) return;
      const block = resolveGuard('sale_price_apply', {
        collections: { unitSalePrices },
        form: { nextId: next.id, name: newName },
      });
      if (block) {
        message.warning(block);
        return;
      }
      if (!priceTypes.some((p) => p.id === next.id)) {
        onPriceTypesChange([...priceTypes, next]);
      }
      onSalePricesChange(
        salePrices.map((p) =>
          p.unitIdx === unitIdx && p.priceTypeId === pt.id
            ? {
                ...p,
                priceTypeId: next.id,
                priceTypeName: next.name,
                rowKey: `sale_${p.brandIdx}_${p.unitIdx}_${next.id}`,
              }
            : p,
        ),
      );
    } catch {
      message.error('修改失败，请重试');
      throw new Error('price type apply failed');
    }
  };

  const handlePriceTypeApplyGlobal = async (pt: PriceTypeView, name: string) => {
    try {
      const result = await applyDictChange({ kind: 'priceType', fromId: pt.id, toName: name });
      const list = await listPriceTypes();
      onPriceTypesChange(list.filter((p) => p.status === 1));
      onSalePricesChange(
        salePrices.map((p) =>
          p.priceTypeId === pt.id
            ? {
                ...p,
                priceTypeId: result.toId,
                priceTypeName: result.toName,
                rowKey: `sale_${p.brandIdx}_${p.unitIdx}_${result.toId}`,
              }
            : p,
        ),
      );
    } catch {
      message.error('修改失败，请重试');
      throw new Error('price type global failed');
    }
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

  const handleAddPriceTypeCommit = (nameInput?: string, priceInput?: string) => {
    const name = (nameInput ?? addPriceTypeName).trim();
    const priceVal = (priceInput ?? addSalePriceVal).trim();
    // v13.1：价格类型可空——只填价格未输类型名时，自动归入系统默认「零售价」（数据规范.md 缺省值注册表）
    if (!name && !priceVal) {
      setAddSalePriceVal('');
      return;
    }
    const targetName = name || '零售价';
    const existing = priceTypes.find((p) => p.name === targetName);
    if (existing) {
      if (name) {
        message.warning(`价格类型「${name}」已存在，可在上方行直接编辑`);
        setAddPriceTypeName('');
        setAddSalePriceVal('');
        return;
      }
      if (priceVal) {
        onSalePricesChange([
          ...salePrices,
          { rowKey: `sale_${brandIdx}_${unitIdx}_${existing.id}`, brandIdx, unitIdx, priceTypeId: existing.id, priceTypeName: existing.name, price: priceVal, isDefault: false },
        ]);
      }
      setAddPriceTypeName('');
      setAddSalePriceVal('');
      return;
    }
    createPriceType({ name: targetName, status: 1 })
      .then((newPt) => {
        onPriceTypesChange([...priceTypes, newPt]);
        if (priceVal) {
          onSalePricesChange([
            ...salePrices,
            { rowKey: `sale_${brandIdx}_${unitIdx}_${newPt.id}`, brandIdx, unitIdx, priceTypeId: newPt.id, priceTypeName: newPt.name, price: priceVal, isDefault: false },
          ]);
        }
        setAddPriceTypeName('');
        setAddSalePriceVal('');
      })
      .catch(() => message.error('新增价格类型失败，请重试'));
  };

  // ===== 进价处理 =====
  const unitPurchasePrices = purchasePrices.filter((p) => p.unitIdx === unitIdx);

  const handlePurchaseSupplierApply = async (rowKey: string, name: string) => {
    try {
      const s = await quickAddSupplier({ name });
      handlePurchaseSupplierChange(rowKey, s.id, s.name);
    } catch {
      message.error('更换供应商失败，请重试');
      throw new Error('supplier apply failed');
    }
  };

  const handlePurchaseSupplierApplyGlobal = async (pp: PurchasePriceItem, name: string) => {
    if (!pp.supplierId) {
      await handlePurchaseSupplierApply(pp.rowKey, name);
      return;
    }
    try {
      const result = await applyDictChange({ kind: 'supplier', fromId: pp.supplierId, toName: name });
      onPurchasePricesChange(
        purchasePrices.map((p) =>
          p.supplierId === pp.supplierId
            ? { ...p, supplierId: result.toId, supplierName: result.toName }
            : p,
        ),
      );
    } catch {
      message.error('修改失败，请重试');
      throw new Error('supplier global failed');
    }
  };

  const handlePurchaseSupplierChange = (rowKey: string, newId: string, newName: string) => {
    const block = resolveGuard('purchase_price_edit_supplier', {
      collections: { purchasePrices },
      form: { newId, newName, unitIdx, rowKey },
    });
    if (block) {
      message.warning(block);
      return;
    }
    onPurchasePricesChange(purchasePrices.map((p) => (p.rowKey === rowKey ? { ...p, supplierId: newId, supplierName: newName } : p)));
  };

  const handlePurchasePriceChange = (rowKey: string, val: string) => {
    onPurchasePricesChange(purchasePrices.map((p) => (p.rowKey === rowKey ? { ...p, price: val, effectivePrice: calcEffectivePrice({ price: val, point: p.point }) } : p)));
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

  const handleAddPurchaseRowCommit = async (nameInput?: string, priceInput?: string) => {
    const sname = (nameInput ?? addPurchaseSupplierName).trim();
    const priceVal = (priceInput ?? addPurchasePriceVal).trim();
    // v13.0：供应商允许后补——只填价格即可添加；供应商为空由后端补系统默认「面价渠道」
    if (!priceVal && !sname) {
      setAddPurchasePriceVal('');
      setAddPurchaseSupplierId('');
      return;
    }
    let sid = nameInput ? '' : addPurchaseSupplierId.trim();
    if (!sid && sname) {
      try {
        const newSupplier = await quickAddSupplier({ name: sname });
        sid = newSupplier.id;
      } catch {
        message.error('新建供应商失败，请重试');
        return;
      }
    }
    const dup = purchasePrices.find((x) => x.unitIdx === unitIdx && x.supplierId === sid);
    if (dup) {
      message.warning(sname ? `供应商「${sname}」已存在，不可重复` : '该 SKU 已存在默认供应商进价，可直接编辑');
      return;
    }
    onPurchasePricesChange([
      ...purchasePrices,
      { rowKey: `purchase_${brandIdx}_${unitIdx}_${sid}`, brandIdx, unitIdx, supplierId: sid, supplierName: sname, isDefault: false, price: priceVal },
    ]);
    setAddPurchaseSupplierId('');
    setAddPurchaseSupplierName('');
    setAddPurchasePriceVal('');
  };

  const handleAddDerivedPurchaseCommit = (bp: PurchasePriceItem, raw: string) => {
    const val = raw.trim();
    if (!val || isNaN(parseFloat(val))) return;
    const block = resolveGuard('purchase_price_add_derived', {
      collections: { purchasePrices },
      form: { supplierId: bp.supplierId, unitIdx, sname: bp.supplierName },
    });
    if (block) {
      message.warning(block);
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
  };

  const pointGroupReady = !!(pointCtx?.brandName.trim() && pointCtx?.categoryName.trim());

  const patchSalePoint = (priceTypeId: string, n: number, specPoint: boolean | 'keepFollow') => {
    onSalePricesChange(
      patchPointList(salePrices, (p) => p.priceTypeId === priceTypeId, n, specPoint),
    );
  };

  const patchPurchasePoint = (supplierId: string, n: number, specPoint: boolean | 'keepFollow') => {
    onPurchasePricesChange(
      patchPointList(purchasePrices, (p) => p.supplierId === supplierId, n, specPoint),
    );
  };

  const applySalePoint = async (priceTypeId: string, n: number, global: boolean) => {
    try {
      if (global) {
        if (!pointGroupReady || !priceTypeId) return;
        await upsertSaleGroupPoint({
          priceTypeId,
          brandName: pointCtx!.brandName.trim(),
          categoryName: pointCtx!.categoryName.trim(),
          point: n,
        });
        patchSalePoint(priceTypeId, n, 'keepFollow');
      } else if (pointCtx?.specBrandId && priceTypeId) {
        await upsertSaleSpecPoint({ specBrandId: pointCtx.specBrandId, priceTypeId, point: n });
        patchSalePoint(priceTypeId, n, true);
      } else {
        patchSalePoint(priceTypeId, n, true);
      }
      await pointCtx?.onPersisted?.();
    } catch (e) {
      message.error((e as Error).message || '点位保存失败');
      throw e;
    }
  };

  const applyPurchasePoint = async (supplierId: string, n: number, global: boolean) => {
    try {
      if (global) {
        if (!pointGroupReady || !supplierId) return;
        await upsertPurchaseGroupPoint({
          supplierId,
          brandName: pointCtx!.brandName.trim(),
          categoryName: pointCtx!.categoryName.trim(),
          point: n,
        });
        patchPurchasePoint(supplierId, n, 'keepFollow');
      } else if (pointCtx?.specBrandId && supplierId) {
        await upsertPurchaseSpecPoint({ specBrandId: pointCtx.specBrandId, supplierId, point: n });
        patchPurchasePoint(supplierId, n, true);
      } else {
        patchPurchasePoint(supplierId, n, true);
      }
      await pointCtx?.onPersisted?.();
    } catch (e) {
      message.error((e as Error).message || '点位保存失败');
      throw e;
    }
  };

  const previewSalePoint = (priceTypeId: string, to: string) =>
    previewPointChange({
      side: 'sale',
      brandName: pointCtx?.brandName.trim() ?? '',
      categoryName: pointCtx?.categoryName.trim() ?? '',
      newPoint: Number(to),
      priceTypeId,
    });

  const previewPurchasePoint = (supplierId: string, to: string) =>
    previewPointChange({
      side: 'purchase',
      brandName: pointCtx?.brandName.trim() ?? '',
      categoryName: pointCtx?.categoryName.trim() ?? '',
      newPoint: Number(to),
      supplierId,
    });

  // ===== 售价表格行配置（点值确认层）=====
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
    const fallbackPrice = priceVal.trim() === '' ? calcFallbackSalePrice(pt.id) : null;
    if (priceVal.trim() !== '' || fallbackPrice != null) saleSelectableRowKeys.add(rowKey);
    const priceNum = priceVal.trim() === '' ? null : Number(priceVal);
    const pointHit = salePrices.find((p) => p.priceTypeId === pt.id && p.point != null);
    const pointVal = sp?.point ?? pointHit?.point ?? 1;
    const specPoint = sp?.specPoint ?? pointHit?.specPoint ?? false;
    const faceForEff = priceVal.trim() !== '' ? priceNum : fallbackPrice;
    const effectiveVal =
      faceForEff != null && Number.isFinite(faceForEff)
        ? calcEffectivePrice({ price: faceForEff, point: pointVal })
        : null;
    const canPointGlobal = pointGroupReady && !!pt.id;
    return {
      rowKey,
      selectKey: pt.id,
      nameCell: (
        <FieldCell
          value={pt.name}
          kind="priceType"
          fromId={pt.id}
          placeholder="价格类型"
          disabled={disabled}
          onApply={(name) => handlePriceTypeApply(pt, name)}
          onApplyGlobal={(name) => handlePriceTypeApplyGlobal(pt, name)}
        />
      ),
      midCells: [
        fallbackPrice != null && priceVal.trim() === '' ? (
          <PickerNumCell
            key="face"
            value={fallbackPrice}
            kind="saleFace"
            color="var(--text-placeholder-accent)"
            placeholder="0.00"
            disabled={disabled}
            onApply={(n) => handleSalePriceChange(pt.id, pt.name, String(n))}
          />
        ) : (
          <PickerNumCell
            key="face"
            value={Number.isFinite(priceNum as number) ? priceNum : null}
            label={priceVal}
            kind="saleFace"
            placeholder="0.00"
            disabled={disabled}
            onApply={(n) => handleSalePriceChange(pt.id, pt.name, String(n))}
          />
        ),
        <PickerNumCell
          key="point"
          value={pointVal}
          label={formatPoint(pointVal)}
          kind="salePoint"
          scope={[pt.name, pointCtx?.brandName, pointCtx?.categoryName].filter(Boolean).join(' · ')}
          color={specPoint ? 'var(--status-warning-default)' : 'var(--text-tertiary)'}
          placeholder="1"
          disabled={disabled}
          onApply={(n) => applySalePoint(pt.id, n, false)}
          onApplyGlobal={canPointGlobal ? (n) => applySalePoint(pt.id, n, true) : undefined}
          previewGlobal={canPointGlobal ? (to) => previewSalePoint(pt.id, to) : undefined}
        />,
      ],
      price: priceVal,
      onPriceChange: (val) => handleSalePriceChange(pt.id, pt.name, val),
      priceRender: (
        <span
          key="eff"
          style={{
            fontSize: 'var(--body-xs-font-size)',
            fontFamily: 'var(--font-family-mono)',
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            color:
              fallbackPrice != null && priceVal.trim() === ''
                ? 'var(--text-placeholder-accent)'
                : 'var(--text-default)',
          }}
          title="实际售价 = 面价 × 点位"
        >
          {effectiveVal != null && !isNaN(effectiveVal) ? String(effectiveVal) : '—'}
        </span>
      ),
      isDefault,
      onIsDefaultChange: () => handleSaleIsDefaultChange(pt.id, !isDefault),
      defaultTitle: isDefault ? '当前默认售价' : '设为默认售价',
      defaultDisabled: !priceVal && fallbackPrice == null,
      onDelete: () => handleDeletePriceType(pt),
      deleteTitle: '删除价格类型（影响全局）',
    };
  });

  // 定价语义：price 存「面价」，实际价 = 面价 × 点位（价格列只读）。点位点确认层：当前=例外，改全局=组默认。
  const purchaseRows: MatrixRowConfig[] = unitPurchasePrices.map((pp) => {
    const pointVal = pp.point ?? 1;
    // 进价 = 面价 × 点位（calcEffectivePrice 单一实现，与后端一致 round2）
    const effectiveVal = (() => {
      const eff = calcEffectivePrice(pp);
      return isNaN(eff) ? null : eff;
    })();
    // v2.0：有效进价 → 可切换显示（空进价行不可切换）；selectKey = 供应商 ID（切换选中业务 key）
    if (effectiveVal != null) purchaseSelectableRowKeys.add(pp.rowKey);
    const canPointGlobal = pointGroupReady && !!pp.supplierId;
    return {
      rowKey: pp.rowKey,
      selectKey: pp.supplierId,
      nameCell: (
        <FieldCell
          value={pp.supplierName}
          kind="supplier"
          fromId={pp.supplierId || undefined}
          placeholder="供应商A"
          disabled={disabled}
          onApply={(name) => handlePurchaseSupplierApply(pp.rowKey, name)}
          onApplyGlobal={(name) => handlePurchaseSupplierApplyGlobal(pp, name)}
        />
      ),
      midCells: [
        <PickerNumCell
          key="face"
          value={pp.price.trim() === '' ? null : Number(pp.price)}
          label={pp.price}
          kind="purchaseFace"
          color="var(--status-danger-default)"
          placeholder="0.00"
          disabled={disabled}
          onApply={(n) => handlePurchasePriceChange(pp.rowKey, String(n))}
        />,
        <PickerNumCell
          key="point"
          value={pointVal}
          label={formatPoint(pointVal)}
          kind="purchasePoint"
          scope={[pp.supplierName, pointCtx?.brandName, pointCtx?.categoryName].filter(Boolean).join(' · ')}
          color={pp.specPoint ? 'var(--status-warning-default)' : 'var(--text-tertiary)'}
          placeholder="1"
          disabled={disabled}
          onApply={(n) => applyPurchasePoint(pp.supplierId, n, false)}
          onApplyGlobal={canPointGlobal ? (n) => applyPurchasePoint(pp.supplierId, n, true) : undefined}
          previewGlobal={canPointGlobal ? (to) => previewPurchasePoint(pp.supplierId, to) : undefined}
        />,
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
                <PickerNumCell
                  key="face"
                  value={derivedFace}
                  kind="purchaseFace"
                  color="var(--text-placeholder-accent)"
                  placeholder="0.00"
                  disabled={disabled}
                  onApply={(n) => handleAddDerivedPurchaseCommit(bp, String(n))}
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
      data-shared-badge="C20"
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
            headerPrice="售价"
            midCols={['面价', '点位']}
            rows={saleRows}
            // v2.0：多记录字段「切换选中（本地态）」——行点击切换当前显示的价格类型（selectKey=priceTypeId）
            selectedRowKey={selectedSalePriceTypeId}
            onRowSelect={onSaleSelect}
            rowSelectDisabled={(rk) => !saleSelectableRowKeys.has(rk)}
            addNameCell={
              <FieldCell
                placeholder="输入新价格类型名称"
                kind="addSaleType"
                onApply={(name) => handleAddPriceTypeCommit(name)}
              />
            }
            addMidCells={[
              <PickerNumCell
                key="face"
                value={addSalePriceVal.trim() === '' ? null : Number(addSalePriceVal)}
                label={addSalePriceVal}
                kind="saleFace"
                placeholder="0.00"
                disabled={disabled}
                onApply={(n) => setAddSalePriceVal(String(n))}
              />,
            ]}
            addPriceCell={<span />}
            onAddCommit={() => handleAddPriceTypeCommit()}
            addDisabled={!addSalePriceVal.trim()}
            disabled={disabled}
          />
        ) : (
          <>
            {(supplierCandidateCtx?.categoryId || supplierCandidateCtx?.brandId) ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  flexWrap: 'wrap',
                }}
              >
                <SupplierCandidateBrowse ctx={supplierCandidateCtx} disabled={disabled} />
                <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                  查询槽 · 只读 · 选渠道仍用下方格子
                </span>
              </div>
            ) : null}
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
              <FieldCell
                placeholder="供应商A"
                kind="addChannel"
                leadCheck
                onApply={(name) => void handleAddPurchaseRowCommit(name)}
              />
            }
            addMidCells={[
              <PickerNumCell
                key="face"
                value={addPurchasePriceVal.trim() === '' ? null : Number(addPurchasePriceVal)}
                label={addPurchasePriceVal}
                kind="purchaseFace"
                color="var(--status-discount-default)"
                placeholder="0.00"
                disabled={disabled}
                onApply={(n) => setAddPurchasePriceVal(String(n))}
              />,
            ]}
            addPriceCell={<span />}
            onAddCommit={() => void handleAddPurchaseRowCommit()}
            addDisabled={!addPurchasePriceVal.trim()}
            disabled={disabled}
          />
          </>
        )
      }
    />
  );
}

export default UnitPriceExpandPanel;
