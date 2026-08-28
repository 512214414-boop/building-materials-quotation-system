import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox } from 'antd';
import DsButton from '../../../../shared/components/DsButton.js';
import DsDialog from '../../../../shared/components/DsDialog.js';
import {
  deleteProduct,
  getProductDeletePreview,
  type ProductDeletePreview,
  type ProductDeletePreviewImage,
  type SkuSearchRow,
} from '../../../../shared/services/api/baseDataApi.js';
import { runParallelLimit } from '../../../../shared/utils/runParallelLimit.js';
import { useCanvasApp } from '../../../../shared/hooks/useCanvasApp.js';

type MergedImage = ProductDeletePreviewImage & {
  removeCount: number;
  remainingRefCount: number;
};

function mergeDeletePreviewImages(
  previews: ProductDeletePreview[],
): MergedImage[] {
  const map = new Map<string, MergedImage>();
  for (const preview of previews) {
    for (const img of preview.images) {
      const existing = map.get(img.imageUrl);
      if (existing) {
        existing.removeCount += img.productLinkCount;
        existing.remainingRefCount = img.refCount - existing.removeCount;
      } else {
        map.set(img.imageUrl, {
          ...img,
          removeCount: img.productLinkCount,
          remainingRefCount: img.refCount - img.productLinkCount,
        });
      }
    }
  }
  return Array.from(map.values());
}

export interface ProductDeleteConfirmDialogProps {
  open: boolean;
  skus: SkuSearchRow[];
  onClose: () => void;
  onDeleted: () => void;
}

