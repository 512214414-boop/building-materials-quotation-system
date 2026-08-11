// BatchStandardizeDialog — 批量补全产品档案弹窗（采购报价·产品数据使用闭环）
//
// 背景：客户报单往往一整单都是手输文字（微信贴单 / AI 识别订单追加的非标行），
//       只能逐行点「待确认」图标补全，效率低。本弹窗将单据内全部非标行一次列出，
//       逐行检索产品库匹配档案，批量绑定升级为标准行。
//
// 交互对齐产品编辑补全范式（输入→实时匹配→选择→失焦解析）：
//   - 检索框默认注入该行当前文字，输入实时匹配（searchProducts）
//   - 选中档案 → 该行标记「已匹配」，可取消重选
//   - 绑定语义 = 用档案数据替换该行（引用锁定）：ID 四件套 + productRef 档案全名
//     + 快照字段（后端 resolveLineSnapshots 自动刷新）+ isStandardized:true
//   - 修改维度尊重既有录入：qty/remark 不动；unitPrice 仅在行内为空时带入档案默认售价
//   - 未匹配的行可跳过（保持非标，不阻塞）
//
// 复用收敛：检索列表用 SuggestList，数据源 searchProducts，绑定走 updateLine ——
//           不新造检索/保存实现。

import { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp } from 'antd';
import {
  CheckCircleFilled,
  SearchOutlined,
} from '@ant-design/icons';
import DsDialog from './DsDialog.js';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import SuggestList from './SuggestList.js';
import {
  updateLine,
  type StaffDocumentLine,
  type DocumentLineUpdateInput,
} from '../services/api/documentApi.js';
import {
  searchProducts,
  type SkuSearchRow,
} from '../services/api/baseDataApi.js';

/** 每条非标行的检索状态 */
interface RowState {
  /** 检索关键词（默认注入当前 productRef） */
  keyword: string;
  /** 检索结果 */
  results: SkuSearchRow[];
  searching: boolean;
  /** 已选中的档案（未选为 null） */
  selected: SkuSearchRow | null;
}

export interface BatchStandardizeDialogProps {
  open: boolean;
  documentId: string;
  /** 单据当前全部行（组件内部过滤出非标行） */
  lines: StaffDocumentLine[];
  canWrite: boolean;
  onClose: () => void;
  /** 批量绑定完成后回调（父组件刷新行列表） */
  onDone: () => void;
}

/** 档案全名拼接（与 ProductPicker 选品回填保持一致：产品名+品牌+规格） */
function buildFullName(sku: SkuSearchRow): string {
  return [sku.productName, sku.brandName, sku.specModel]
    .filter((s) => s && s.trim())
    .join(' ');
}

