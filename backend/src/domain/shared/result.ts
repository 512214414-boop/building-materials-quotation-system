// 领域层共享内核 · 结果类型（框架无关，零依赖）
//
// 用显式 Result 取代散落的 try/catch 与异常控制流，让「失败」成为类型的一部分——
// 调用方必须处理 error 分支，编译器强制，不会再有「吞异常」或「只快乐路径」的隐形 bug。

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** 成功态透传 value 并变换；失败态短路，error 不变。 */
export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** 链式组合两个返回 Result 的操作；任一环节失败即短路。 */
export function flatMap<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}
