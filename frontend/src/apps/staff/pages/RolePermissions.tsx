// 角色与权限：左侧角色列表（可自定义）+ 右侧可折叠导航权限树
// 交互对齐常见后台 RBAC：树展开/折叠、叶子三态授权、预置角色不可删

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Form, Popconfirm, Spin, Tree, type TreeDataNode } from 'antd';
import DsSegmented from '../../../shared/components/DsSegmented.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import {
  createRole,
  deleteRole,
  listRoles,
  updateRole,
  updateRolePermissions,
  type RoleView,
} from '../../../shared/services/api/systemApi.js';
import {
  ALL_VIEW_CODES,
  type ViewCode,
  type ViewPermission,
  type ViewPermissions,
} from '../../../shared/types/index.js';
import { buildPermissionTree, type PermissionTreeNode } from '../menu.config.js';

const LEVEL_OPTIONS: { label: string; value: ViewPermission }[] = [
  { label: '无', value: 'none' },
  { label: '只读', value: 'ro' },
  { label: '读写', value: 'rw' },
];

function emptyPermissions(): ViewPermissions {
  const p: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) p[vc] = 'none';
  return p;
}

function collectKeys(nodes: PermissionTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: PermissionTreeNode[]) => {
    for (const n of list) {
      keys.push(n.key);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return keys;
}

function collectLeafKeys(node: PermissionTreeNode): ViewCode[] {
  if (node.permissionKey) return [node.permissionKey];
  return (node.children ?? []).flatMap(collectLeafKeys);
}

export default function RolePermissions() {
  const { message } = AntdApp.useApp();
  const navTree = useMemo(() => buildPermissionTree(), []);
  const allTreeKeys = useMemo(() => collectKeys(navTree), [navTree]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<ViewPermissions>(emptyPermissions());
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(allTreeKeys);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listRoles();
      setRoles(list);
      setActiveCode((prev) => {
        const keep = prev && list.some((r) => r.code === prev) ? prev : list[0]?.code ?? null;
        if (keep) {
          const role = list.find((r) => r.code === keep)!;
          setDraft({ ...emptyPermissions(), ...(role.viewPermissions ?? {}) });
        }
        return keep;
      });
    } catch (e) {
      message.error((e as Error).message || '加载角色失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const active = roles.find((r) => r.code === activeCode) ?? null;

  const selectRole = (role: RoleView) => {
    setActiveCode(role.code);
    setDraft({ ...emptyPermissions(), ...(role.viewPermissions ?? {}) });
  };

  const setLeaf = (key: ViewCode, level: ViewPermission) => {
    setDraft((prev) => ({ ...prev, [key]: level }));
  };

  /** 父节点一键：对本枝全部叶子设同一级别 */
  const setBranch = (node: PermissionTreeNode, level: ViewPermission) => {
    const leaves = collectLeafKeys(node);
    if (!leaves.length) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of leaves) next[k] = level;
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!activeCode) return;
    setSaving(true);
    try {
      const updated = await updateRolePermissions(activeCode, draft);
      setRoles((prev) =>
        prev.map((r) =>
          r.code === activeCode ? { ...r, viewPermissions: updated.viewPermissions ?? draft } : r,
        ),
      );
      message.success('权限已保存');
    } catch (e) {
      message.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const openCreateRole = () => {
    setRoleModalMode('create');
    roleForm.resetFields();
    setRoleModalOpen(true);
  };

  const openEditRole = () => {
    if (!active) return;
    setRoleModalMode('edit');
    roleForm.setFieldsValue({
      code: active.code,
      name: active.name,
      description: active.description ?? '',
    });
    setRoleModalOpen(true);
  };

  const handleSaveRoleMeta = async () => {
    try {
      const values = await roleForm.validateFields();
      setRoleSaving(true);
      if (roleModalMode === 'create') {
        const created = await createRole({
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        });
        message.success('角色已创建');
        setRoleModalOpen(false);
        await load();
        setActiveCode(created.code);
        setDraft({ ...emptyPermissions(), ...(created.viewPermissions ?? {}) });
      } else if (activeCode) {
        const updated = await updateRole(activeCode, {
          name: values.name.trim(),
          description: values.description?.trim() || null,
        });
        message.success('角色已更新');
        setRoleModalOpen(false);
        setRoles((prev) => prev.map((r) => (r.code === activeCode ? { ...r, ...updated } : r)));
      }
    } catch (e) {
      if ((e as Error).message) message.error((e as Error).message);
    } finally {
      setRoleSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!active || active.isSystem) return;
    try {
      await deleteRole(active.code);
      message.success('角色已删除');
      await load();
    } catch (e) {
      message.error((e as Error).message || '删除失败');
    }
  };

  const treeData: TreeDataNode[] = useMemo(() => {
    const toNode = (node: PermissionTreeNode): TreeDataNode => ({
      key: node.key,
      isLeaf: !!node.permissionKey,
      title: node.label,
      children: node.children?.map(toNode),
    });
    return navTree.map(toNode);
  }, [navTree]);

  const findMeta = (key: React.Key): PermissionTreeNode | null => {
    const walk = (list: PermissionTreeNode[]): PermissionTreeNode | null => {
      for (const n of list) {
        if (n.key === key) return n;
        if (n.children?.length) {
          const hit = walk(n.children);
          if (hit) return hit;
        }
      }
      return null;
    };
    return walk(navTree);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <ViewFrame
      actionBar={{
        statusHint: '自定义角色并按导航树授权；树可折叠展开，叶子设无 / 只读 / 读写。',
        actions: (
          <>
            <DsButton
              variant="secondary"
              size="sm"
              onClick={() => setExpandedKeys(allTreeKeys)}
              disabled={!active}
            >
              全部展开
            </DsButton>
            <DsButton variant="secondary" size="sm" onClick={() => setExpandedKeys([])} disabled={!active}>
              全部折叠
            </DsButton>
            <DsButton variant="primary" size="sm" loading={saving} disabled={!active} onClick={handleSavePermissions}>
              保存权限
            </DsButton>
          </>
        ),
      }}
      dialogs={
        <DsDialog
          open={roleModalOpen}
          onCancel={() => setRoleModalOpen(false)}
          title={roleModalMode === 'create' ? '新建角色' : '编辑角色'}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <DsButton variant="secondary" onClick={() => setRoleModalOpen(false)}>
                取消
              </DsButton>
              <DsButton variant="primary" loading={roleSaving} onClick={handleSaveRoleMeta}>
                确定
              </DsButton>
            </div>
          }
        >
          <Form form={roleForm} layout="vertical" requiredMark={false}>
            <Form.Item
              label="角色编码"
              name="code"
              rules={[
                { required: true, message: '请输入编码' },
                {
                  pattern: /^[a-z][a-z0-9_]*$/,
                  message: '小写字母开头，仅小写字母/数字/下划线',
                },
              ]}
            >
              <DsInput
                placeholder="如 warehouse_lead"
                disabled={roleModalMode === 'edit'}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item label="显示名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
              <DsInput placeholder="如 仓库主管" />
            </Form.Item>
            <Form.Item label="说明" name="description">
              <DsInput placeholder="可选" />
            </Form.Item>
          </Form>
        </DsDialog>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1, minHeight: 480 }}>
        {/* 左侧角色列表 */}
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-8)',
            overflow: 'hidden',
            background: 'var(--bg-base-secondary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-neutral-l1)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)' }}>角色</span>
            <DsButton variant="primary" size="sm" onClick={openCreateRole}>
              新建
            </DsButton>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {roles.map((role) => {
              const selected = role.code === activeCode;
              return (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => selectRole(role)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    background: selected ? 'var(--bg-brand-popup)' : 'transparent',
                    color: selected ? 'var(--text-brand)' : 'var(--text-default)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: selected ? 500 : 400,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{role.name}</span>
                    {role.isSystem && <DsTag color="default">预置</DsTag>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{role.code}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 右侧权限树 */}
        <section
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-8)',
            background: 'var(--bg-base-secondary)',
            overflow: 'hidden',
          }}
        >
          {active ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 6,
                  padding: '6px 8px',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-default)' }}>{active.name}</span>
                    {active.isSystem && <DsTag color="default">系统预置</DsTag>}
                  </div>
                  {active.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{active.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <DsButton variant="secondary" size="sm" onClick={openEditRole}>
                    编辑信息
                  </DsButton>
                  {!active.isSystem && (
                    <Popconfirm
                      title="删除该自定义角色？"
                      description="仅未绑定用户时可删"
                      onConfirm={handleDeleteRole}
                    >
                      <DsButton variant="secondary" size="sm">
                        删除
                      </DsButton>
                    </Popconfirm>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 16px' }}>
                <Tree
                  blockNode
                  showLine={{ showLeafIcon: false }}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  treeData={treeData}
                  selectable={false}
                  titleRender={(node) => {
                    const meta = findMeta(node.key);
                    if (!meta) return <span>{String(node.title)}</span>;

                    // 叶子：右侧三态
                    if (meta.permissionKey) {
                      const level = draft[meta.permissionKey] ?? 'none';
                      return (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '2px 0',
                            minHeight: 32,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-default)' }}>{meta.label}</div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-family-mono)',
                              }}
                            >
                              {meta.navPath}
                            </div>
                          </div>
                          <DsSegmented
                            size="small"
                            value={level}
                            disabled={saving}
                            options={LEVEL_OPTIONS}
                            onChange={(val) => setLeaf(meta.permissionKey!, val as ViewPermission)}
                          />
                        </div>
                      );
                    }

                    // 父节点：名称 + 本枝快捷
                    return (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          minHeight: 32,
                          paddingRight: 4,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)' }}>
                          {meta.label}
                        </span>
                        <div
                          style={{ display: 'flex', gap: 4 }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {LEVEL_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={saving}
                              title={`本枝全部设为「${opt.label}」`}
                              onClick={() => setBranch(meta, opt.value)}
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                border: '1px solid var(--border-neutral-l2)',
                                borderRadius: 'var(--radius-4)',
                                background: 'var(--bg-base-tertiary)',
                                color: 'var(--text-secondary)',
                                cursor: saving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ padding: 32, color: 'var(--text-tertiary)', textAlign: 'center' }}>请选择或新建角色</div>
          )}
        </section>
      </div>
    </ViewFrame>
  );
}