export default function BatchStandardizeDialog({
  open,
  documentId,
  lines,
  canWrite,
  onClose,
  onDone,
}: BatchStandardizeDialogProps) {
  const { message } = AntdApp.useApp();
  const [binding, setBinding] = useState(false);

  /** 非标行 = 未关联产品 ID（productId 为空） */
  const nonStandardLines = useMemo(
    () => lines.filter((l) => !l.productId),
    [lines],
  );

  /** 每行检索状态（行 id → RowState） */
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  /** 检索防抖计时器（按行独立） */
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 打开时初始化每行检索状态（默认关键词 = 当前文字）
  useEffect(() => {
    if (!open) {
      setRowStates({});
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      return;
    }
    const init: Record<string, RowState> = {};
    for (const l of nonStandardLines) {
      init[l.id] = {
        keyword: l.productRef ?? '',
        results: [],
        searching: false,
        selected: null,
      };
    }
    setRowStates(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 检索某行（防抖 250ms） */
  const searchRow = (lineId: string, kw: string) => {
    if (timersRef.current[lineId]) clearTimeout(timersRef.current[lineId]);
    timersRef.current[lineId] = setTimeout(() => {
      void (async () => {
        if (!kw.trim()) {
          setRowStates((p) => ({ ...p, [lineId]: { ...p[lineId], results: [], searching: false } }));
          return;
        }
        setRowStates((p) => ({ ...p, [lineId]: { ...p[lineId], searching: true } }));
        try {
          const res = await searchProducts({ keyword: kw.trim(), size: 8 });
          const skus = res.list.filter((r): r is SkuSearchRow => r.type === 'sku');
          setRowStates((p) => ({ ...p, [lineId]: { ...p[lineId], results: skus, searching: false } }));
        } catch {
          setRowStates((p) => ({ ...p, [lineId]: { ...p[lineId], results: [], searching: false } }));
        }
      })();
    }, 250);
  };

  /** 选中档案 */
  const handlePick = (lineId: string, sku: SkuSearchRow) => {
    setRowStates((p) => ({ ...p, [lineId]: { ...p[lineId], selected: sku, results: [], keyword: buildFullName(sku) } }));
  };

  /** 取消选中 */
  const handleUnpick = (lineId: string) => {
    const cur = rowStates[lineId];
    setRowStates((p) => ({
      ...p,
      [lineId]: { ...p[lineId], selected: null, keyword: cur?.keyword ?? '', results: [], searching: false },
    }));
  };

  const matchedCount = useMemo(
    () => nonStandardLines.filter((l) => rowStates[l.id]?.selected).length,
    [nonStandardLines, rowStates],
  );

  /** 批量绑定：逐行串行 updateLine（尊重行级乐观锁 lineVersion） */
  const handleBind = async () => {
    if (!canWrite || matchedCount === 0) return;
    setBinding(true);
    const failed: string[] = [];
    try {
      for (const l of nonStandardLines) {
        const state = rowStates[l.id];
        if (!state?.selected) continue;
        const sku = state.selected;
        const patch: DocumentLineUpdateInput = {
          brandId: sku.brandId,
          specId: sku.specId,
          productId: sku.productId,
          unitId: sku.defaultUnitId ?? undefined,
          productRef: buildFullName(sku),
          spec: sku.specModel,
          unit: sku.defaultUnitName ?? l.unit,
          thumbnailUrl: sku.mainImageThumbUrl ?? sku.mainImageUrl ?? undefined,
          isStandardized: true,
          // 修改维度：行内已录单价不覆盖，空价才带入档案默认售价
          ...((!l.unitPrice || Number(l.unitPrice) === 0) && sku.retailPrice != null
            ? { unitPrice: Number(sku.retailPrice) }
            : {}),
          lineVersion: l.lineVersion,
        };
        try {
          await updateLine(documentId, l.id, patch);
        } catch (e) {
          failed.push(`${l.seq} 行：${(e as Error).message || '保存失败'}`);
        }
      }
      if (failed.length > 0) {
        message.warning(`部分行绑定失败：${failed.join('；')}`);
      } else {
        message.success(`已补全 ${matchedCount} 行产品档案`);
      }
      onDone();
      onClose();
    } finally {
      setBinding(false);
    }
  };

  return (
    <DsDialog
      title={`补全产品档案（${nonStandardLines.length} 行未关联）`}
      open={open}
      onCancel={onClose}
      width={680}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            绑定后以档案数据替换该行（产品名/单位/ID 锁定档案），行内数量与备注保留，空价自动带入档案默认售价
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <DsButton variant="secondary" onClick={onClose} disabled={binding}>
              取消
            </DsButton>
            <DsButton
              variant="primary"
              onClick={() => void handleBind()}
              disabled={!canWrite || matchedCount === 0}
              loading={binding}
            >
              绑定已匹配（{matchedCount}）
            </DsButton>
          </div>
        </div>
      }
    >
      {nonStandardLines.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
          没有需要补全的产品行
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 480, overflow: 'auto', padding: '4px 0' }}>
          {nonStandardLines.map((l, idx) => {
            const state = rowStates[l.id];
            const selected = state?.selected ?? null;
            return (
              <div
                key={l.id}
                style={{
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  background: 'var(--bg-base-secondary)',
                }}
              >
                {/* 行头：序号 + 当前文字 + 状态 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-quaternary)', flexShrink: 0 }}>#{idx + 1}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: selected ? 'var(--text-tertiary)' : 'var(--text-default)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: selected ? 'line-through' : 'none',
                    }}
                    title={l.productRef ?? ''}
                  >
                    {l.productRef || '（空行文字）'}
                  </span>
                  {selected ? (
                    <span style={{ fontSize: 11, color: 'var(--status-star-default)', flexShrink: 0 }}>
                      <CheckCircleFilled style={{ marginRight: 2 }} />
                      已匹配
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-quaternary)', flexShrink: 0 }}>
                      待匹配
                    </span>
                  )}
                </div>

                {/* 检索与匹配区 */}
                {selected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-brand)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <CheckCircleFilled style={{ marginRight: 4 }} />
                      {buildFullName(selected)}
                      {selected.defaultUnitName ? `（${selected.defaultUnitName}）` : ''}
                      {selected.retailPrice != null ? ` ¥${selected.retailPrice.toFixed(2)}` : ''}
                    </span>
                    <DsButton variant="secondary" size="sm" disabled={binding} onClick={() => handleUnpick(l.id)}>
                      取消
                    </DsButton>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <DsInput
                      size="sm"
                      placeholder="输入产品名/品牌/规格检索档案…"
                      value={state?.keyword ?? ''}
                      disabled={binding}
                      prefix={<SearchOutlined style={{ fontSize: 11 }} />}
                      allowClear
                      onChange={(e) => {
                        const kw = e.target.value;
                        setRowStates((p) => ({ ...p, [l.id]: { ...p[l.id], keyword: kw } }));
                        searchRow(l.id, kw);
                      }}
                      style={{ width: '100%' }}
                    />
                    {(state?.searching || (state?.results?.length ?? 0) > 0) && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: '100%',
                          zIndex: 20,
                          marginTop: 4,
                          background: 'var(--bg-menu)',
                          border: '1px solid var(--border-brand)',
                          borderRadius: 6,
                          boxShadow: 'var(--shadow-float)',
                        }}
                      >
                        <SuggestList
                          options={state?.results ?? []}
                          loading={state?.searching ?? false}
                          keyword={state?.keyword ?? ''}
                          allowCreate={false}
                          maxHeight={160}
                          emptyText="未找到匹配的商品"
                          rowKey={(sku) => sku.id}
                          rowRender={(sku: SkuSearchRow) => (
                            <div
                              role="button"
                              tabIndex={0}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                width: '100%',
                                padding: '4px 8px',
                                fontSize: 12,
                                lineHeight: 1.4,
                                color: 'var(--text-default)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderBottom: '1px solid var(--border-neutral-l1)',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l2)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                              onClick={() => handlePick(l.id, sku)}
                            >
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {buildFullName(sku)}
                              </span>
                              {sku.defaultUnitName ? (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                  {sku.defaultUnitName}
                                </span>
                              ) : null}
                              {sku.retailPrice != null ? (
                                <span style={{ fontSize: 11, color: 'var(--text-brand)', flexShrink: 0 }}>
                                  ¥{sku.retailPrice.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                          )}
                          onSelect={() => {}}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DsDialog>
  );
}
