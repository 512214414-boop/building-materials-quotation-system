/**
 * 视图锁定（防误触）统一状态机
 *
 * 背景：工作台 6 个视图各自声明 viewLocked / lockActioning 并各写一遍
 * handleToggleLock，逻辑完全一致、只有视图名和 API 不同。
 * 抽成 hook 后「锁定状态怎么读 / 解锁要不要确认 / 失败怎么提示」只有一处实现，
 * 不会某个视图漏判冻结。
 *
 * 方向性约定（沿用原实现，不要反过来）：
 *   锁定 = 保险，直接生效，不需要二次确认（锁错了再解锁即可）
 *   解锁 = 放开写入，是危险方向，必须二次确认并说明影响
 */
import { useCallback, useState } from 'react';
import { useCanvasApp } from './useCanvasApp.js';

export interface UseViewLockOptions {
  /** viewLocks 里的键，如 'paymentReconcile' */
  key: string;
  /** 视图名，用于确认弹窗标题，如 '收款对账视图' */
  label: string;
  /** 解锁确认时的补充说明（写清解锁后什么会变可编辑） */
  unlockHint?: string;
  lock?: () => Promise<unknown>;
  unlock?: () => Promise<unknown>;
  /** 加载完成后的回调（如刷新列表） */
  onToggled?: () => void;
}

export interface UseViewLockResult {
  locked: boolean;
  actioning: boolean;
  /** 在 load() 里调用：applyLocks(doc?.viewLocks) */
  applyLocks: (locks?: Record<string, boolean> | null) => void;
  /** 绑定在锁定按钮上。未传 lock/unlock 时为空操作（只读视图） */
  toggle: () => void;
  /** 是否可切换（传入了 lock/unlock 才为 true，用于控制按钮显隐） */
  toggleable: boolean;
  /**
   * 直接置位。给「锁定流程不走标准弹窗」的视图留的出口
   * （如采购报价：无二次确认、锁完要 refresh）。能用 toggle 就别用它。
   */
  setLocked: (next: boolean) => void;
}

export function useViewLock(opts: UseViewLockOptions): UseViewLockResult {
  const { message, modal } = useCanvasApp();
  const [locked, setLocked] = useState(false);
  const [actioning, setActioning] = useState(false);
  const toggleable = Boolean(opts.lock && opts.unlock);

  const applyLocks = useCallback(
    (locks?: Record<string, boolean> | null) => {
      setLocked(Boolean(locks && locks[opts.key]));
    },
    [opts.key],
  );

  const toggle = useCallback(() => {
    if (!opts.lock || !opts.unlock) return;

    if (locked) {
      modal.confirm({
        title: `解锁${opts.label}`,
        content: opts.unlockHint ?? '解锁后本视图将恢复可编辑状态，确定要解锁吗？',
        okText: '确认解锁',
        cancelText: '取消',
        onOk: async () => {
          setActioning(true);
          try {
            await opts.unlock!();
            setLocked(false);
            message.success('已解锁', 0.8);
            opts.onToggled?.();
          } catch (e) {
            message.error((e as Error).message || '解锁失败');
          } finally {
            setActioning(false);
          }
        },
      });
      return;
    }

    setActioning(true);
    opts
      .lock()
      .then(() => {
        setLocked(true);
        message.success('已锁定，防止误触', 0.8);
        opts.onToggled?.();
      })
      .catch((e) => message.error((e as Error).message || '锁定失败'))
      .finally(() => setActioning(false));
  }, [locked, opts, message, modal]);

  return { locked, actioning, applyLocks, toggle, toggleable, setLocked };
}
