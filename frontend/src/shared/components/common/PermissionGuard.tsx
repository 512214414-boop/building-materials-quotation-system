// 权限守卫：无权限时业务话术提示（写按钮不隐藏，写失败由后端 403 文案提示）

import type { ReactNode } from 'react';
import { useHasViewPermission } from '../../hooks/usePermission.js';
import type { ViewCode } from '../../types/index.js';
import { PermissionDenied } from './PermissionDenied.js';

interface PermissionGuardProps {
  view: ViewCode;
  level?: 'ro' | 'rw';
  /** 业务功能名，用于提示 */
  featureLabel?: string;
  children: ReactNode;
}

export function PermissionGuard({ view, level = 'ro', featureLabel, children }: PermissionGuardProps) {
  const hasPermission = useHasViewPermission(view, level);
  const canRead = useHasViewPermission(view, 'ro');
  if (!hasPermission) {
    const kind = level === 'rw' && canRead ? 'ro' : 'none';
    return <PermissionDenied kind={kind} featureLabel={featureLabel} />;
  }
  return <>{children}</>;
}
