// ImageThumbCell — 图片缩略图列（共享组件，表格工程范式「图片字段」落地）
//
// 设计依据：表格设计理念「点即所得」——图片列：有图点缩略图看大图（不改数据），
//   无图点占位进编辑补图；列表加载缩略图，预览才加载原图。
//   产品管理「图」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   - 有图：24×24 缩略图，点击 → 大图预览（原图），lazy + decoding=async
//   - 无图：24×24 占位 + PictureOutlined，点击 → 打开编辑弹窗补图
//   - 创建入口行：24×24 占位 + PlusOutlined
//
// 聚合行规格预览（父子视图，如产品行 ← 规格）：单元格只渲染当前规格默认图（无箭头），
//   点击打开大图预览，预览内分两个区域（层级与数据天然范式对齐）：
//   - 预览区：左右箭头只翻「当前选中规格」自己的图片
//   - 规格选择区：底部横条铺各规格首图，点击切换规格（选中态描边）
//
// 复用方式：差异通过 props 注入（url/thumbUrl/specGroups/onClick/emptyIcon），
//   全项目所有「表格图片列」场景统一使用，禁止各页面自造图片单元格。

import { useState } from 'react';
import { Image, Modal } from 'antd';
import {
  CloseOutlined,
  LeftOutlined,
  PictureOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { resolveImageUrl } from '../../utils/resolveImageUrl.js';

/** 聚合行单规格图片组：images[0] 即该规格默认图（isMain 优先） */
export interface ImageSpecGroup {
  key: string;
  /** tooltip 用（如规格型号） */
  label?: string;
  images: { url: string; thumbUrl: string | null }[];
}

export interface ImageThumbCellProps {
  /** 原图 URL（大图预览用） */
  url?: string | null;
  /** 缩略图 URL（列表显示用；缺省回退 url） */
  thumbUrl?: string | null;
  /** 聚合行规格图片组（父子视图）：提供时点击打开「规格分区的预览」 */
  specGroups?: ImageSpecGroup[] | null;
  /** 无图占位点击回调（打开编辑弹窗补图） */
  onEmptyClick?: () => void;
  /** 创建入口行占位（PlusOutlined 而非 PictureOutlined） */
  creation?: boolean;
}

/** 图片缩略图列：有图缩略图+大图预览（聚合行带规格选择条），无图占位+点击补图 */
export function ImageThumbCell({
  url,
  thumbUrl,
  specGroups,
  onEmptyClick,
  creation,
}: ImageThumbCellProps) {
  const [specIdx, setSpecIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // 聚合行：单元格只渲染当前规格默认图；预览内分区（预览区翻规格内图 + 规格选择条）
  if (specGroups && specGroups.length > 0) {
    const idx = Math.min(specIdx, specGroups.length - 1);
    const group = specGroups[idx] ?? specGroups[0];
    const cur = group.images[0];
    const cellThumb = resolveImageUrl(cur?.thumbUrl || cur?.url || url || thumbUrl || '');

    const openPreview = () => {
      setSpecIdx(idx);
      setImgIdx(0);
      setPreviewOpen(true);
    };
    const switchSpec = (i: number) => {
      setSpecIdx(i);
      setImgIdx(0);
    };
    const stepImg = (dir: 1 | -1) => {
      const n = group.images.length;
      if (n <= 1) return;
      setImgIdx((imgIdx + dir + n) % n);
    };

    return (
      <>
        <img
          src={cellThumb}
          data-shared-badge="C36"
          width={24}
          height={24}
          alt=""
          loading="lazy"
          decoding="async"
          title={`${group.label ?? ''}${specGroups.length > 1 ? `（${specGroups.length} 个规格，点击查看）` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            openPreview();
          }}
          style={{
            objectFit: 'cover',
            borderRadius: 'var(--radius-2)',
            cursor: 'pointer',
            display: 'block',
          }}
        />
        <Modal
          open={previewOpen}
          onCancel={() => setPreviewOpen(false)}
          footer={null}
          width="fit-content"
          centered
          closable={false}
          styles={{ body: { background: 'transparent', padding: 0, boxShadow: 'none' } }}
          maskClosable
        >
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => setPreviewOpen(false)}
              style={{
                position: 'absolute',
                top: -8,
                right: -8,
                zIndex: 1,
                width: 26,
                height: 26,
                border: 'none',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
              }}
            >
              <CloseOutlined />
            </button>
            {/* 预览区：左右只翻当前规格内的图 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {group.images.length > 1 && (
                <button
                  type="button"
                  aria-label="上一张"
                  onClick={() => stepImg(-1)}
                  style={{
                    position: 'absolute',
                    left: 8,
                    zIndex: 1,
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                  }}
                >
                  <LeftOutlined />
                </button>
              )}
              <img
                src={resolveImageUrl(group.images[imgIdx]?.url ?? cur?.url ?? '')}
                alt=""
                style={{ maxWidth: '70vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
              />
              {group.images.length > 1 && (
                <button
                  type="button"
                  aria-label="下一张"
                  onClick={() => stepImg(1)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    zIndex: 1,
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                  }}
                >
                  <RightOutlined />
                </button>
              )}
            </div>
            {/* 规格选择区：各规格首图横条，点击切规格 */}
            {specGroups.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: 8,
                  background: 'rgba(0,0,0,0.55)',
                  borderRadius: 8,
                  maxWidth: '76vw',
                  overflowX: 'auto',
                }}
              >
                {specGroups.map((g, i) => (
                  <button
                    key={g.key}
                    type="button"
                    title={g.label ?? ''}
                    onClick={() => switchSpec(i)}
                    style={{
                      flexShrink: 0,
                      padding: 2,
                      border: 'none',
                      borderRadius: 'var(--radius-2)',
                      background: 'transparent',
                      cursor: 'pointer',
                      outline: i === idx ? '2px solid var(--text-brand)' : '2px solid transparent',
                    }}
                  >
                    <img
                      src={resolveImageUrl(g.images[0]?.thumbUrl || g.images[0]?.url || '')}
                      width={40}
                      height={40}
                      alt=""
                      loading="lazy"
                      style={{ objectFit: 'cover', borderRadius: 'var(--radius-2)', display: 'block' }}
                    />
                  </button>
                ))}
              </div>
            )}
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center' }}>
              {group.label ?? ''}
              {group.images.length > 1 ? ` · ${imgIdx + 1}/${group.images.length}` : ''}
            </div>
          </div>
        </Modal>
      </>
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
