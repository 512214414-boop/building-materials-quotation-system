// ImageThumbCell — 图片缩略图列（共享组件，表格工程范式「图片字段」落地）
//
// 设计依据：表格设计理念「点即所得」——图片列：有图点缩略图看大图（不改数据），
//   无图点占位进编辑补图；列表加载缩略图，预览才加载原图。
//   产品管理「图」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   - 有图：24×24 缩略图，点击 → 大图预览（原图），lazy + decoding=async
//   - 无图：24×24 占位 + PictureOutlined，点击 → 打开编辑弹窗补图
//   - 创建入口行：24×24 占位 + PlusOutlined
//
// 复用方式：差异通过 props 注入（url/thumbUrl/onClick/emptyIcon），
//   全项目所有「表格图片列」场景统一使用，禁止各页面自造图片单元格。

import { Image } from 'antd';
import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { resolveImageUrl } from '../../utils/resolveImageUrl.js';

export interface ImageThumbCellProps {
  /** 原图 URL（大图预览用） */
  url?: string | null;
  /** 缩略图 URL（列表显示用；缺省回退 url） */
  thumbUrl?: string | null;
  /** 无图占位点击回调（打开编辑弹窗补图） */
  onEmptyClick?: () => void;
  /** 创建入口行占位（PlusOutlined 而非 PictureOutlined） */
  creation?: boolean;
}

/** 图片缩略图列：有图缩略图+大图预览，无图占位+点击补图 */
export function ImageThumbCell({
  url,
  thumbUrl,
  onEmptyClick,
  creation,
}: ImageThumbCellProps) {
  if (creation) {
    return (
      <div
        style={{
          width: 24,
          height: 24,
          background: 'var(--bg-overlay-l1)',
          borderRadius: 'var(--radius-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-quaternary)',
        }}
      >
        <PlusOutlined style={{ fontSize: 11 }} />
      </div>
    );
  }
  const src = url;
  if (!src) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          onEmptyClick?.();
        }}
        style={{
          width: 24,
          height: 24,
          background: 'var(--bg-overlay-l1)',
          borderRadius: 'var(--radius-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <PictureOutlined style={{ color: 'var(--text-quaternary)', fontSize: 11 }} />
      </div>
    );
  }
  const thumb = thumbUrl || url;
  return (
    // v1.5.4：点击缩略图 → 大图预览（不再打开编辑弹窗），方便查看产品样式
    // v1.5.4 性能：loading=lazy + decoding=async 减少列表首屏图片请求
    <Image
      src={resolveImageUrl(thumb)}
      data-shared-badge="C36"
      width={24}
      height={24}
      preview={{ src: resolveImageUrl(url || thumb) }}
      alt=""
      loading="lazy"
      decoding="async"
      onClick={(e) => e.stopPropagation()}
      style={{
        objectFit: 'cover',
        borderRadius: 'var(--radius-2)',
        cursor: 'pointer',
        display: 'block',
      }}
    />
  );
}

export default ImageThumbCell;
