// 订单协同工作台容器
// 壳子常驻：多单据标签栏不随切单卸载；loading 只盖内容区
// 协同定位：不同人员可在多个设备对当前已打开单据进行快速协作（WS 实时同步单据标签行）
// 上一步/前进由 StaffLayout 页面级底栏负责
// v3.0 变动：删除 DocumentCustomerBar 挂载（原客户电话/收货地址/联系电话/预计交付日期/公司已并入 DocumentContextBar 单栏统一维护）

import { useEffect, useState, Suspense, type MouseEvent, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, App as AntdApp } from 'antd';
import { useDocumentStore } from '../../../shared/stores/document.js';
import { useStaffAuthStore } from '../../../shared/stores/auth.js';
import { useWorkbenchStore } from '../../../shared/stores/workbench.js';
import { DsButton } from '../../../shared/components/DsButton.js';
import DsShellRow from '../../../shared/components/DsShellRow.js';
import DocumentContextBar from '../../../shared/components/DocumentContextBar.js';
import CreateDocumentModal from '../../../shared/components/CreateDocumentModal.js';
import DocumentSourcePicker from '../../../shared/components/DocumentSourcePicker.js';
import { PermissionDenied } from '../../../shared/components/common/PermissionDenied.js';
import { PickerEditGateProvider } from '../../../shared/components/product-picker/PickerEditGate.js';
import { WorkbenchFieldCell } from '../../../shared/components/workbench/WorkbenchFieldCell.js';
import { DS_SHELL_INLINE_BTN } from '../../../shared/styles/shell-constants.js';
import type { StaffDocumentListItem } from '../../../shared/services/api/documentApi.js';
import { getWorkbenchViews } from '../menu.config.js';

/** 标签栏「＋新建 / 检索」同一套虚线品牌芯片，高度锁 20，跟 DsButton sm 对齐 */
const TAB_CHIP: CSSProperties = {
  ...DS_SHELL_INLINE_BTN,
  appearance: 'none',
  WebkitAppearance: 'none',
  borderStyle: 'dashed',
  borderColor: 'var(--border-brand)',
  color: 'var(--text-brand)',
  background: 'transparent',
  flexShrink: 0,
};

// v10.32 适配 AppShell 新骨架：工作台拥有独立内部骨架（单据标签行 + 单据上下文栏 + 视图内容），
// 需 full-bleed 撑满 main 的全部空间。
// main 水平 padding 已为 0（内容区行盒子自带 padding），仅垂直 padding 8px 需要抵消。
const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  margin: 'calc(-1 * var(--spacer-8)) 0',
  minHeight: 'calc(100% + 2 * var(--spacer-8))',
};