export default function ProductDeleteConfirmDialog({
  open,
  skus,
  onClose,
  onDeleted,
}: ProductDeleteConfirmDialogProps) {
  const { message } = useCanvasApp();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previews, setPreviews] = useState<ProductDeletePreview[]>([]);
  const [step, setStep] = useState<'confirm' | 'images'>('confirm');
  const [purgeOrphanFiles, setPurgeOrphanFiles] = useState(false);

  const isSingle = skus.length === 1;
  const preview = isSingle ? previews[0] : null;
  const mergedImages = useMemo(() => mergeDeletePreviewImages(previews), [previews]);
  const hasImages = mergedImages.length > 0;

  const skuKey = useMemo(() => skus.map((s) => s.productId).join(','), [skus]);

  useEffect(() => {
    if (!open || skus.length === 0) return;
    setStep('confirm');
    setPurgeOrphanFiles(false);
    setPreviews([]);
    let cancelled = false;
    setLoadingPreview(true);
    void Promise.all(skus.map((sku) => getProductDeletePreview(sku.productId)))
      .then((list) => {
        if (cancelled) return;
        setPreviews(list);
      })
      .catch((e) => {
        if (cancelled) return;
        message.error((e as Error).message || '加载删除预览失败');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, skuKey, skus, message, onClose]);

  const handleClose = useCallback(() => {
    if (deleting) return;
    onClose();
  }, [deleting, onClose]);

  const executeDelete = useCallback(async () => {
    setDeleting(true);
    try {
      let totalDocRefs = 0;
      await runParallelLimit(skus, 5, async (sku) => {
        const result = await deleteProduct(sku.productId, { purgeOrphanFiles });
        totalDocRefs += result.deletedDocLineRefs ?? 0;
      });
      message.success(
        skus.length === 1
          ? totalDocRefs > 0
            ? `已删除（历史单据 ${totalDocRefs} 行保留快照展示）`
            : '已删除'
          : `已删除 ${skus.length} 个产品`,
      );
      onDeleted();
      onClose();
    } catch (e) {
      message.error((e as Error).message || '删除失败');
    } finally {
      setDeleting(false);
    }
  }, [skus, purgeOrphanFiles, message, onDeleted, onClose]);

  const handlePrimary = useCallback(() => {
    if (loadingPreview || deleting) return;
    if (step === 'confirm') {
      if (hasImages) {
        setStep('images');
        return;
      }
      void executeDelete();
      return;
    }
    void executeDelete();
  }, [loadingPreview, deleting, step, hasImages, executeDelete]);

  const sharedCount = mergedImages.filter((img) => img.remainingRefCount > 0).length;
  const orphanCount = mergedImages.filter((img) => img.remainingRefCount === 0).length;

  const title =
    step === 'images'
      ? '图片影响范围'
      : isSingle
        ? '确认物理删除整个产品？'
        : `确认物理删除 ${skus.length} 个产品？`;

  return (
    <DsDialog
      open={open}
      title={title}
      width={step === 'images' ? 560 : 480}
      onCancel={handleClose}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {step === 'images' ? (
            <DsButton variant="ghost" size="sm" disabled={deleting} onClick={() => setStep('confirm')}>
              上一步
            </DsButton>
          ) : null}
          <DsButton variant="ghost" size="sm" disabled={deleting} onClick={handleClose}>
            取消
          </DsButton>
          <DsButton
            variant={step === 'images' || !hasImages ? 'danger' : 'primary'}
            size="sm"
            loading={loadingPreview || deleting}
            disabled={loadingPreview || skus.length === 0}
            onClick={handlePrimary}
          >
            {step === 'confirm' && hasImages ? '下一步' : '物理删除'}
          </DsButton>
        </div>
      }
    >
      {step === 'confirm' ? (
        <div>
          {isSingle && preview ? (
            <>
              <div style={{ fontWeight: 500 }}>{`${skus[0].productName} ${skus[0].specModel}`}</div>
              {preview.brandCount > 1 && (
                <div style={{ color: 'var(--status-error)', marginTop: 6, fontWeight: 500 }}>
                  {`⚠ 该产品下有 ${preview.brandCount} 个品牌，删除将一并清除所有品牌数据`}
                </div>
              )}
              <div style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
                {`将删除整个产品，包括 ${preview.brandCount} 个品牌、${preview.unitCount} 个单位、所有售价/进价/图片关联。`}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-tertiary)' }}>
              每个产品含其下全部品牌、单位、售价/进价/图片。列表多行勾选同一产品只计一次。
            </div>
          )}
          <div style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
            如需删除单个品牌，请在编辑弹窗中操作。历史单据快照保留。
          </div>
          <div style={{ marginTop: 10 }}>
            <Checkbox
              checked={purgeOrphanFiles}
              onChange={(e) => setPurgeOrphanFiles(e.target.checked)}
            >
              同时清理已无引用的图片文件
            </Checkbox>
          </div>
          <div
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 'var(--body-xs-font-size)',
              marginTop: 4,
            }}
          >
            勾选后：仅当图片不再被任何产品引用时才删除磁盘文件；被其他产品共用的图片文件不会误删。
          </div>
        </div>
      ) : (
        <div>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
            {`共 ${mergedImages.length} 张图片关联将被移除。`}
            {sharedCount > 0
              ? ` 其中 ${sharedCount} 张仍被其他产品引用，仅移除本操作涉及产品的关联，磁盘文件保留。`
              : ''}
            {purgeOrphanFiles && orphanCount > 0
              ? ` 勾选清理后，${orphanCount} 张无其他引用的图片文件将从磁盘删除。`
              : purgeOrphanFiles
                ? ''
                : ' 未勾选清理时，磁盘文件一律保留（可在图片库中手动管理）。'}
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 'var(--body-xs-font-size)' }}>
            {mergedImages.map((img) => (
              <div
                key={img.imageUrl}
                style={{
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                }}
              >
                <div style={{ fontWeight: 500 }}>
                  {img.remainingRefCount > 0
                    ? `共享 · 全库 ${img.refCount} 处引用，删除后仍剩 ${img.remainingRefCount} 处`
                    : `独占 · 删除关联后${purgeOrphanFiles ? '将清理磁盘文件' : '磁盘文件保留'}`}
                </div>
                {img.otherProducts.length > 0 && (
                  <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                    仍被引用：
                    {img.otherProducts
                      .slice(0, 3)
                      .map((p) => `${p.productName}·${p.brandName}`)
                      .join('；')}
                    {img.otherProducts.length > 3 ? ` 等 ${img.otherProducts.length} 处` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </DsDialog>
  );
}
