import { useState } from 'react';
import { App as AntdApp, Image, Spin, Upload } from 'antd';
import {
  DeleteOutlined,
  PictureOutlined,
  UploadOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import {
  uploadProductImage,
  type ProductImageLibraryItem,
} from '../../../../shared/services/api/baseDataApi.js';
import { genRowKey } from '../../../../shared/components/UnitPriceExpandPanel.js';
import { compressImage } from '../../../../shared/utils/imageCompress.js';
import { resolveImageUrl } from '../../../../shared/utils/resolveImageUrl.js';
import ProductImageLibraryPicker from './ProductImageLibraryPicker.js';
import type { ImageItem } from './productEditTypes.js';

// ============================================================
// §9 品牌图片区（依附当前品牌）
// 图片列表 + 设为主图 + 上传
// ============================================================

interface BrandImagesProps {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  disabled?: boolean;
  /** v1.5.6 上下文接入：当前 SPU 产品名（预填图片库检索关键词，模糊匹配同款） */
  contextProductName?: string;
  /** v1.5.6 上下文接入：当前 SPU 分类 ID（图片库默认筛选该分类） */
  contextCategoryId?: number;
}

export function BrandImages({
  images,
  onImagesChange,
  disabled,
  contextProductName,
  contextCategoryId,
}: BrandImagesProps) {
  const { message } = AntdApp.useApp();
  const [uploading, setUploading] = useState(false);
  // v1.5.4：从图片库选择（复用已有图片，内容寻址物理文件不重复存储）
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleSelectFromLibrary = (item: ProductImageLibraryItem) => {
    if (disabled) return;
    // 复用库图片（URL/hash 同源），追加到当前品牌图片列表（保存时随 saveProduct 落库）
    onImagesChange([
      ...images,
      {
        rowKey: genRowKey('img'),
        imageUrl: item.imageUrl,
        mediumUrl: item.mediumUrl,
        thumbnailUrl: item.thumbnailUrl,
        width: item.width,
        height: item.height,
        size: item.size,
        hash: item.hash,
        sortOrder: images.length,
        isMain: images.length === 0,
      },
    ]);
    setLibraryOpen(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // v11.0：上传前预压缩（5MB+ 原片 → 200-500KB，节省存储与加载时间）
      //   后端 imageProcessor 会用 sharp 生成三版本 WebP + 计算 hash
      //   前端预压缩主要节省上传带宽，后端处理已无大文件压力
      const compressed = await compressImage(file);
      const res = await uploadProductImage(compressed);
      onImagesChange([
        ...images,
        {
          rowKey: genRowKey('img'),
          imageUrl: res.imageUrl,
          mediumUrl: res.mediumUrl,
          thumbnailUrl: res.thumbnailUrl,
          width: res.width,
          height: res.height,
          size: res.size,
          hash: res.hash,
          sortOrder: images.length,
          isMain: images.length === 0,
        },
      ]);
    } catch (e) {
      message.error((e as Error).message || '上传失败');
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd 默认上传
  };

  const handleSetMain = (idx: number) => {
    onImagesChange(images.map((img, i) => ({ ...img, isMain: i === idx })));
  };

  const handleDelete = (idx: number) => {
    const filtered = images.filter((_, i) => i !== idx);
    // 若删除的是主图，自动将第一张设为主图
    if (filtered.length > 0 && !filtered.some((img) => img.isMain)) {
      filtered[0].isMain = true;
    }
    onImagesChange(filtered);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 8 }}>
        {images.map((img, idx) => (
          <div
            key={img.rowKey}
            style={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-3)',
              overflow: 'hidden',
              border: img.isMain
                ? '2px solid var(--text-brand)'
                : '1px solid var(--border-neutral-l2)',
            }}
          >
            {/* v1.5.4：点击图片 → 大图预览（原图），方便给客户查看样式 */}
            <Image
              src={resolveImageUrl(img.mediumUrl || img.imageUrl)}
              width={80}
              height={80}
              preview={{ src: resolveImageUrl(img.imageUrl) }}
              alt={`图片 ${idx + 1}`}
              loading="lazy"
              decoding="async"
              style={{ objectFit: 'cover', display: 'block' }}
            />
            {/* 主图标记 */}
            <button
              type="button"
              onClick={() => handleSetMain(idx)}
              title={img.isMain ? '当前主图' : '设为主图'}
              disabled={disabled}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                border: 'none',
                background: 'var(--bg-overlay-modal)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: img.isMain ? 'var(--status-star-default)' : 'var(--text-on-accent)',
              }}
            >
              {img.isMain ? <StarFilled style={{ fontSize: 12 }} /> : <StarOutlined style={{ fontSize: 12 }} />}
            </button>
            {/* 删除按钮 */}
            <button
              type="button"
              onClick={() => handleDelete(idx)}
              title="删除图片"
              disabled={disabled}
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                border: 'none',
                background: 'var(--bg-overlay-modal)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: 'var(--status-error-default)',
              }}
            >
              <DeleteOutlined style={{ fontSize: 12 }} />
            </button>
          </div>
        ))}

        {/* 上传按钮 */}
        <Upload
          showUploadList={false}
          beforeUpload={handleUpload}
          accept="image/*"
          disabled={uploading || disabled}
        >
          <div
            style={{
              width: 80,
              height: 80,
              border: '1px dashed var(--border-neutral-l2)',
              borderRadius: 'var(--radius-3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: uploading || disabled ? 'not-allowed' : 'pointer',
              color: 'var(--text-tertiary)',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? <Spin size="small" /> : <UploadOutlined style={{ fontSize: 20 }} />}
            <span style={{ fontSize: 10, marginTop: 4 }}>上传图片</span>
          </div>
        </Upload>

        {/* v1.5.4：从图片库选择（复用已有图片，避免重复上传/存储） */}
        <div
          onClick={() => {
            if (!disabled) setLibraryOpen(true);
          }}
          style={{
            width: 80,
            height: 80,
            border: '1px dashed var(--border-neutral-l2)',
            borderRadius: 'var(--radius-3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-overlay-l1)',
          }}
          title="从已有图片库选择复用"
        >
          <PictureOutlined style={{ fontSize: 20 }} />
          <span style={{ fontSize: 10, marginTop: 4 }}>图片库选择</span>
        </div>
      </div>
      {images.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>
          点击星标设为主图（当前: {images.find((img) => img.isMain) ? '已设' : '未设'}）
        </div>
      )}

      {/* v1.5.4：从图片库选择（共享组件） */}
      {/* v1.5.6：带入当前产品上下文（产品名模糊检索 + 当前分类默认筛选） */}
      <ProductImageLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleSelectFromLibrary}
        initialCategoryId={contextCategoryId}
        initialKeyword={contextProductName}
      />
    </div>
  );
}
