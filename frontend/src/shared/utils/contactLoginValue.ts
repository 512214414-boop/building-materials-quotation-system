/** 联系号码 / 登录账号：电话或微信这类字符，不要中文、空格。 */
export const CONTACT_LOGIN_VALUE_RE = /^[A-Za-z0-9_+\-.]{1,200}$/;

export function isContactLoginValue(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  return CONTACT_LOGIN_VALUE_RE.test(v);
}

export const CONTACT_LOGIN_VALUE_HINT = '只能填电话号码或微信字符（字母、数字）';

export function guessContactMethod(value: string): string {
  const v = value.trim();
  if (/^1\d{10}$/.test(v)) return '电话';
  if (/^\+?\d{6,20}$/.test(v)) return '电话';
  return '微信';
}
