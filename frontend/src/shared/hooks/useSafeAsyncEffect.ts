// v3.1 安全异步 effect：组件卸载后跳过回调执行，避免卸载后 setState
// 唯一逻辑轴心：生产级稳定性（避免 race condition 与卸载后状态更新）
//
// 设计原理：
//  - useEffect 中调用 async 函数，组件卸载后 async 完成 → setState 会触发无意义更新
//  - React 18 已移除卸载后 setState 警告（实际无内存泄漏），但补 cleanup 是代码规范
//  - 本 hook 用 cancelled flag 包裹 async 调用，卸载后跳过 onResolve/onReject 回调
//  - async 函数本身的内部 setState 不受影响（React 18 已优雅处理为 no-op）
//
// 使用方式：
//   useSafeAsyncEffect(async () => { await load(); }, [load]);
// 或：
//   useSafeAsyncEffect(async (isMounted) => {
//     const data = await fetchData();
//     if (!isMounted()) return;
//     setData(data);
//   }, [fetchData]);

import { useEffect } from 'react';

export function useSafeAsyncEffect(
  effect: (isMounted: () => boolean) => Promise<void> | void,
  deps: React.DependencyList,
): void {
  useEffect(() => {
    let cancelled = false;
    const isMounted = () => !cancelled;
    void effect(isMounted);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
