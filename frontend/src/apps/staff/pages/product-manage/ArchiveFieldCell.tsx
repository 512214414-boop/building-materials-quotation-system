// 档案列表：品牌 / 规格已是最后一级，格子只显示值，点开就是选品同款确认浮层。
// 不要下拉箭头（没有下一层可展开）。走 PickerNameCell，跟选品/维护浮层同一套槽位格子。

import { PickerNameCell } from '../../../../shared/components/product-picker/PickerInlineCells.js';
import {
  applyDictChange,
  quickAddCategory,
  rebindSpecBrand,
  updateProduct,
  updateSpec,
  type SkuSearchRow,
} from '../../../../shared/services/api/baseDataApi.js';

export function ArchiveCategoryCell({
  sku,
  onSaved,
}: {
  sku: SkuSearchRow;
  onSaved: () => void;
}) {
  const fromId = sku.categoryId && sku.categoryId !== '0' ? sku.categoryId : undefined;
  const text = sku.categoryName === '未分类' ? '' : sku.categoryName;
  return (
    <PickerNameCell
      value={text}
      placeholder="未分类"
      kind="category"
      scope={sku.productName}
      fromId={fromId}
      embed="table"
      allowRoot
      onApply={async (name) => {
        const cat = await quickAddCategory(name);
        await updateProduct(sku.productId, { categoryId: cat.id });
        onSaved();
      }}
      onApplyGlobal={
        fromId
          ? async (name) => {
              await applyDictChange({ kind: 'category', fromId, toName: name });
              onSaved();
            }
          : undefined
      }
    />
  );
}

export function ArchiveBrandCell({
  sku,
  onSaved,
}: {
  sku: SkuSearchRow;
  onSaved: () => void;
}) {
  return (
    <PickerNameCell
      value={sku.brandName}
      kind="brand"
      scope={sku.productName}
      fromId={sku.brandId}
      embed="table"
      allowRoot
      onApply={async (name) => {
        await rebindSpecBrand(sku.specBrandId, name);
        onSaved();
      }}
      onApplyGlobal={async (name) => {
        await applyDictChange({ kind: 'brand', fromId: sku.brandId, toName: name });
        onSaved();
      }}
    />
  );
}

export function ArchiveSpecCell({
  sku,
  onSaved,
}: {
  sku: SkuSearchRow;
  onSaved: () => void;
}) {
  return (
    <PickerNameCell
      value={sku.specModel}
      kind="spec"
      scope={`${sku.productName} ${sku.brandName}`.trim()}
      embed="table"
      allowRoot
      onApply={async (name) => {
        await updateSpec(sku.specId, { specModel: name });
        onSaved();
      }}
    />
  );
}
