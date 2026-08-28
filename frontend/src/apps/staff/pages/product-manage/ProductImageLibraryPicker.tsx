// v1.5.4 产品图片库选择器（共享组件）
//
// 设计依据：产品图片内容寻址存储（SHA-256 hash，同 hash 物理文件复用）。
//   用户需求「有的产品的图片是一样的可以复用，节省空间和重复录入上传」：
//   - 图片库 = 全部已上传图片按 hash 去重后的代表记录 + 引用数
//   - 选择已有图片挂到目标品牌时，仅新建 product_image 记录指向相同 URL，无需重新上传
//
// v1.5.5 检索 + 分组（用户「图片这么多没有检索怎么行 + 按分类分组显示，复用基本是同品类」指令）：
//   - 关键词检索：匹配 产品名/品牌/规格/分类（本地即时过滤，防抖避免大列表卡顿）
//   - 分类筛选：顶部 DsSelect 展示全部分类及数量，选中后只看该分类图片
//   - 分组显示：默认「全部分类」按分类分组展示（分类头 + 数量 + 图片网格），
//     复用基本发生在同品类，分组浏览定位更快
//
// 使用方：
//   - ProductEditDialog BrandImages（产品编辑弹窗内嵌图片区）
//     v1.5.6：打开时带入当前产品上下文（产品名模糊检索 + 当前分类默认筛选）
// 职责：仅展示图片库 + 选择回调；挂载逻辑由调用方决定（createProductImage / 本地 state）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Image, Modal, Spin } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import DsButton from '../../../../shared/components/DsButton.js';
import DsInput from '../../../../shared/components/DsInput.js';
import DsSelect from '../../../../shared/components/DsSelect.js';
import {
  listProductImageLibrary,
  type ProductImageLibraryItem,
} from '../../../../shared/services/api/baseDataApi.js';
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
} from '../../../../shared/utils/search-scoring.js';
import { resolveImageUrl } from '../../../../shared/utils/resolveImageUrl.js';
import { overlayModalContainer } from '../../../../shared/utils/canvasStage.js';

export interface ProductImageLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  /** 选择图片回调（调用方负责把图片挂载到目标品牌） */
  onSelect: (item: ProductImageLibraryItem) => void;
  /** 选择中状态（调用方设置，用于按钮 loading） */
  selecting?: boolean;
  /**
   * v1.5.6 上下文接入：打开时默认筛选的分类（调用方传入当前产品所属分类）。
   * 设计依据：用户「从图片库选择优先填入当前分类」——复用基本发生在同品类，
   * 打开即定位到当前分类，减少无关图片干扰；可随时切回「全部分类」。
   */
  initialCategoryId?: number | null;
  /**
   * v1.5.6 上下文接入：打开时预填的关键词（调用方传入当前产品名，模糊匹配同款）。
   * 设计依据：用户「直接按当前的产品名去检索模糊匹配相同的产品」——同款产品图片
   * 大概率同图，预填产品名让最相关的图片直接出现在结果里；可一键清除。
   */
  initialKeyword?: string;
}

/** 全部分类筛选值（区别于真实分类 ID） */
const ALL_CATEGORY = 'all';

/** 网格卡片渲染（卡片 + 引用数徽标 + 使用按钮），选择器内多处复用 */
function LibraryCard({
  item,
  selecting,
  onSelect,
}: {
  item: ProductImageLibraryItem;
  selecting?: boolean;
  onSelect: (item: ProductImageLibraryItem) => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--border-neutral-l2)',
        borderRadius: 'var(--radius-3)',
        overflow: 'hidden',
        background: 'var(--bg-base-secondary)',
      }}
    >
      <Image
        src={resolveImageUrl(item.thumbnailUrl || item.imageUrl)}
        width="100%"
        height={100}
        preview={{ src: resolveImageUrl(item.imageUrl) }}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ objectFit: 'cover', display: 'block' }}
      />
      {/* 引用数徽标（同 hash 被多少品牌复用） */}
      <span
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          padding: '1px 5px',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          fontSize: 10,
          borderRadius: 8,
          lineHeight: 1.5,
        }}
      >
        {item.refCount} 处
      </span>
      <div style={{ padding: 4 }}>
        <DsButton
          variant="secondary"
          size="sm"
          block
          loading={selecting}
          onClick={() => onSelect(item)}
        >
          使用此图
        </DsButton>
      </div>
    </div>
  );
}

