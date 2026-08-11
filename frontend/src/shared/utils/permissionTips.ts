// 权限提示：业务自然语言，只保留两类，不暴露权限码/技术词

export type PermissionDenyKind = 'none' | 'ro';

/** 不能打开该功能（权限 none） */
export function permissionNoneTip(featureLabel?: string): { title: string; detail: string } {
  const name = featureLabel?.trim();
  return {
    title: '暂不能使用',
    detail: name
      ? `您暂时不能使用「${name}」。如需使用，请联系管理员开通。`
      : '您暂时不能使用该功能。如需使用，请联系管理员开通。',
  };
}

/** 能看不能改（权限 ro，写操作被拒） */
export function permissionReadonlyTip(): { title: string; detail: string } {
  return {
    title: '只能查看',
    detail: '您只能查看，没有修改权限。如需修改，请联系管理员开通。',
  };
}

export function permissionTip(
  kind: PermissionDenyKind,
  featureLabel?: string,
): { title: string; detail: string } {
  return kind === 'ro' ? permissionReadonlyTip() : permissionNoneTip(featureLabel);
}