function WorkbenchTabBar({
  documentId,
  onNew,
  onTabClick,
  onCloseTab,
  onOpenHistory,
}: {
  documentId?: string;
  onNew: () => void;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string, e: MouseEvent) => void;
  onOpenHistory: (doc: StaffDocumentListItem) => void;
}) {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const { message } = AntdApp.useApp();

  return (
    <DsShellRow
      style={{
        gap: 6,
        padding: '0 12px',
        background: 'var(--bg-base-secondary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.documentId === documentId;
        // v10.34 标签显示：编号 + 备注 + 客户（用 · 分隔）
        const parts = [tab.documentNo, tab.note, tab.customerName].filter(Boolean);
        const tabLabel = parts.join(' · ');
        return (
          <div
            key={tab.documentId}
            onClick={() => onTabClick(tab.documentId)}
            title={tabLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-4)',
              padding: '0 6px',
              maxWidth: 160,
              background: isActive ? 'var(--bg-brand-popup)' : 'var(--bg-base-default)',
              border: `1px solid ${isActive ? 'var(--border-brand)' : 'var(--border-neutral-l2)'}`,
              borderRadius: 'var(--radius-4)',
              color: isActive ? 'var(--text-brand)' : 'var(--text-default)',
              fontWeight: isActive ? 500 : 400,
              fontSize: 'var(--body-sm-font-size)',
              fontFamily: 'var(--font-family-default)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'background .15s ease, color .15s ease, border-color .15s ease',
            }}
          >
            {tabLabel}
            <span
              onClick={(e) => onCloseTab(tab.documentId, e)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 14,
                height: 14,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '11px',
                borderRadius: 'var(--radius-2)',
                flexShrink: 0,
                transition: 'color .15s ease, background .15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-default)';
                e.currentTarget.style.background = 'var(--bg-overlay-l2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'transparent';
              }}
              role="button"
              aria-label={`关闭 ${tabLabel}`}
            >
              ×
            </span>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        style={TAB_CHIP}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-brand-popup)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        ＋ 新建
      </button>
      <div className="ds-shell-search-chip" style={{ ...TAB_CHIP, minWidth: 56, maxWidth: 88, padding: '0 6px' }}>
        <WorkbenchFieldCell
          embed="inline"
          text=""
          placeholder="检索"
          color="var(--text-brand)"
          title="打开历史单据"
          bullets={['点单号在工作台打开。', '点预看明细，不撑列表。', '手输确认不跳单。']}
          onApply={() => {
            message.warning('请从列表点单号打开');
          }}
          pickerRender={(ctx) => (
            <DocumentSourcePicker
              hostedInGate
              parentPanelId={ctx.panelId}
              hostedKeyword={ctx.keyword}
              onHostedKeywordChange={ctx.setKeyword}
              hostedListExpanded={ctx.listExpanded}
              hostReady={ctx.hostReady}
              anchorRef={ctx.inputHostRef}
              onOpenDocument={(doc) => {
                ctx.close();
                onOpenHistory(doc);
              }}
            />
          )}
        />
      </div>
    </DsShellRow>
  );
}

function ContentLoading() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        background: 'var(--bg-base-default)',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <PickerEditGateProvider>
      <div style={shellStyle}>{children}</div>
    </PickerEditGateProvider>
  );
}

/**
 * v10.32 九视图导航 bar：工作台内容区第一行骨架
 * 使用 .ds-shell-row 通用行类，行高24px、字号11px统一
 */
function ViewNavBar({
  views,
  activeKey,
  hasView,
  onSelect,
}: {
  views: { key: string; label: string; permissionKey: string }[];
  activeKey: string;
  hasView: (key: string, level?: 'ro' | 'rw') => boolean;
  onSelect: (key: string) => void;
}) {
  const visibleViews = views.filter((v) => hasView(v.permissionKey, 'ro'));
  if (visibleViews.length === 0) return null;
  return (
    <DsShellRow
      style={{
        gap: 0,
        padding: '0 12px',
        background: 'var(--bg-base-secondary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {visibleViews.map((v) => {
        const isActive = v.key === activeKey;
        return (
          <button
            key={v.key}
            onClick={() => onSelect(v.key)}
            style={{
              padding: '0 8px',
              fontSize: 'var(--body-sm-font-size)',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--text-brand)' : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${isActive ? 'var(--bg-brand)' : 'transparent'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              height: '100%',
              transition: 'color .15s ease, border-color .15s ease',
            }}
          >
            {v.label}
          </button>
        );
      })}
    </DsShellRow>
  );
}

