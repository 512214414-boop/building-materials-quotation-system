// SharedBadgeOverlay — 共享组件「标识模式」叠加层（v15.4）
//
// 背景（用户「我在前端界面中要能直观看到共享组件，给它编号，一指就能定位；
//        有编号=已抽象，无编号=未抽象，可判断哪些该抽象」）：
//   - 每个共享组件根元素挂 data-shared-badge={编号}（见 badge/registry.ts）
//   - 本叠加层提供：右下角浮动开关按钮 + 开启后共享组件标识直接显示 + 悬浮显示 编号/中文名/分组
//
// 历轮实测反馈修正：
//   ✗ v1「元素旁常驻编号角标」在密集界面互相重叠遮挡内容 → 废除
//   ✓ v2「固定角落聚合清单」→ 用户认可（保留）；但「点击清单拾取」在弹窗场景误关弹窗 → 弱化
//   ✗ v3 高亮画在元素 outline / 顶层描边框 → 仍需额外拾取，用户希望「开启即标识、无需拾取」
//   ✓ v4（当前）「开启即水印式全量标识」：
//       1. 每个共享组件实例在 body 最顶层生成 描边框 + 编号标识（pointer-events:none，不占布局）
//       2. 叶子组件（内部未嵌套共享组件）→ 编号以半透明水印**居中**显示（不挡内容阅读）
//       3. 容器组件（内部嵌套共享组件）→ 编号放**框内左上角小标签**，与内部子组件的居中水印
//          天然错位 → 大组件套小组件不再互相遮盖
//       4. 顶层浮层（zIndex 2147482997）→ 弹窗/抽屉内组件照常标识，不被遮罩压暗、不被容器裁切
//       5. rAF 循环对齐位置/尺寸（兼容画布 zoom/滚动/面板开合/虚拟滚动）
//       6. 聚合清单面板保留（汇总当前界面组件与实例数）；点击某行可让该编号标识琥珀黄呼吸高亮
//       7. 点击页面某标识 → 聚焦：只显示「该编号的全部实例」，其余编号隐藏（同类一起看，方便识别复用）；
//          再点同一标识 或 按 ESC 恢复全部；退出不依赖点击页面空白 → 弹窗场景不会误触遮罩关闭弹窗
//       8. 悬浮任一元素 → 显示 编号·中文名·分组
//   - 默认关闭，不影响任何正常体验；开启后仅诊断/指认用
//
// 使用：在 AppShell 挂载一次即可（全站生效）。

import { useEffect, useRef, useState } from 'react';
import { SHARED_BADGES } from './registry.js';

/** 标识模式持久化键（localStorage） */
const MODE_KEY = 'shared-badge-mode';
/** 标识模式主色（琥珀黄，与品牌绿区分） */
const ACCENT = 'var(--status-warning-default)';
/** 顶层标识容器 zIndex（高于一切 antd 层级，保证不被遮罩/容器遮挡） */
const FRAME_Z = 2147482997;

