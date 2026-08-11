// 无权限 / 只读提示块：文案见 permissionTips.ts

import type { CSSProperties } from 'react';
import { permissionTip, type PermissionDenyKind } from '../../utils/permissionTips.js';

interface Props {
  kind?: PermissionDenyKind;
  /** 业务功能名，如「收款对账」；不要传权限码 */
  featureLabel?: string;
  minHeight?: string | number;
}

export function PermissionDenied({ kind = 'none', featureLabel, minHeight = '40vh' }: Props) {
  const tip = permissionTip(kind, featureLabel);
  const wrap: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight,
    gap: 'var(--spacer-16)',
    padding: 'var(--spacer-32)',
  };
  return (
    <div style={wrap}>
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--bg-overlay-l2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          color: 'var(--text-tertiary)',
        }}
        aria-hidden
      >
        🔒
      </div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
        <h2
          style={{
            fontSize: 'var(--heading-md-font-size)',
            fontWeight: 600,
            color: 'var(--text-default)',
            margin: 0,
          }}
        >
          {tip.title}
        </h2>
        <p style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-secondary)', margin: 0, maxWidth: 360 }}>
          {tip.detail}
        </p>
      </div>
    </div>
  );
}

export default PermissionDenied;