export default function OrderWorkbench() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = AntdApp.useApp();

  const { activeDocument, loading, open, close } = useDocumentStore();
  const { hasView, token } = useStaffAuthStore();
  const { openTab, closeTab, setActiveTab } = useWorkbenchStore();

  const allViews = getWorkbenchViews();
  const viewFromUrl = searchParams.get('view');
  const activeView =
    allViews.some((v) => v.key === viewFromUrl) ? (viewFromUrl as string) : allViews[0]?.key ?? 'PurchaseQuote';

  useEffect(() => {
    if (!allViews.length) return;
    if (viewFromUrl !== activeView) {
      const next = new URLSearchParams(searchParams);
      next.set('view', activeView);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, viewFromUrl, allViews.length]);

  // v11.0.9 视图保活机制：懒激活 + display 切换
  //   痛点：原渲染逻辑每次切换只渲染当前视图 → 旧视图卸载 → state 丢失 → 切回时 useEffect 重新加载数据，卡顿明显
  //   方案：
  //     1. mountedViews 记录「已访问过」的视图 key（Set）
  //     2. 切换视图时把目标视图加入 mountedViews（首次访问才挂载，避免初始全量挂载）
  //     3. 渲染时遍历 mountedViews，非当前视图用 display:none 隐藏而非卸载
  //     4. 已访问过的视图切回时零延迟显示，state 全部保留，无重新加载
  //   单据切换时所有已挂载视图的 documentId prop 变化，会触发各自重新渲染（合理行为，state 仍保留）
  const [mountedViews, setMountedViews] = useState<Set<string>>(() => new Set([activeView]));
  useEffect(() => {
    setMountedViews((prev) => {
      if (prev.has(activeView)) return prev;
      const next = new Set(prev);
      next.add(activeView);
      return next;
    });
  }, [activeView]);

  const [entryState, setEntryState] = useState<'loading' | 'empty' | 'redirecting'>('loading');
  // v2.6 新建单据弹窗：内联打开，不跳转 /staff/documents
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (documentId) return;
    if (!token) return;
    setEntryState('loading');
    (async () => {
      try {
        const qs = searchParams.toString();
        const q = qs ? `?${qs}` : '';
        const { activeTabId, tabs } = useWorkbenchStore.getState();
        const resumeId =
          (activeTabId && tabs.some((t) => t.documentId === activeTabId) && activeTabId) ||
          tabs[0]?.documentId ||
          null;
        if (resumeId) {
          setEntryState('redirecting');
          navigate(`/staff/workbench/${resumeId}${q}`, { replace: true });
          return;
        }

        const res = await fetch('/api/staff/documents?page=1&pageSize=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const firstDoc = data?.data?.list?.[0];
        if (firstDoc) {
          setEntryState('redirecting');
          navigate(`/staff/workbench/${firstDoc.id}${q}`, { replace: true });
        } else {
          setEntryState('empty');
        }
      } catch {
        setEntryState('empty');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, token]);

  useEffect(() => {
    if (!documentId) return;
    open(documentId).catch((e) => {
      message.error((e as Error).message || '加载单据失败');
    });
  }, [documentId, open, message]);

  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  useEffect(() => {
    if (activeDocument && activeDocument.id === documentId) {
      const dateStr = activeDocument.createdAt
        ? new Date(activeDocument.createdAt).toISOString().slice(0, 10)
        : '';
      openTab(
        activeDocument.id,
        activeDocument.documentNo,
        // v11.0 解耦：使用 customerName 快照字段替代 customer?.name
        activeDocument.customerName ?? '',
        dateStr,
        activeDocument.title || activeDocument.note || '',
      );
    }
  }, [activeDocument, documentId, openTab]);

  const handleTabClick = (tabDocumentId: string) => {
    if (tabDocumentId !== documentId) {
      setActiveTab(tabDocumentId);
      const qs = searchParams.toString();
      navigate(`/staff/workbench/${tabDocumentId}${qs ? `?${qs}` : ''}`);
    }
  };

  const handleCloseTab = (tabDocumentId: string, e: MouseEvent) => {
    e.stopPropagation();
    const wasActive = tabDocumentId === documentId;
    closeTab(tabDocumentId);
    if (wasActive) {
      const newActiveId = useWorkbenchStore.getState().activeTabId;
      const qs = searchParams.toString();
      const q = qs ? `?${qs}` : '';
      if (newActiveId) {
        navigate(`/staff/workbench/${newActiveId}${q}`);
      } else {
        navigate(`/staff/workbench${q}`);
      }
    }
  };

  /** v2.6 新建单据：内联打开弹窗，不跳转采购清单 */
  const handleNewDocument = () => {
    setCreateModalOpen(true);
  };

  /** 新建成功：直接进入新单据工作台（自动开标签） */
  const handleCreated = (doc: { id: string }) => {
    setCreateModalOpen(false);
    const qs = searchParams.toString();
    navigate(`/staff/workbench/${doc.id}${qs ? `?${qs}` : ''}`);
  };

  /** 标签栏检索：直接在工作台打开历史单，不必绕采购清单 */
  const handleOpenHistory = (doc: StaffDocumentListItem) => {
    const dateStr = doc.createdAt ? new Date(doc.createdAt).toISOString().slice(0, 10) : '';
    openTab(
      doc.id,
      doc.documentNo,
      doc.customerName ?? '',
      dateStr,
      doc.title || doc.note || '',
    );
    const qs = searchParams.toString();
    navigate(`/staff/workbench/${doc.id}${qs ? `?${qs}` : ''}`);
  };

  const tabBar = (
    <WorkbenchTabBar
      documentId={documentId}
      onNew={handleNewDocument}
      onTabClick={handleTabClick}
      onCloseTab={handleCloseTab}
      onOpenHistory={handleOpenHistory}
    />
  );

  const handleViewSelect = (key: string) => {
    if (key === activeView) return;
    const next = new URLSearchParams(searchParams);
    next.set('view', key);
    setSearchParams(next, { replace: true });
  };

  const viewNavBar = (
    <ViewNavBar
      views={allViews}
      activeKey={activeView}
      hasView={hasView}
      onSelect={handleViewSelect}
    />
  );

  if (!documentId) {
    if (entryState === 'empty') {
      return (
        <Shell>
          {viewNavBar}
          {tabBar}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--spacer-32)',
              gap: 'var(--spacer-16)',
              background: 'var(--bg-base-default)',
            }}
          >
            <div style={{ fontSize: 'var(--heading-md-font-size)', color: 'var(--text-default)', fontWeight: 600 }}>
              暂无单据
            </div>
            <p style={{ margin: 0, fontSize: 'var(--body-base-font-size)', color: 'var(--text-secondary)' }}>
              点击下方按钮新建第一个单据。有历史单后可在标签栏「检索」打开。
            </p>
            <DsButton variant="primary" onClick={handleNewDocument}>
              + 新建单据
            </DsButton>
          </div>
          <CreateDocumentModal
            open={createModalOpen}
            onCancel={() => setCreateModalOpen(false)}
            onCreated={handleCreated}
          />
        </Shell>
      );
    }
    return (
      <Shell>
        {viewNavBar}
        {tabBar}
        <ContentLoading />
        <CreateDocumentModal
          open={createModalOpen}
          onCancel={() => setCreateModalOpen(false)}
          onCreated={handleCreated}
        />
      </Shell>
    );
  }

  const docReady = !!activeDocument && activeDocument.id === documentId;
  const showContentLoading = loading && !docReady;

  // v11.0.9：渲染已访问过的视图（懒激活），非当前视图 display:none 隐藏保活
  const visibleViewEls = allViews
    .filter((v) => mountedViews.has(v.key))
    .map((v) => {
      const hasPermission = hasView(v.permissionKey, 'ro');
      const isActive = v.key === activeView;
      const Comp = v.component;
      return (
        <div
          key={v.key}
          style={{
            display: isActive ? 'flex' : 'none',
            flex: 1,
            minHeight: 0,
            flexDirection: 'column',
            background: 'var(--bg-base-default)',
          }}
        >
          {showContentLoading && isActive ? (
            <ContentLoading />
          ) : !hasPermission ? (
            <PermissionDenied kind="none" featureLabel={v.label} minHeight="50vh" />
          ) : (
            <Suspense
              fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacer-32)' }}>
                  <Spin />
                </div>
              }
            >
              <Comp documentId={documentId} />
            </Suspense>
          )}
        </div>
      );
    });

  return (
    <Shell>
      {viewNavBar}
      {tabBar}
      <DocumentContextBar documentId={documentId} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {visibleViewEls}
      </div>
      <CreateDocumentModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />
    </Shell>
  );
}
