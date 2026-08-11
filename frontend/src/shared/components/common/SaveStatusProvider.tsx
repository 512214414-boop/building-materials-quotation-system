/**
 * SaveStatusProvider — 高频即时保存反馈（A+C 组合方案）
 *
 * 设计原理：
 *  - 行级状态点（14px）：保存中转圈 → 成功绿勾一闪800ms → 失败红叹号+shake
 *  - 全局反馈：成功弹 antd message.success，失败弹 antd message.error（顶部多消息堆叠）
 *  - 高频高密度：多行同时保存时，行级状态点独立显示，消息由 antd message 自动堆叠
 *
 * v10.14：移除自定义 GlobalStatusBar（原右下角浮窗影响布局），全局反馈统一走 antd message
 *   - antd message 顶部弹出，多消息自动堆叠，成熟稳定
 *   - 数据库操作（保存/修改/删除）成功/失败都需明确提示，不静默
 *
 * 使用方式：
 *  1. 在 Layout 中包裹 <SaveStatusProvider>
 *  2. 行内使用 <SaveStatusDot lineId={lineId} /> 显示状态点
 *  3. 提交时调用 const { trackSave } = useSaveStatus(); trackSave(lineId, fetchPromise)
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { App as AntApp } from 'antd';

// ============================================================
// 类型定义
// ============================================================

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusContextValue {
  /** 跟踪一个保存操作，自动管理状态 */
  trackSave: (lineId: string, promise: Promise<unknown>) => Promise<unknown>;
  /** 获取某行的当前状态 */
  getStatus: (lineId: string) => SaveStatus;
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const { message } = AntApp.useApp();
  const [lineStatuses, setLineStatuses] = useState<Record<string, SaveStatus>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setLineStatus = useCallback((lineId: string, status: SaveStatus) => {
    setLineStatuses((prev) => ({ ...prev, [lineId]: status }));
  }, []);

  const clearLineStatus = useCallback(
    (lineId: string, delay: number) => {
      if (timersRef.current[lineId]) {
        clearTimeout(timersRef.current[lineId]);
      }
      timersRef.current[lineId] = setTimeout(() => {
        setLineStatuses((prev) => {
          const next = { ...prev };
          delete next[lineId];
          return next;
        });
        delete timersRef.current[lineId];
      }, delay);
    },
    [],
  );

  const trackSave = useCallback(
    async (lineId: string, promise: Promise<unknown>): Promise<unknown> => {
      // 清除已有的定时器
      if (timersRef.current[lineId]) {
        clearTimeout(timersRef.current[lineId]);
        delete timersRef.current[lineId];
      }

      // 设置保存中状态
      setLineStatus(lineId, 'saving');

      try {
        const result = await promise;
        // 成功：绿勾一闪800ms + antd message.success 顶部提示
        setLineStatus(lineId, 'saved');
        clearLineStatus(lineId, 800);
        // v10.14：数据库操作成功也需明确提示（不静默）
        //   高频多行保存时用固定 key 去重，避免连续弹多个"已保存"刷屏
        message.success({ content: '已保存', duration: 1, key: 'save-success' });
        return result;
      } catch (err) {
        // 失败：红叹号 + shake，3秒后清除
        setLineStatus(lineId, 'error');
        clearLineStatus(lineId, 3000);
        // v10.14：失败弹 antd message.error（顶部弹出，多消息自动堆叠）
        //   同一 lineId 用 key 去重，避免同一行连续失败弹多个
        message.error({
          content: (err as Error)?.message || '保存失败',
          duration: 3,
          key: `save-error-${lineId}`,
        });
        throw err;
      }
    },
    [setLineStatus, clearLineStatus, message],
  );

  const getStatus = useCallback(
    (lineId: string): SaveStatus => lineStatuses[lineId] || 'idle',
    [lineStatuses],
  );

  return (
    <SaveStatusContext.Provider value={{ trackSave, getStatus }}>
      {children}
    </SaveStatusContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useSaveStatus(): SaveStatusContextValue {
  const ctx = useContext(SaveStatusContext);
  if (!ctx) {
    throw new Error('useSaveStatus must be used within SaveStatusProvider');
  }
  return ctx;
}

// ============================================================
// 行级状态点组件（14px，用于行内显示保存状态）
// ============================================================

export function SaveStatusDot({ lineId }: { lineId: string }) {
  const { getStatus } = useSaveStatus();
  const status = getStatus(lineId);

  if (status === 'idle') return null;

  const styles: Record<SaveStatus, React.CSSProperties> = {
    idle: { display: 'none' },
    saving: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '14px',
      height: '14px',
      color: 'var(--text-tertiary)',
      animation: 'saveSpin 0.8s linear infinite',
    },
    saved: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '14px',
      height: '14px',
      color: 'var(--status-success-default)',
      animation: 'saveFlash 0.8s ease',
    },
    error: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '14px',
      height: '14px',
      color: 'var(--status-error-default)',
      animation: 'saveShake 0.4s ease',
    },
  };

  return (
    <>
      <style>{`
        @keyframes saveSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes saveFlash {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes saveShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
      <span style={styles[status]} aria-label={`save-${status}`}>
        {status === 'saving' && '⟳'}
        {status === 'saved' && '✓'}
        {status === 'error' && '✕'}
      </span>
    </>
  );
}
