// Picker 组件标准化接口 — 全系统 Picker 组件统一契约
//
// 设计依据：顶层设计规范 理念8「浮动面板统一约束」
//           交互范式规范 §Picker 组件群通用规范「统一接口形态」
//           表格架构分层规范 §第三层：业务交付层「浮动面板内容」
//
// 职责边界：
//   - 定义所有 Picker 组件的统一 Props 接口
//   - 零组件实现（不在此文件写组件）
//   - 零业务逻辑
//   - 被所有 Picker 组件实现引用

import type { RefObject } from 'react';

// ============================================================
// §1 PickerProps — 所有 Picker 组件的统一接口
// ============================================================

export interface PickerProps<T = any> {
  /** 是否打开浮动面板（由 UnifiedTable 焦点总线控制） */
  open: boolean;
  /** 锚点元素 ref（浮动面板定位依据） */
  anchorRef: RefObject<HTMLElement | null>;
  /** 关闭回调（不提交，仅关闭面板） */
  onClose: () => void;
  /** 选中回调（提交选中值，关闭面板） */
  onSelect: (value: T) => void;
  /** 初始搜索关键词（用于预填搜索框） */
  initialKeyword?: string;
  /** 是否为员工端（控制是否显示进价等内部字段） */
  isStaff?: boolean;
  /** 产品 ID（部分 Picker 需要限定产品范围） */
  productId?: string | null;
}

// ============================================================
// §2 Picker 类型枚举
// ============================================================

export type PickerType =
  | 'product'       // 产品选择器（ProductPicker）
  | 'unit'          // 单位选择器（UnitPicker）
  | 'price'         // 价格选择器（PricePicker）
  | 'category'      // 分类选择器（CategoryPicker）
  | 'supplier'      // 供应商选择器（SupplierPicker）
  | 'customer'      // 客户选择器（CustomerPicker）
  | 'brand'         // 品牌选择器（BrandPicker）
  | 'allocation';   // 配货来源选择器（AllocationSourcePicker）

// ============================================================
// §3 Picker 注册表（交付层注册业务 Picker）
// ============================================================

export type PickerComponent = React.ComponentType<PickerProps<any>>;

export interface PickerRegistry {
  product: PickerComponent;
  unit: PickerComponent;
  price: PickerComponent;
  category: PickerComponent;
  supplier: PickerComponent;
  customer: PickerComponent;
  brand: PickerComponent;
  allocation: PickerComponent;
}

// ============================================================
// §4 Picker 选择结果标准化
// ============================================================

/** 产品选择结果（ProductPicker 返回） */
export interface ProductSelectResult {
  sku: {
    brandId: string;
    productId: string;
    brandName: string;
    productName: string;
    specModel: string;
    fullName: string;
  };
  unit: {
    unitId: string;
    unitName: string;
    defaultSalePrice?: number;
  };
  selectedPrice?: {
    sale?: { price: number; id: string };
    purchase?: { price: number; id: string };
  };
}

/** 单位选择结果（UnitPicker 返回） */
export interface UnitSelectResult {
  unitId: string;
  unitName: string;
  conversionRate?: number;
  isBase?: boolean;
  isDisplay?: boolean;
}

/** 分类选择结果（CategoryPicker 返回） */
export interface CategorySelectResult {
  id: number;
  name: string;
}