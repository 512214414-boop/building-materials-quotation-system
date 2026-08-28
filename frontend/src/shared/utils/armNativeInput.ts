/**
 * 同一手指/鼠标手势里让原生 input 获得焦点，系统才会出键盘。
 * iOS：只读框点不出来键盘；setState 之后再 focus() 也出不来。
 * 禁止用 span 换 input、禁止未编辑时 readOnly 挡键盘（lockInput/禁用除外）。
 */
export function armNativeInput(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
): void {
  if (!el || el.disabled) return;
  el.readOnly = false;
  el.focus({ preventScroll: true });
}