export default function ProductImageLibraryPicker({
  open,
  onClose,
  onSelect,
  selecting,
  initialCategoryId,
  initialKeyword,
}: ProductImageLibraryPickerProps) {
  const [items, setItems] = useState<ProductImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  // v1.5.5：关键词检索（本地过滤）+ 分类筛选
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORY);
  // v1.5.6.2：打开时自动聚焦 + 全选预填关键词（输入直接替换而非追加）
  const keywordInputRef = useRef<InputRef>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProductImageLibrary();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // v1.5.6 上下文接入：每次打开时用调用方上下文初始化检索条件
      //   （当前分类 + 当前产品名），用户可随时手动清除/切换
      //   注意：分类 0（未分类/新建产品）不应用分类默认筛选，避免误过滤全部图片
      setKeyword(initialKeyword ?? '');
      setCategoryFilter(
        initialCategoryId != null && initialCategoryId > 0
          ? String(initialCategoryId)
          : ALL_CATEGORY,
      );
      // v1.5.6.2 UX：预填关键词时自动聚焦并全选，用户直接输入即替换预填内容
      requestAnimationFrame(() => {
        const el = keywordInputRef.current?.input;
        if (el) {
          el.focus();
          if (initialKeyword) el.select();
        }
      });
      void load();
    }
  }, [open, load, initialCategoryId, initialKeyword]);

  // v1.5.5：分类选项（来自图片库自身，按分类名聚合 + 数量）
  const categoryOptions = useMemo(() => {
    const countMap = new Map<string, { id: number; name: string; count: number }>();
    for (const item of items) {
      const key = item.categoryId > 0 ? String(item.categoryId) : '0';
      const entry = countMap.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        countMap.set(key, {
          id: item.categoryId,
          name: item.categoryName || '未分类',
          count: 1,
        });
      }
    }
    return Array.from(countMap.values())
      .sort((a, b) => {
        // 未分类固定排最后，其余按名称排序
        if (a.id === 0) return 1;
        if (b.id === 0) return -1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      })
      .map((c) => ({ label: `${c.name} (${c.count})`, value: String(c.id) }));
  }, [items]);

  // v1.5.5：本地过滤（关键词 + 分类），输入即时响应
  // v1.5.6.2：关键词检索由呆板 includes 升级为「产品检索同一套打分逻辑」——
  //   复用前端版 scoreSkuByCustomWeights（与后端 search-scoring.ts 双端 SSOT），
  //   支持乱序碎片（弯25→弯头）、跨字段组合（伟星6分）、规格点号（25给水3.5→en3.5）
  //   等松匹配，score>0 过滤 + 分数降序排列，最相关的图片排最前。
  const filteredItems = useMemo(() => {
    const kw = keyword.trim();
    const catId = categoryFilter === ALL_CATEGORY ? null : Number(categoryFilter);
    let list = items;
    if (catId != null) {
      list = list.filter((item) => item.categoryId === catId);
    }
    if (!kw) return list;
    const tokens = tokenizeKeyword(kw);
    const segments = segmentizeKeyword(kw);
    return list
      .map((item) => ({
        item,
        score: scoreSkuByCustomWeights(
          {
            productName: item.productName,
            specModel: item.specModel,
            brandName: item.brandName,
            remark: '',
            categoryName: item.categoryName,
          },
          tokens,
          segments,
          kw,
        ),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  }, [items, keyword, categoryFilter]);

  // v1.5.5：按分类分组（仅全部分类模式；指定分类时平铺）
  const grouped = useMemo(() => {
    if (categoryFilter !== ALL_CATEGORY) return null;
    const groups = new Map<string, ProductImageLibraryItem[]>();
    for (const item of filteredItems) {
      const key = item.categoryId > 0 ? String(item.categoryId) : '0';
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return Array.from(groups.entries())
      .map(([key, list]) => {
        const first = list[0];
        return {
          key,
          name: first.categoryName || '未分类',
          id: first.categoryId,
          items: list,
        };
      })
      .sort((a, b) => {
        if (a.id === 0) return 1;
        if (b.id === 0) return -1;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
  }, [filteredItems, categoryFilter]);

  const empty = !loading && filteredItems.length === 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="从图片库选择（已有图片复用，无需重复上传）"
      footer={null}
      width={820}
      getContainer={overlayModalContainer}
      centered
    >
      <Spin spinning={loading}>
        {/* v1.5.5：检索栏（关键词 + 分类筛选） */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'nowrap' }}>
          <DsInput
            ref={keywordInputRef}
            size="sm"
            placeholder="搜索 产品名/品牌/规格/分类"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            prefix={<SearchOutlined style={{ fontSize: 12, color: 'var(--text-tertiary)' }} />}
            style={{ width: 260 }}
          />
          <DsSelect
            size="sm"
            value={categoryFilter}
            onChange={(v: string) => setCategoryFilter(v ?? ALL_CATEGORY)}
            options={[
              { label: '全部分类', value: ALL_CATEGORY },
              ...categoryOptions,
            ]}
            style={{ width: 180 }}
            popupMatchSelectWidth={false}
          />
        </div>

        {empty ? (
          <Empty
            description={
              items.length === 0 ? '图片库为空，请先上传图片' : '没有匹配的图片，试试其他关键词或分类'
            }
          />
        ) : grouped ? (
          // v1.5.5：按分类分组显示（复用基本是同品类，分组浏览定位更快）
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {grouped.map((group) => (
              <div key={group.key} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 6,
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>{group.name}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    {group.items.length} 张
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border-neutral-l2)' }} />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: 10,
                  }}
                >
                  {group.items.map((item) => (
                    <LibraryCard
                      key={item.id}
                      item={item}
                      selecting={selecting}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 指定分类：平铺该分类下所有图片
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 10,
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            {filteredItems.map((item) => (
              <LibraryCard key={item.id} item={item} selecting={selecting} onSelect={onSelect} />
            ))}
          </div>
        )}
      </Spin>
    </Modal>
  );
}