/** 注入全局样式：顶层描边框 + 编号水印/角标 + 琥珀黄呼吸高亮（仅开启时注入） */
const MODE_STYLE = `
/* 顶层描边框：只画边框不遮内容，浮在遮罩/容器之上，永不被裁切 */
.shared-badge-frame {
  position: fixed;
  border: 1px dashed var(--text-brand);
  border-radius: 2px;
  pointer-events: none;
}
/* 编号标识（水印/角标共用基类；可点击聚焦） */
.shared-badge-label {
  position: fixed;
  pointer-events: auto;
  cursor: pointer;
  font-weight: 700;
  font-family: var(--font-family-mono, monospace);
  letter-spacing: 0.02em;
  user-select: none;
  white-space: nowrap;
}
/* 叶子组件：居中水印（红底白字 + 粗体，辨识度最高；深/花背景下依然清晰） */
.shared-badge-label--center {
  transform: translate(-50%, -50%);
  color: #fff;
  font-weight: 800;
  background: rgba(246, 90, 90, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.55);
  padding: 2px 6px;
  border-radius: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  box-shadow: 0 0 8px rgba(246, 90, 90, 0.5);
}
/* 容器组件：框内左上角小标签（红底白字，与内部子组件居中水印同色系错位不遮盖） */
.shared-badge-label--corner {
  color: #fff;
  background: var(--status-error-default);
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 800;
}
/* 点击清单行后：该编号全部标识琥珀黄呼吸高亮（深底琥珀字，对比度与普通水印一致） */
.shared-badge-label--hl {
  opacity: 1 !important;
  color: var(--status-warning-default);
  background: rgba(26, 15, 0, 0.75);
  border: 1px solid var(--status-warning-default);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  animation: shared-badge-breathe 1.4s ease-in-out infinite;
}
@keyframes shared-badge-breathe {
  0%, 100% { box-shadow: 0 0 0 3px var(--status-warning-surface-l1); }
  50% { box-shadow: 0 0 0 9px var(--status-warning-surface-l1); }
}
`;

/** 聚合清单面板与开关按钮的布局常量 */
const PANEL_RIGHT = 12;
const PANEL_BOTTOM = 86;

