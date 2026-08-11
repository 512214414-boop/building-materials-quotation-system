// 连续输入防抖：输入时只更新本地，停顿后落库；失焦立即刷盘
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
): { run: T; flush: () => void; cancel: () => void } {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const argsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  // unmount 时 flush 而非 clear，防止切 Tab/路由丢数据
  useEffect(
    () => () => {
      if (timerRef.current && argsRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const args = argsRef.current;
        argsRef.current = null;
        fnRef.current(...args);
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (argsRef.current) {
      const args = argsRef.current;
      argsRef.current = null;
      fnRef.current(...args);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    argsRef.current = null;
  }, []);

  const run = useCallback(
    ((...args: Parameters<T>) => {
      argsRef.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const a = argsRef.current;
        argsRef.current = null;
        if (a) fnRef.current(...a);
      }, delayMs);
    }) as T,
    [delayMs],
  );

  return { run, flush, cancel };
}
