// Phase 5（原版大改）：把 ProductEditDialog 的 1300 行自定义编排迁为标准档案槽。
// 复用同一套经过验证的子组件（ArchiveDialogField / CascadeSwitchRow / UnitSection / BrandImages /
// EntityPanel / FieldCell），仅把"瞬态态"从组件内部 useState 搬到 ctx.extras，行为不漂移。
// 列表列仍由各 def 自带；本模块只管"弹窗内编辑"的标准槽 + seed/loadSeed/beforeSave/collectPayload/afterSave。

import { DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  ArchiveDialogField,
  confirmFillsBeforeSave,
} from '../../../../shared/components/index.js';
import { FieldCell } from '../../../../shared/components/cells/FieldCell.js';
import {
  QUICK_CREATE_LAYERS,
  resolveFieldValue,
} from '../../../../shared/config/quickCreateConfig.js';
import { brandDict } from '../../../../shared/config/recordDicts.js';
import { resolveGuard } from '../../../../shared/config/resolveGuard.js';
import {
  getProduct,
  getSiblingSpecs,
  saveProduct,
  listPriceTypes,
  listCategories,
  createCategory,
  applyDictChange,
  deleteSpec,
  getSpecDocRefs,
  type SaveProductInput,
  type ProductBrandInput,
  type ProductUnitInput,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  type ProductImageView,
  type PriceTypeView,
  type SiblingSpec,
} from '../../../../shared/services/api/baseDataApi.js';
import {
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../../shared/components/UnitPriceExpandPanel.js';
import { UnitSection } from './UnitSection.js';
import { BrandImages } from './BrandImages.js';
import CascadeSwitchRow from '../../../../shared/components/CascadeSwitchRow.js';
import EntityPanel from '../../../../shared/components/EntityPanel.js';
import type {
  ArchiveSlot,
  ArchiveDialogCtx,
  ArchiveBeforeSaveCtx,
  ArchiveSeed,
} from '../../../../shared/components/archive/archiveSlotTypes.js';
import type { UnitItem, ImageItem, BrandItem } from './productEditTypes.js';

const productLayer = QUICK_CREATE_LAYERS.product;
const fieldConfig = (key: string) => productLayer.fields.find((f) => f.key === key)!;

/** 产品弹窗的全部瞬态态（原 ProductEditDialog 的几十个 useState 统一收口到 ctx.extras） */
export interface ProductEditExtras {
  currentProductId: string | null;
  currentSpecId: string | null;
  creatingSibling: boolean;
  categoryId: number;
  productRemark: string;
  specModel: string;
  specRemark: string;
  units: UnitItem[];
  brands: BrandItem[];
  currentBrandIdx: number;
  activeBrandId: string | null;
  salePrices: SalePriceItem[];
  purchasePrices: PurchasePriceItem[];
  priceTypes: PriceTypeView[];
  siblingSpecs: SiblingSpec[];
  productBrands: Array<{ id: string; name: string }>;
}

function emptyExtras(): ProductEditExtras {
  return {
    currentProductId: null,
    currentSpecId: null,
    creatingSibling: false,
    categoryId: 0,
    productRemark: '',
    specModel: '',
    specRemark: '',
    units: [],
    brands: [],
    currentBrandIdx: 0,
    activeBrandId: null,
    salePrices: [],
    purchasePrices: [],
    priceTypes: [],
    siblingSpecs: [],
    productBrands: [],
  };
}

/** 把 getProduct 返回的详情反填为 extras（镜像原 loadProduct 的反填逻辑） */
function buildExtrasFromProduct(
  product: any,
  siblingSpecs: SiblingSpec[],
  initialBrandId?: string | null,
): ProductEditExtras {
  const base = emptyExtras();

  const unitList: UnitItem[] = (product.units ?? []).map((u: any) => ({
    rowKey: genRowKey('unit'),
    id: u.id,
    unitName: u.unitName,
    isBase: u.isBase ?? false,
    isDisplay: u.isDisplay ?? false,
  }));

  const brandList: BrandItem[] = (product.brands ?? []).map((b: any) => ({
    rowKey: genRowKey('brand'),
    id: b.id,
    brandId: b.brandId,
    name: b.name ?? '',
    images: (b.images ?? []).map((img: ProductImageView) => ({
      rowKey: genRowKey('img'),
      id: img.id,
      imageUrl: img.imageUrl,
      mediumUrl: img.mediumUrl,
      thumbnailUrl: img.thumbnailUrl,
      width: img.width,
      height: img.height,
      size: img.size,
      hash: img.hash,
      sortOrder: img.sortOrder ?? 0,
      isMain: img.isMain === 1,
    })),
    conversions: Object.fromEntries(
      (b.conversions ?? []).map((c: any) => {
        const unitIdx = unitList.findIndex((u) => u.id === c.unitId);
        const unitRowKey = unitIdx >= 0 ? unitList[unitIdx].rowKey : c.unitId;
        return [unitRowKey, String(c.conversionRate)];
      }),
    ),
  }));

  const brandTabs = (product.productBrands ?? [])
    .map((pb: any) => ({ id: String(pb.brandId), name: pb.brand?.name?.trim() ?? '' }))
    .filter((t: { name: string }) => t.name);

  const salePriceItems: SalePriceItem[] = [];
  const purchasePriceItems: PurchasePriceItem[] = [];
  (product.salePrices ?? []).forEach((sp: any) => {
    const bIdx = brandList.findIndex((b) => b.id === sp.specBrandId);
    const uIdx = unitList.findIndex((u) => u.id === sp.unitId);
    if (bIdx < 0 || uIdx < 0) return;
    salePriceItems.push({
      rowKey: genRowKey('sale'),
      brandIdx: bIdx,
      unitIdx: uIdx,
      priceTypeId: sp.priceTypeId,
      priceTypeName: sp.priceType?.name ?? '',
      price: String(sp.price),
      isDefault: sp.isDefault ?? false,
      point: sp.point ?? 1,
      effectivePrice: sp.effectivePrice ?? null,
      specPoint: sp.specPoint ?? false,
    });
  });
  (product.purchasePrices ?? []).forEach((pp: any) => {
    const bIdx = brandList.findIndex((b) => b.id === pp.specBrandId);
    const uIdx = unitList.findIndex((u) => u.id === pp.unitId);
    if (bIdx < 0 || uIdx < 0) return;
    purchasePriceItems.push({
      rowKey: genRowKey('purchase'),
      brandIdx: bIdx,
      unitIdx: uIdx,
      supplierId: pp.supplierId,
      supplierName: pp.supplierName,
      isDefault: pp.isDefault ?? false,
      price: String(pp.price),
      point: pp.point ?? 1,
      effectivePrice: pp.effectivePrice ?? null,
      specPoint: pp.specPoint ?? false,
    });
  });

  // 选定初始品牌
  let initIdx = 0;
  let initBrandGlobalId: string | null = null;
  const wantBrandId = initialBrandId ?? undefined;
  if (wantBrandId && brandList.length > 0) {
    const bySpecBrand = brandList.findIndex((b) => String(b.id ?? '') === String(wantBrandId));
    const byGlobal = brandList.findIndex((b) => String(b.brandId ?? '') === String(wantBrandId));
    if (bySpecBrand >= 0) {
      initIdx = bySpecBrand;
      initBrandGlobalId = brandList[bySpecBrand].brandId ?? brandList[bySpecBrand].id ?? null;
    } else if (byGlobal >= 0) {
      initIdx = byGlobal;
      initBrandGlobalId = brandList[byGlobal].brandId ?? null;
    }
  }
  if (!initBrandGlobalId && brandList.length > 0) {
    initBrandGlobalId = brandList[initIdx].brandId ?? brandList[initIdx].id ?? null;
  }

  return {
    ...base,
    categoryId: product.categoryId ?? 0,
    productRemark: product.remark ?? '',
    specModel: product.specModel ?? '',
    specRemark:
      (product.brands ?? []).find(
        (b: any) => String(b.id) === String(product.specId) || String(b.specId) === String(product.specId),
      )?.remark ?? '',
    units: unitList,
    brands: brandList,
    currentBrandIdx: initIdx,
    activeBrandId: brandList.length > 0 ? initBrandGlobalId : null,
    salePrices: salePriceItems,
    purchasePrices: purchasePriceItems,
    siblingSpecs,
    productBrands: brandTabs,
    currentProductId: String(product.id),
    currentSpecId: product.specId ?? product.specs?.[0]?.id ?? null,
  };
}

function productBrandsOf(ex: ProductEditExtras): Array<{ id: string; name: string }> {
  const preset = ex.productBrands ?? [];
  if (preset.length > 0) return preset;
  const map = new Map<string, string>();
  for (const spec of ex.siblingSpecs) {
    for (const b of spec.brands ?? []) {
      if (b.name.trim()) map.set(b.id, b.name);
    }
  }
  for (const b of ex.brands) {
    const id = b.brandId || b.rowKey;
    if (b.name.trim()) map.set(id, b.name);
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

function specsForActiveBrand(ex: ProductEditExtras): SiblingSpec[] {
  if (!ex.activeBrandId || ex.creatingSibling) return ex.siblingSpecs;
  const filtered = ex.siblingSpecs.filter((s) => s.brands?.some((b) => b.id === ex.activeBrandId));
  return filtered.length > 0 ? filtered : ex.siblingSpecs;
}

function specDuplicateOf(ex: ProductEditExtras): boolean {
  const trimmed = ex.specModel.trim();
  if (!trimmed) return false;
  const pool =
    ex.activeBrandId && !ex.creatingSibling
      ? ex.siblingSpecs.filter((s) => s.brands?.some((b) => b.id === ex.activeBrandId))
      : ex.siblingSpecs;
  if (!ex.currentProductId && !ex.creatingSibling) return false;
  if (ex.creatingSibling) return pool.some((s) => s.specModel === trimmed);
  return pool.some((s) => s.id !== ex.currentSpecId && s.specModel === trimmed);
}

export interface ProductEditParts<T> {
  editSlots: ArchiveSlot<T>[];
  seed: (row: T | null) => ArchiveSeed;
  loadSeed: (row: T | null) => Promise<Partial<ArchiveSeed>>;
  beforeSave: (ctx: ArchiveBeforeSaveCtx<T>) => Promise<boolean>;
  collectPayload: (
    draft: Record<string, string>,
    matrices: Record<string, unknown[]>,
    extras: Record<string, unknown>,
    isCreate: boolean,
  ) => Record<string, unknown>;
  validate: (payload: Record<string, unknown>, isCreate: boolean, draft: Record<string, string>) => string | null;
  afterSave: (id: string, ctx: { draft: Record<string, string>; matrices: Record<string, unknown[]>; extras: Record<string, unknown>; baselines: Record<string, unknown>; isCreate: boolean }) => Promise<void>;
  create: (payload: Record<string, unknown>) => Promise<T | void>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T | void>;
}

export function buildProductEditDialogParts<T extends { productId?: string | number; specId?: string; specBrandId?: string }>(
  opts: { onSaved?: () => void } = {},
): ProductEditParts<T> {
  const setEx = (ctx: ArchiveDialogCtx<T>, patch: Partial<ProductEditExtras>) => {
    const ex = exOf(ctx);
    ctx.setExtras({ ...ex, ...patch } as unknown as Record<string, unknown>);
  };
  // 兜底：extras 可能来自旧种子/热更新残留，缺字段时用 emptyExtras 补齐，避免渲染期 undefined 崩溃
  const exOf = (ctx: ArchiveDialogCtx<T>) =>
    ({ ...emptyExtras(), ...(ctx.extras ?? {}) }) as unknown as ProductEditExtras;

  // ---------- 品牌级联（§B）----------
  const brandSlot: ArchiveSlot<T> = {
    kind: 'custom',
    key: 'brandCascade',
    label: '品牌',
    dialog: true,
    dialogRender: (ctx) => {
      const ex = exOf(ctx);
      const brands = ex.brands;
      const currentBrandIdx = ex.currentBrandIdx;
      const activeBrandId = ex.activeBrandId;
      const options = (productBrandsOf(ex).length > 0
        ? productBrandsOf(ex)
        : brands.map((b, i) => ({ id: b.brandId || b.rowKey || String(i), name: b.name || `品牌 ${i + 1}` }))
      ).map((pb) => {
        const bIdx = brands.findIndex((b) => (pb.id && b.brandId === pb.id) || b.rowKey === pb.id);
        const active = activeBrandId ? String(pb.id) === String(activeBrandId) : bIdx === currentBrandIdx;
        const brand = bIdx >= 0 ? brands[bIdx] : null;
        return {
          key: pb.id,
          label: pb.name,
          active,
          suffix: brand && brand.images.length > 0 ? (
            <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({brand.images.length}图)</span>
          ) : undefined,
          editCell: brand && active ? (
            <FieldCell
              field="brand"
              value={brand.name}
              placeholder="品牌名称"
              title="修改品牌（查全局档案，没有则新建）"
              fromId={brand.brandId}
              disabled={!ctx.canWrite}
              onDelete={{ label: '删除品牌', run: () => handleDeleteBrand(ctx, bIdx) }}
              onApply={async (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                try {
                  const list = await brandDict.list();
                  const matched = list.find((b) => b.name === trimmed);
                  if (matched) {
                    handleBrandResolve(ctx, bIdx, { id: String(matched.id), name: matched.name });
                  } else {
                    const created = await brandDict.create(trimmed);
                    handleBrandResolve(ctx, bIdx, { id: String(created.id), name: created.name });
                  }
                } catch {
                  handleBrandResolve(ctx, bIdx, { id: brand.brandId ?? '', name: trimmed });
                }
              }}
            />
          ) : undefined,
        };
      });
      return (
        <div className="ds-dialog-field-block">
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
            品牌为全店档案；同一产品可挂多个品牌。点选项切换；选中品牌的名称可点值改名，删除在名称确认层内。
          </div>
          <CascadeSwitchRow
            label="品牌"
            disabled={!ctx.canWrite}
            options={options}
            onSelect={(key) => handleSelectProductBrand(ctx, key)}
            addCell={
              <FieldCell
                placeholder="新增品牌…"
                title="新增品牌（查全局档案，没有则新建并挂到本产品）"
                onApply={(v) => void handleAddBrandConfirm(ctx, v)}
              />
            }
          />
        </div>
      );
    },
  } as ArchiveSlot<T>;

  // ---------- 规格级联（§C）----------
  const specSlot: ArchiveSlot<T> = {
    kind: 'custom',
    key: 'specCascade',
    label: '规格',
    dialog: true,
    dialogRender: (ctx) => {
      const ex = exOf(ctx);
      const activeBrandId = ex.activeBrandId;
      const currentSpecId = ex.currentSpecId;
      const creatingSibling = ex.creatingSibling;
      const specModel = ex.specModel;
      const specRemark = ex.specRemark;
      const siblingSpecs = ex.siblingSpecs;
      const specDuplicate = specDuplicateOf(ex);
      const options = specsForActiveBrand(ex).map((spec) => ({
        key: spec.id,
        label: (spec.specModel || '(空)') + (spec.status === 0 ? '（停用）' : ''),
        active: spec.id === currentSpecId && !creatingSibling,
      }));
      return (
        <div className="ds-dialog-field-block">
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
            系列/规格：当前品牌下的货号变体。通用尺寸写在产品名；此处填品牌私有属性。点选项切换，选中的规格在下方单行编辑。
          </div>
          <CascadeSwitchRow
            label="规格"
            disabled={!ctx.canWrite}
            options={options}
            onSelect={(key) => {
              if (!creatingSibling) handleSwitchSpec(ctx, key);
            }}
            addCell={
              <FieldCell
                placeholder="新增系列/规格…"
                title="新增规格变体"
                bullets={['新增规格变体：保留品牌与单位，价格清空，保存时统一落库。']}
                disabledReason={creatingSibling ? '请先完成或取消正在新建的规格' : undefined}
                onApply={(v) => {
                  const name = v.trim();
                  if (name && ctx.canWrite) handleAddSiblingSpec(ctx, name);
                }}
              />
            }
            editRow={
              creatingSibling || currentSpecId ? (
                <EntityPanel
                  template="minmax(120px, 1fr) minmax(140px, 1fr) 28px"
                  header={
                    <>
                      <span style={{ textAlign: 'left', paddingLeft: 8 }}>规格型号</span>
                      <span style={{ textAlign: 'left' }}>规格备注</span>
                      <span style={{ textAlign: 'center' }}>操作</span>
                    </>
                  }
                  rows={[
                    {
                      key: 'spec-edit-row',
                      cells: (
                        <>
                          <FieldCell
                            value={specModel}
                            placeholder="留空默认「通用」"
                            title="修改系列/规格"
                            bullets={['仅修改当前规格的系列/规格，保存时统一落库。', '与同品牌下其他规格重复时，保存将被阻止。']}
                            disabled={!ctx.canWrite}
                            onApply={(v) => setEx(ctx, { specModel: v })}
                          />
                          <FieldCell
                            value={specRemark}
                            placeholder="执行标准 / 企标 / 国标"
                            title="修改规格备注"
                            bullets={['仅修改当前规格的备注，保存时统一落库。']}
                            disabled={!ctx.canWrite}
                            onApply={(v) => setEx(ctx, { specRemark: v })}
                          />
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {creatingSibling ? (
                              <button
                                type="button"
                                title="取消新建规格"
                                onClick={() => setEx(ctx, { creatingSibling: false, specModel: '', specRemark: '' })}
                                style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 10, padding: '2px' }}
                              >
                                取消
                              </button>
                            ) : currentSpecId ? (
                              (() => {
                                const s = siblingSpecs.find((x) => x.id === currentSpecId);
                                return s ? (
                                  <Tooltip title="删除规格">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSpec(ctx, s)}
                                      disabled={!ctx.canWrite}
                                      style={{ border: 'none', background: 'transparent', color: 'var(--text-quaternary)', cursor: ctx.canWrite ? 'pointer' : 'not-allowed', padding: '2px', display: 'flex', alignItems: 'center' }}
                                    >
                                      <DeleteOutlined style={{ fontSize: 12 }} />
                                    </button>
                                  </Tooltip>
                                ) : null;
                              })()
                            ) : null}
                          </div>
                        </>
                      ),
                    },
                  ]}
                />
              ) : undefined
            }
          />
          {specDuplicate && (
            <div style={{ marginTop: 4, fontSize: 'var(--body-xs-font-size)', color: 'var(--status-star-default)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <WarningOutlined style={{ fontSize: 11 }} />
              与同品牌下其他系列/规格重复，保存时将被阻止
            </div>
          )}
          {!activeBrandId && (
            <div style={{ marginTop: 4, fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>请先选择品牌，再维护该品牌下的系列/规格</div>
          )}
        </div>
      );
    },
  } as ArchiveSlot<T>;

  // ---------- 单位 + 价格（§D）----------
  const unitPriceSlot: ArchiveSlot<T> = {
    kind: 'custom',
    key: 'unitPrice',
    label: '单位与价格',
    dialog: true,
    dialogRender: (ctx) => {
      const ex = exOf(ctx);
      const currentBrand = ex.brands[ex.currentBrandIdx];
      return (
        <div className="ds-dialog-field-block">
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span>单位与价格 · 挂载路径：</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>品牌 {currentBrand?.name || '—'}</span>
            <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--text-brand)', fontWeight: 500 }}>规格 {ex.specModel.trim() || '(通用)'}</span>
            <span style={{ opacity: 0.5 }}>→</span>
            <span>单位（每规格一套）· 价格（规格×品牌×单位）</span>
          </div>
          <UnitSection
            units={ex.units}
            onUnitsChange={(next) => handleUnitsChange(ctx, next)}
            currentBrandConversions={currentBrand?.conversions ?? {}}
            onConversionsChange={(conversions) => handleConversionsChange(ctx, ex.currentBrandIdx, conversions)}
            brandIdx={ex.currentBrandIdx}
            onSetBase={(newBaseIdx) => handleSetBaseUnit(ctx, newBaseIdx)}
            salePrices={ex.salePrices}
            onSalePricesChange={(rows) => setEx(ctx, { salePrices: rows })}
            purchasePrices={ex.purchasePrices}
            onPurchasePricesChange={(rows) => setEx(ctx, { purchasePrices: rows })}
            priceTypes={ex.priceTypes}
            onPriceTypesChange={(rows) => setEx(ctx, { priceTypes: rows })}
            pointCtx={{ specBrandId: currentBrand?.id, brandName: currentBrand?.name ?? '', categoryName: ctx.draft['category'] ?? '' }}
            disabled={!ctx.canWrite}
          />
        </div>
      );
    },
  } as ArchiveSlot<T>;

  // ---------- 图片（§E）----------
  const imagesSlot: ArchiveSlot<T> = {
    kind: 'custom',
    key: 'brandImages',
    label: '产品图片',
    dialog: true,
    dialogRender: (ctx) => {
      const ex = exOf(ctx);
      const currentBrand = ex.brands[ex.currentBrandIdx];
      if (!currentBrand) {
        return (
          <div className="ds-dialog-field-block">
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>请先选择品牌</div>
          </div>
        );
      }
      return (
        <div className="ds-dialog-field-block">
          <BrandImages
            images={currentBrand.images}
            onImagesChange={(imgs) => handleBrandImagesChange(ctx, ex.currentBrandIdx, imgs)}
            disabled={!ctx.canWrite}
            contextProductName={ctx.draft['productName'] ?? ''}
            contextCategoryId={ex.categoryId}
          />
        </div>
      );
    },
  } as ArchiveSlot<T>;

  // ---------- 分类（custom 渲染 ArchiveDialogField，保留 applyGlobal 改名）----------
  const categorySlot: ArchiveSlot<T> = {
    kind: 'custom',
    key: 'categoryField',
    label: '分类',
    dialog: true,
    dialogRender: (ctx) => {
      const ex = exOf(ctx);
      const categoryInput = ctx.draft['category'] ?? '';
      const categoryId = ex.categoryId;
      return (
        <ArchiveDialogField
          layout="stack"
          label="分类"
          value={categoryInput}
          placeholder="分类"
          title="修改分类"
          kind="category"
          dictField="category"
          fromId={categoryId ? String(categoryId) : undefined}
          applyGlobal={(name) =>
            applyDictChange({ kind: 'category', fromId: String(categoryId), toName: name }).then(() => {
              ctx.setDraft({ ...ctx.draft, category: name });
              setEx(ctx, { categoryId: 0 });
            })
          }
          disabled={!ctx.canWrite}
          onApply={(name) => {
            ctx.setDraft({ ...ctx.draft, category: name });
            if (ex.categoryId !== 0) setEx(ctx, { categoryId: 0 });
          }}
        />
      );
    },
  } as ArchiveSlot<T>;

  // ---------- 备注 ----------
  const remarkSlot: ArchiveSlot<T> = {
    kind: 'scalar',
    key: 'remark',
    label: '俗称',
    placeholder: '如 6分管',
    title: '修改俗称',
    dialog: true,
    list: false,
    get: () => '',
    toPatch: () => ({}),
  };

  const editSlots: ArchiveSlot<T>[] = [categorySlot, remarkSlot, brandSlot, specSlot, unitPriceSlot, imagesSlot];

  // ---------- 数据加载 ----------
  const loadProductInto = async (ctx: ArchiveDialogCtx<T>, id: string, specId?: string, brandId?: string | null) => {
    const [product, siblingSpecs] = await Promise.all([
      getProduct(id, specId, brandId ?? undefined),
      getSiblingSpecs(id, specId, brandId ?? undefined).catch(() => [] as SiblingSpec[]),
    ]);
    setEx(ctx, buildExtrasFromProduct(product, siblingSpecs, brandId ?? undefined));
  };

  // ---------- 品牌操作 ----------
  const handleBrandResolve = (ctx: ArchiveDialogCtx<T>, idx: number, item: { id: string; name: string }) => {
    const ex = exOf(ctx);
    setEx(ctx, {
      brands: ex.brands.map((b, i) => (i === idx ? { ...b, name: item.name, brandId: item.id } : b)),
      activeBrandId: item.id,
    });
  };
  const handleBrandImagesChange = (ctx: ArchiveDialogCtx<T>, idx: number, images: ImageItem[]) => {
    const ex = exOf(ctx);
    setEx(ctx, { brands: ex.brands.map((b, i) => (i === idx ? { ...b, images } : b)) });
  };
  const handleConversionsChange = (ctx: ArchiveDialogCtx<T>, brandIdx: number, conversions: Record<string, string>) => {
    const ex = exOf(ctx);
    setEx(ctx, { brands: ex.brands.map((b, i) => (i === brandIdx ? { ...b, conversions } : b)) });
  };
  const handleSetBaseUnit = (ctx: ArchiveDialogCtx<T>, newBaseIdx: number) => {
    const ex = exOf(ctx);
    const newBase = ex.units[newBaseIdx];
    if (!newBase) return;
    setEx(ctx, {
      brands: ex.brands.map((b) => {
        const factor = parseFloat(b.conversions[newBase.rowKey] ?? '');
        const valid = !isNaN(factor) && factor > 0;
        const next: Record<string, string> = {};
        if (valid) {
          ex.units.forEach((u) => {
            const v = parseFloat(b.conversions[u.rowKey] ?? '');
            if (!isNaN(v)) next[u.rowKey] = String(Math.round((v / factor) * 10000) / 10000);
          });
        }
        next[newBase.rowKey] = '1';
        return { ...b, conversions: next };
      }),
      units: ex.units.map((u, i) => (i === newBaseIdx ? { ...u, isBase: true } : { ...u, isBase: false })),
    });
  };
  const handleAddBrandConfirm = async (ctx: ArchiveDialogCtx<T>, nameInput: string) => {
    const trimmed = nameInput.trim();
    if (!trimmed || !ctx.canWrite) return;
    const ex = exOf(ctx);
    let resolved: { id?: string; name: string } = { name: trimmed };
    try {
      const list = await brandDict.list();
      const matched = list.find((b) => b.name === trimmed);
      if (matched) resolved = { id: String(matched.id), name: matched.name };
      else {
        const created = await brandDict.create(trimmed);
        resolved = { id: String(created.id), name: created.name };
      }
    } catch {
      /* 字典不可用：保存时兜底 */
    }
    setEx(ctx, {
      brands: (() => {
        const item: BrandItem = { rowKey: genRowKey('brand'), name: resolved.name, brandId: resolved.id, images: [], conversions: {} };
        const next = [...ex.brands, item];
        return next;
      })(),
      currentBrandIdx: ex.brands.length,
      activeBrandId: resolved.id ? resolved.id : ex.activeBrandId,
    });
  };
  const handleDeleteBrand = (ctx: ArchiveDialogCtx<T>, idx: number) => {
    const ex = exOf(ctx);
    const brand = ex.brands[idx];
    if (!brand) return;
    ctx.modalConfirm({ title: '删除品牌', content: `确认删除品牌「${brand.name || '未命名'}」吗？该品牌的售价、进价、图片将被一并删除。`, okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: () => {
      setEx(ctx, (() => {
        const next = ex.brands.filter((_, i) => i !== idx);
        const salePrices = ex.salePrices.filter((p) => p.brandIdx !== idx).map((p) => (p.brandIdx > idx ? { ...p, brandIdx: p.brandIdx - 1 } : p));
        const purchasePrices = ex.purchasePrices.filter((p) => p.brandIdx !== idx).map((p) => (p.brandIdx > idx ? { ...p, brandIdx: p.brandIdx - 1 } : p));
        const currentBrandIdx = (() => {
          if (next.length === 0) return 0;
          if (idx === ex.currentBrandIdx) return Math.max(0, Math.min(idx, next.length - 1));
          if (idx < ex.currentBrandIdx) return ex.currentBrandIdx - 1;
          return ex.currentBrandIdx;
        })();
        const activeBrandId = next.length > 0 ? (next[currentBrandIdx]?.brandId ?? next[currentBrandIdx]?.id ?? null) : null;
        return { brands: next, salePrices, purchasePrices, currentBrandIdx, activeBrandId };
      })());
    } });
  };
  const handleSelectProductBrand = (ctx: ArchiveDialogCtx<T>, brandId: string) => {
    const ex = exOf(ctx);
    if (String(brandId) === String(ex.activeBrandId ?? '') || !ctx.canWrite) return;
    const brands = ex.brands;
    const idxOnSpec = brands.findIndex((b) => String(b.brandId ?? '') === String(brandId));
    if (idxOnSpec >= 0) setEx(ctx, { currentBrandIdx: idxOnSpec });
    if (!ex.currentProductId) return;
    const trimmed = ex.specModel.trim();
    const specsWithBrand = ex.siblingSpecs.filter((s) => s.brands?.some((b) => String(b.id ?? '') === String(brandId)));
    const target = (trimmed ? specsWithBrand.find((s) => s.specModel === trimmed) : undefined) ?? specsWithBrand.find((s) => s.id === ex.currentSpecId) ?? specsWithBrand[0];
    void loadProductInto(ctx, ex.currentProductId, target?.id, brandId);
  };

  // ---------- 规格操作 ----------
  const handleSwitchSpec = (ctx: ArchiveDialogCtx<T>, specId: string) => {
    const ex = exOf(ctx);
    if (specId === ex.currentSpecId || !ctx.canWrite) return;
    ctx.modalConfirm({ title: '切换规格？', content: '切换规格将放弃当前未保存的修改，确定切换吗？', okText: '切换', cancelText: '取消', onOk: () => {
      if (ex.currentProductId) void loadProductInto(ctx, ex.currentProductId, specId, ex.activeBrandId);
    } });
  };
  const handleAddSiblingSpec = (ctx: ArchiveDialogCtx<T>, initialSpecModel?: string) => {
    setEx(ctx, { creatingSibling: true, currentSpecId: null, specModel: initialSpecModel ?? '', specRemark: '', salePrices: [], purchasePrices: [] });
  };
  const handleDeleteSpec = (ctx: ArchiveDialogCtx<T>, spec: SiblingSpec) => {
    const ex = exOf(ctx);
    if (!ctx.canWrite) return;
    const doDelete = () => {
      ctx.modalConfirm({ title: '删除规格', content: `确认删除规格「${spec.specModel || '(空)'}」？此操作不可恢复。`, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
        try {
          await deleteSpec(spec.id);
          ctx.message('规格已删除');
          if (ex.currentProductId) void loadProductInto(ctx, ex.currentProductId, undefined, ex.activeBrandId);
          opts.onSaved?.();
        } catch {
          ctx.message('删除失败，请重试');
        }
      } });
    };
    void getSpecDocRefs(spec.id)
      .then((refs) => {
        const docCount = refs.docLineCount ?? 0;
        if (docCount > 0) {
          ctx.modalConfirm({ title: '删除规格', content: `规格「${spec.specModel}」已被 ${docCount} 个单据行引用，删除后单据中的快照信息保留，但产品数据将不可恢复。确认删除？`, okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
            try { await deleteSpec(spec.id); ctx.message('规格已删除'); if (ex.currentProductId) void loadProductInto(ctx, ex.currentProductId, undefined, ex.activeBrandId); opts.onSaved?.(); } catch { ctx.message('删除失败，请重试'); }
          } });
        } else doDelete();
      })
      .catch(() => doDelete());
  };

  // ---------- 单位操作（删单位后价格行 unitIdx 重映射）----------
  const handleUnitsChange = (ctx: ArchiveDialogCtx<T>, newUnits: UnitItem[]) => {
    const ex = exOf(ctx);
    const oldUnits = ex.units;
    const newIdxByRowKey = new Map<string, number>();
    newUnits.forEach((u, i) => newIdxByRowKey.set(u.rowKey, i));
    const remapUnitIdx = (oldIdx: number): number | null => {
      const u = oldUnits[oldIdx];
      if (!u) return null;
      const ni = newIdxByRowKey.get(u.rowKey);
      return ni != null ? ni : null;
    };
    setEx(ctx, {
      units: newUnits,
      salePrices: ex.salePrices.map((p) => { const ni = remapUnitIdx(p.unitIdx); return ni != null ? { ...p, unitIdx: ni } : null; }).filter((x): x is SalePriceItem => x != null),
      purchasePrices: ex.purchasePrices.map((p) => { const ni = remapUnitIdx(p.unitIdx); return ni != null ? { ...p, unitIdx: ni } : null; }).filter((x): x is PurchasePriceItem => x != null),
    });
  };

  // ---------- seed / loadSeed ----------
  const seed = (row: T | null): ArchiveSeed => {
    if (row && (row as any).productId != null) {
      const r = row as any;
      return {
        draft: { productName: r.productName ?? '', category: r.categoryName ?? '', remark: r.remark ?? '' },
        matrices: {},
        extras: { ...emptyExtras(), currentProductId: String(r.productId) } as unknown as Record<string, unknown>,
      };
    }
    return { draft: { productName: '', category: '', remark: '' }, matrices: {}, extras: emptyExtras() as unknown as Record<string, unknown> };
  };

  const loadSeed = async (row: T | null): Promise<Partial<ArchiveSeed>> => {
    const priceTypes = (await listPriceTypes().catch(() => [])).filter((p: PriceTypeView) => p.status === 1);
    if (!row || (row as any).productId == null) {
      return { draft: { productName: '', category: '', remark: '' }, matrices: {}, extras: { ...emptyExtras(), priceTypes } as unknown as Record<string, unknown> };
    }
    const r = row as any;
    try {
      const product = await getProduct(String(r.productId), r.specId, r.specBrandId);
      const siblingSpecs = await getSiblingSpecs(String(r.productId), r.specId, r.specBrandId).catch(() => [] as SiblingSpec[]);
      return {
        draft: { productName: product.name ?? '', category: product.category?.name ?? '', remark: product.remark ?? '' },
        matrices: {},
        extras: { ...buildExtrasFromProduct(product, siblingSpecs, r.specBrandId), priceTypes },
      };
    } catch {
      return { draft: { productName: r.productName ?? '', category: r.categoryName ?? '', remark: r.remark ?? '' }, matrices: {}, extras: { ...emptyExtras(), priceTypes } };
    }
  };

  // ---------- beforeSave（异步确认：分类解析 + 规格重复 + 空品牌 + 自动补默认确认）----------
  const beforeSave = async (ctx: ArchiveBeforeSaveCtx<T>): Promise<boolean> => {
    const draft = ctx.draft;
    const ex = { ...emptyExtras(), ...(ctx.extras ?? {}) } as unknown as ProductEditExtras;
    const trimmedName = (draft['productName'] ?? '').trim();
    const block = resolveGuard('product_save', { form: { productName: trimmedName } });
    if (block) {
      ctx.message(block);
      return false;
    }
    if (specDuplicateOf(ex)) {
      ctx.message('系列/规格与同品牌下其他条目重复，请修改');
      return false;
    }
    const emptyExistingBrand = ex.brands.find((b) => b.id && !b.name.trim());
    if (emptyExistingBrand) {
      ctx.message('品牌名不能为空：请补全品牌名，或使用「删除品牌」按钮删除该品牌');
      return false;
    }
    // 分类解析（输入文字 ↔ ID 一致）
    const categoryInput = (draft['category'] ?? '').trim();
    let resolvedCategoryId = ex.categoryId;
    if (categoryInput) {
      try {
        const list = await listCategories();
        const matched = list.find((c) => c.name === categoryInput);
        if (matched) resolvedCategoryId = matched.id;
        else {
          const created = await createCategory({ name: categoryInput, status: 1 });
          resolvedCategoryId = created.id;
        }
      } catch {
        resolvedCategoryId = 0;
      }
    } else {
      resolvedCategoryId = 0;
    }
    // 原地写回（collectPayload 读的是同一个 raw extras 对象，必须改本体而非副本）
    const rawExtras = (ctx.extras ?? {}) as Record<string, unknown>;
    rawExtras['categoryId'] = resolvedCategoryId;

    // 自动补默认确认
    const presentBrandNames = ex.brands.filter((b) => b.name.trim()).map((b) => b.name.trim());
    const saleNoTypeCount = ex.salePrices.filter((p) => p.price.trim() && !p.priceTypeId).length;
    const purNoSupCount = ex.purchasePrices.filter((p) => p.price.trim() && !p.supplierId).length;
    const rawValues: Record<string, string> = {
      productName: trimmedName,
      category: categoryInput,
      brand: presentBrandNames.join('、'),
      specModel: ex.specModel,
      unitName: ex.units.map((u) => u.unitName).join('、'),
    };
    const previewFields = productLayer.fields.map((f) => {
      const resolved = resolveFieldValue(f, rawValues[f.key] ?? '');
      return { label: f.label, value: resolved.value, auto: resolved.auto, required: f.required };
    });
    if (previewFields.some((f) => f.auto) || saleNoTypeCount > 0 || purNoSupCount > 0) {
      const priceLayer = QUICK_CREATE_LAYERS.price;
      const priceTypeCfg = priceLayer.fields.find((f) => f.key === 'priceType')!;
      const supplierCfg = priceLayer.fields.find((f) => f.key === 'supplier')!;
      const notes: string[] = [];
      if (saleNoTypeCount > 0) notes.push(`售价 ${saleNoTypeCount} 行自动补充价格类型「${priceTypeCfg.fallback}」`);
      if (purNoSupCount > 0) notes.push(`进价 ${purNoSupCount} 行自动补充供应商「${supplierCfg.fallback}」`);
      const confirmed = await confirmFillsBeforeSave(ctx.modal, { groups: [{ title: productLayer.title, fields: previewFields }], notes });
      if (!confirmed) return false;
    }
    return true;
  };

  // ---------- collectPayload（组装 SaveProductInput；镜像原 handleSave 装配）----------
  const collectPayload = (
    draft: Record<string, string>,
    _matrices: Record<string, unknown[]>,
    extras: Record<string, unknown>,
    _isCreate: boolean,
  ): Record<string, unknown> => {
    const ex = { ...emptyExtras(), ...(extras ?? {}) } as unknown as ProductEditExtras;
    const trimmedName = (draft['productName'] ?? '').trim();
    const trimmedSpecModel = ex.specModel.trim() || fieldConfig('specModel').fallback;
    const effectiveUnits =
      ex.units.length === 0
        ? [{ rowKey: genRowKey('unit'), unitName: fieldConfig('unitName').fallback, isBase: true, isDisplay: true }]
        : ex.units.some((u) => u.isBase)
          ? ex.units
          : ex.units.map((u, i) => (i === 0 ? { ...u, isBase: true } : u));

    const nonEmptyBrands = ex.brands.filter((b) => b.name.trim());
    if (nonEmptyBrands.length === 0) {
      nonEmptyBrands.push({ rowKey: genRowKey('brand'), name: fieldConfig('brand').fallback, images: [], conversions: {} });
    }

    const brandIdxMap = new Map<number, number>();
    const brandsInput: ProductBrandInput[] = nonEmptyBrands.map((b, newIdx) => {
      const oldIdx = ex.brands.indexOf(b);
      brandIdxMap.set(oldIdx, newIdx);
      return {
        id: b.id,
        name: b.name.trim(),
        images: b.images.map((img) => ({
          imageUrl: img.imageUrl,
          mediumUrl: img.mediumUrl,
          thumbnailUrl: img.thumbnailUrl,
          width: img.width,
          height: img.height,
          size: img.size,
          hash: img.hash,
          sortOrder: img.sortOrder,
          isMain: img.isMain ? 1 : 0,
        })),
        conversions: effectiveUnits
          .map((u, unitIdx): { unitIdx: number; conversionRate: string } | null => {
            const raw = (b.conversions[u.rowKey] ?? '').trim();
            if (effectiveUnits[unitIdx]?.isBase) return { unitIdx, conversionRate: '1' };
            if (!raw) return null;
            return { unitIdx, conversionRate: raw };
          })
          .filter((c): c is { unitIdx: number; conversionRate: string } => c !== null),
      };
    });

    const unitsInput: ProductUnitInput[] = effectiveUnits.map((u) => ({ id: u.id, unitName: u.unitName.trim(), isBase: u.isBase, isDisplay: u.isDisplay }));

    const defaultPriceType = ex.priceTypes.find((pt) => pt.name === '零售价');
    const salePricesInput: ProductSalePriceInput[] = ex.salePrices
      .filter((p) => p.price.trim())
      .flatMap((p) => {
        const newBrandIdx = brandIdxMap.get(p.brandIdx);
        if (newBrandIdx === undefined) return [];
        return [{ brandIdx: newBrandIdx, unitIdx: p.unitIdx, priceTypeId: p.priceTypeId || defaultPriceType?.id || undefined, price: p.price.trim(), isDefault: p.isDefault }];
      });
    const purchasePricesInput: ProductPurchasePriceInput[] = ex.purchasePrices
      .filter((p) => p.price.trim())
      .flatMap((p) => {
        const newBrandIdx = brandIdxMap.get(p.brandIdx);
        if (newBrandIdx === undefined) return [];
        return [{ brandIdx: newBrandIdx, unitIdx: p.unitIdx, supplierId: p.supplierId || undefined, isDefault: p.isDefault, price: p.price.trim() }];
      });

    const input: SaveProductInput = {
      id: ex.currentProductId ?? undefined,
      specId: ex.currentSpecId ?? undefined,
      name: trimmedName,
      specModel: trimmedSpecModel,
      categoryId: ex.categoryId,
      remark: (draft['remark'] ?? '').trim(),
      specRemark: ex.specRemark.trim(),
      units: unitsInput,
      brands: brandsInput,
      salePrices: salePricesInput,
      purchasePrices: purchasePricesInput,
    };
    return input as unknown as Record<string, unknown>;
  };

  const validate = (payload: Record<string, unknown>): string | null => {
    const name = String(payload['name'] ?? '').trim();
    if (!name) return '产品名称不能为空';
    return null;
  };

  const afterSave: ProductEditParts<T>['afterSave'] = async () => {
    opts.onSaved?.();
  };

  const create = (payload: Record<string, unknown>) => saveProduct(payload as unknown as SaveProductInput).then(() => undefined);
  const update = (id: string, payload: Record<string, unknown>) =>
    saveProduct({ ...(payload as unknown as SaveProductInput), id } as unknown as SaveProductInput).then(() => undefined);

  return { editSlots, seed, loadSeed, beforeSave, collectPayload, validate, afterSave, create, update };
}