export default function SharedBadgeOverlay() {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) === '1');
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    badgeId: string;
  } | null>(null);
  /** 聚合统计：编号 → 实例数（按实例数降序） */
  const [stats, setStats] = useState<Array<{ id: string; count: number }>>([]);
  /** 面板展开/收起 */
  const [panelOpen, setPanelOpen] = useState(true);
  /** 当前高亮的编号（点击面板行切换；再次点击取消） */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /** 高亮编号的 ref 副本（rAF 循环内读取，避免 effect 竞态） */
  const highlightIdRef = useRef<string | null>(null);
  useEffect(() => {
    highlightIdRef.current = highlightId;
  }, [highlightId]);
  /** 聚焦编号（点击页面某标识 → 只显示该编号的全部实例，其余编号隐藏；null = 全部显示） */
  const [focusId, setFocusId] = useState<string | null>(null);
  const focusIdRef = useRef<string | null>(null);
  useEffect(() => {
    focusIdRef.current = focusId;
  }, [focusId]);

  // 关闭时清理所有临时状态
  useEffect(() => {
    if (!mode) {
      setTip(null);
      setStats([]);
      setHighlightId(null);
      setFocusId(null);
    }
  }, [mode]);

  // 聚合统计：扫描当前界面全部共享组件实例，按编号计数
  //   MutationObserver 监听 body 增删（表格翻页/抽屉开合/弹窗挂载）→ 防抖重扫
  useEffect(() => {
    if (!mode) return;
    let timer = 0;
    const scan = () => {
      const counter = new Map<string, number>();
      document.querySelectorAll<HTMLElement>('[data-shared-badge]').forEach((el) => {
        const id = el.dataset.sharedBadge;
        if (id) counter.set(id, (counter.get(id) ?? 0) + 1);
      });
      setStats(
        [...counter.entries()]
          .map(([id, count]) => ({ id, count }))
          .sort((a, b) => b.count - a.count),
      );
    };
    scan();
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 300);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(timer);
    };
  }, [mode]);

  // 顶层水印标识：为每个共享组件实例生成 描边框 + 编号标识（rAF 循环对齐位置/尺寸 + 应用高亮）
  //   - 叶子组件（无子共享组件）→ 居中半透明水印；容器组件（嵌套共享组件）→ 框内左上角标签
  //   - 浮层在 body 最顶层 → 弹窗内组件完整标识，不被遮罩压暗、不被容器裁切
  //   - rAF 循环覆盖画布 zoom / 滚动 / 面板开合 / 表格虚拟滚动等一切位移
  useEffect(() => {
    if (!mode) return;
    const layer = document.createElement('div');
    layer.id = 'shared-badge-frames';
    layer.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${FRAME_Z};overflow:visible;`;
    document.body.appendChild(layer);
    const marks = new Map<
      Element,
      { frame: HTMLDivElement; label: HTMLDivElement; isContainer: boolean }
    >();
    let rafId = 0;

    // 水印字号档位（按元素最小边自适应，小元素用小字避免占满）
    const labelFont = (w: number, h: number) => {
      const min = Math.min(w, h);
      if (min < 30) return 8;
      if (w < 60) return 10;
      if (w < 120) return 12;
      if (w < 240) return 15;
      return 17;
    };

    const sync = () => {
      // 清理已从文档移除元素的标识
      for (const [el, m] of marks) {
        if (!document.contains(el)) {
          m.frame.remove();
          m.label.remove();
          marks.delete(el);
        }
      }
      document.querySelectorAll<HTMLElement>('[data-shared-badge]').forEach((el) => {
        let m = marks.get(el);
        if (!m) {
          const frame = document.createElement('div');
          frame.className = 'shared-badge-frame';
          const label = document.createElement('div');
          label.className = 'shared-badge-label';
          label.textContent = el.dataset.sharedBadge ?? '';
          label.title = '点击聚焦：只显示该编号的全部实例；再点取消';
          label.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.sharedBadge ?? '';
            setFocusId((prev) => (prev === id ? null : id));
          });
          layer.appendChild(frame);
          layer.appendChild(label);
          m = { frame, label, isContainer: false };
          marks.set(el, m);
        }
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0;
        // 聚焦模式：只显示该编号的全部实例，其余编号隐藏
        const focusIdNow = focusIdRef.current;
        const hiddenByFocus = focusIdNow != null && el.dataset.sharedBadge !== focusIdNow;
        m.frame.style.display = visible && !hiddenByFocus ? '' : 'none';
        m.label.style.display = visible && !hiddenByFocus ? '' : 'none';
        if (!visible || hiddenByFocus) return;

        // 容器判定：内部是否嵌套了其他共享组件 → 决定 角落标签 / 居中水印
        const isContainer = !!el.querySelector('[data-shared-badge]');
        m.frame.style.left = `${r.left}px`;
        m.frame.style.top = `${r.top}px`;
        m.frame.style.width = `${r.width}px`;
        m.frame.style.height = `${r.height}px`;
        if (isContainer) {
          m.label.className = 'shared-badge-label shared-badge-label--corner';
          m.label.style.left = `${r.left + 3}px`;
          m.label.style.top = `${r.top + 3}px`;
          m.label.style.fontSize = '10px';
        } else {
          m.label.className = 'shared-badge-label shared-badge-label--center';
          m.label.style.left = `${r.left + r.width / 2}px`;
          m.label.style.top = `${r.top + r.height / 2}px`;
          m.label.style.fontSize = `${labelFont(r.width, r.height)}px`;
        }
        // 高亮状态：聚焦编号的全部实例 或 清单行高亮编号（琥珀黄呼吸 = 选中感）
        const hl =
          (focusIdRef.current != null &&
            el.dataset.sharedBadge === focusIdRef.current) ||
          (highlightIdRef.current != null &&
            el.dataset.sharedBadge === highlightIdRef.current);
        m.label.classList.toggle('shared-badge-label--hl', hl);
      });
    };

    const loop = () => {
      sync();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      layer.remove();
      marks.clear();
    };
  }, [mode]);

  // 悬浮定位：命中 data-shared-badge 元素（或其子孙）→ 显示编号/名称
  useEffect(() => {
    if (!mode) return;
    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const marked = target.closest?.('[data-shared-badge]') as HTMLElement | null;
      if (marked) {
        setTip({ x: e.clientX, y: e.clientY, badgeId: marked.dataset.sharedBadge ?? '' });
      } else {
        setTip(null);
      }
    };
    const onScroll = () => setTip(null);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [mode]);

  // 聚焦/高亮退出：ESC 恢复全部显示（不依赖点击页面空白，避免弹窗场景误触 mask 关弹窗）
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusId(null);
        setHighlightId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode]);

  const toggle = () => {
    setMode((prev) => {
      const next = !prev;
      localStorage.setItem(MODE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const info = tip ? SHARED_BADGES[tip.badgeId] : null;
  const totalInstances = stats.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      {/* 标识模式样式 */}
      {mode && <style>{MODE_STYLE}</style>}

      {/* 悬浮编号信息卡 */}
      {mode && tip && info && (
        <div
          style={{
            position: 'fixed',
            left: tip.x + 14,
            top: tip.y + 14,
            zIndex: FRAME_Z + 3,
            pointerEvents: 'none',
            padding: '6px 10px',
            background: 'var(--bg-base-tertiary)',
            border: '1px solid var(--border-neutral-l2)',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            maxWidth: 260,
          }}
        >
          <div style={{ color: ACCENT, fontWeight: 500 }}>
            {info.id} · {info.cn}
          </div>
          <div style={{ color: 'var(--text-tertiary)' }}>
            分组：{info.group} ｜ 已抽象共享组件
          </div>
        </div>
      )}

      {/* 聚合清单面板（右下角开关上方，可收起；点行高亮该编号全部标识） */}
      {mode && (
        <div
          style={{
            position: 'fixed',
            right: PANEL_RIGHT,
            bottom: PANEL_BOTTOM,
            zIndex: FRAME_Z + 1,
            width: 220,
            maxHeight: '52vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-base-tertiary)',
            border: '1px solid var(--border-neutral-l2)',
            borderRadius: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            fontSize: 11,
          }}
        >
          {/* 面板头部：点击收起/展开 */}
          <div
            onClick={() => setPanelOpen((o) => !o)}
            title={panelOpen ? '收起清单' : '展开清单'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '5px 8px',
              borderBottom: '1px solid var(--border-neutral-l1)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{ color: ACCENT, fontWeight: 600 }}>
              共享组件 {stats.length} 类 / {totalInstances} 实例
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>{panelOpen ? '▾' : '▸'}</span>
          </div>

          {/* 面板列表：编号 · 名称 · 实例数（点行高亮界面上该编号全部标识） */}
          {panelOpen && (
            <div style={{ overflowY: 'auto', maxHeight: 'calc(52vh - 28px)' }}>
              {stats.length === 0 ? (
                <div style={{ padding: 8, color: 'var(--text-tertiary)' }}>
                  未检测到共享组件
                </div>
              ) : (
                stats.map((s) => {
                  const reg = SHARED_BADGES[s.id];
                  const active = highlightId === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setHighlightId((prev) => (prev === s.id ? null : s.id))}
                      title={
                        reg
                          ? `${s.id} · ${reg.cn}（分组：${reg.group}）——点击${active ? '取消' : '高亮'}界面标识`
                          : `未登记编号 ${s.id}`
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        background: active ? 'var(--status-warning-surface-l1)' : 'transparent',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      <span style={{ color: ACCENT, fontWeight: 600, width: 36, flexShrink: 0 }}>
                        {s.id}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          color: 'var(--text-default)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {reg?.cn ?? s.id}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                        ×{s.count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* 右下角浮动开关按钮 */}
      <button
        type="button"
        onClick={toggle}
        title={mode ? '关闭共享组件标识模式' : '开启共享组件标识模式（查看编号）'}
        style={{
          position: 'fixed',
          right: PANEL_RIGHT,
          bottom: 48,
          zIndex: FRAME_Z + 2,
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: `1px solid ${mode ? ACCENT : 'var(--border-neutral-l2)'}`,
          background: mode ? 'var(--status-warning-surface-l1)' : 'var(--bg-base-tertiary)',
          color: mode ? ACCENT : 'var(--text-tertiary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.85,
        }}
      >
        {mode ? 'C' : 'c'}
      </button>
    </>
  );
}
