// v2.0 usePermission hook

import { useStaffAuthStore } from '../stores/auth.js';
import type { ViewCode, ViewPermission } from '../types/index.js';

/** 查询当前用户对指定视图的权限级别 */
export function usePermission(view: ViewCode): ViewPermission {
  const user = useStaffAuthStore((s) => s.user);
  if (!user) return 'none';
  return user.viewPermissions[view] ?? 'none';
}

/** 判断当前用户是否对指定视图具备指定级别权限 */
export function useHasViewPermission(view: ViewCode, level: 'ro' | 'rw' = 'ro'): boolean {
  const perm = usePermission(view);
  if (perm === 'none') return false;
  if (level === 'ro') return perm === 'ro' || perm === 'rw';
  return perm === 'rw';
}
