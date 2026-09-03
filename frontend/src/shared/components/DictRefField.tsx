// DictRefField — 档案引用输入 + 管理面板一体化组件（同质同构根上收敛）
//
// ============================================================
// 设计依据（用户「同质同构 = 复用对应的组件，不是重新实现一模一样的代码；
//   档案引用输入 = 输入框实时匹配列表 + 旁边下拉按钮 → 档案管理面板（更新/修改档案），
//   输入匹配 = 改变引用」指令）：
//   - 品牌/供应商/分类/价格类型 = 全局档案（name 唯一），业务行通过 id 引用
//   - 标准形态（一个组件承载所有档案引用编辑，差异全部配置注入）：
//       ├── DictRefCell 输入框（field → 匹配复用/快捷新建/失焦解析 带 id）
//       ├── 管理下拉按钮（DownOutlined Popover）
//       └── 档案管理面板（DictRecordManagePanel：新增/选择/改名/删除 + 引用计数 + 被引用禁删）
//   - 输入匹配 = 改变引用；改档案名 = 管理面板（updateXxx 改全局档案，所有引用方跟随）
//
// 同一组件承载 brand/supplier/category/priceType 全部档案引用编辑，
// 禁止各档案自造 ManagePanel + 手动组装「输入框 + Popover + 面板」三件套
//   （曾致 BrandManagePanel / SupplierManagePanel / CategoryManagePanel 三份重复实现）
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { CSSProperties } from 'react';
import DictRefCell from './DictRefCell.js';
import DictListPanel, { type DictListPanelItem } from './DictListPanel.js';
import DsButton from './DsButton.js';
import { smartPopupContainer } from '../utils/smartPopupContainer.js';
import type { SuggestField } from '../services/api/baseDataApi.js';
import {
  applyDictChange,
  previewDictChange,
} from '../services/api/baseDataApi.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';
import { resolveGuard } from '../config/resolveGuard.js';
import { dictChangeKindOfField, isDictEntryField } from '../config/dictEntryViews.js';

// ============================================================
// §1 档案记录 / 管理面板配置
// ============================================================

/** 档案记录（list 返回项必须含 id + name；count 为引用计数对象，可选） */
export interface DictRecord {
  id: string | number;
  name: string;
  count?: Record<string, number>;
}

/** 读取档案引用计数（count 为各档案 view 的差异化可选字段，统一按 Record 读取） */
function refCountOf<T>(it: T, countField?: string): number {
  if (!countField) return 0;
  return (it as unknown as { count?: Record<string, number> }).count?.[countField] ?? 0;
}

/** 档案管理面板增删改查配置（业务方传入对应 API，差异全部配置注入） */
export interface DictRecordConfig<T extends { id: string | number; name: string } = DictRecord> {
  /** 列表加载（返回含引用计数的记录数组；分页接口在配置内取 .list） */
  list: () => Promise<T[]>;
  /** 新增档案（name 传入） */
  create: (name: string) => Promise<{ id: string | number; name: string }>;
  /** 改名（修改全局档案，所有引用方跟随） */
  update: (id: string, data: { name: string }) => Promise<unknown>;
  /** 删除（物理删除，被引用时由面板拦截） */
  remove: (id: string) => Promise<unknown>;
  /** 引用计数字段名（如 specBrands/purchasePrices/products/salePrices；不传则不渲染计数列） */
  countField?: string;
  /** 计数列表头（如「引用数」「产品数」） */
  countHeader?: string;
  /** 名称列表头（如「供应商名称」「品牌名称」「分类名称」） */
  nameHeader?: string;
  /** 新增输入框占位 */
  addPlaceholder?: string;
  /** 编辑输入框占位 */
  editPlaceholder?: string;
  /** 空列表文案 */
  emptyText?: string;
  /** 实体名（提示文案用，如「供应商」「品牌」「分类」） */
  entityName?: string;
  /** 被引用时禁止删除（默认 true） */
  forbidDeleteWhenRef?: boolean;
  /** 列表排序（如分类按 sortOrder；不传保持接口顺序） */
  sort?: (a: T, b: T) => number;
  /**
   * 录入/挂载场景是否允许边用边建（直接建即选 + reused 提示，无二次确认）。
   * 默认 true（有 create 即允许）。系统预置只读字典（如 address_type）设 false，
   * 槽位自动不出快建行，只能走管理面板。列表列筛恒为 allowCreate=false。
   */
  quickCreate?: boolean;
  /** 检索字段名（用于 suggest API 调用，如 'brand'/'supplier'/'category'；不传则需调用方传 suggestField） */
  suggestField?: SuggestField;
}

// ============================================================
// §2 档案管理面板（DictListPanel 配置化封装，唯一实现）
// ============================================================

export interface DictRecordManagePanelProps<T extends { id: string | number; name: string } = DictRecord> {
  dict: DictRecordConfig<T>;
  /** 当前绑定档案 ID（高亮当前行） */
  currentId?: string | number | null;
  /** 选择档案回调（换引用/预选） */
  onSelect: (id: string | number, name: string) => void;
  disabled?: boolean;
}

export function DictRecordManagePanel<T extends { id: string | number; name: string } = DictRecord>({
  dict,
  currentId,
  onSelect,
  disabled,
}: DictRecordManagePanelProps<T>) {
  const { message, modal } = useCanvasApp();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const entityName = dict.entityName ?? '档案';
  const countField = dict.countField;

  // ---- 加载档案列表 ----
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await dict.list();
      const sorted = dict.sort ? [...list].sort(dict.sort) : list;
      setItems(sorted);
    } catch {
      message.error(`加载${entityName}列表失败`);
    } finally {
      setLoading(false);
    }
  }, [dict, entityName, message]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ---- 业务行 → 通用面板行映射 ----
  const rows = useMemo<DictListPanelItem[]>(
    () =>
      items.map((it) => {
        const refCount = refCountOf(it, countField);
        return {
          key: String(it.id),
          name: it.name,
          count: countField ? refCount : undefined,
          isCurrent: currentId != null && String(it.id) === String(currentId),
          disabled,
          // 被引用时禁止删除（先解除引用）
          deleteTitle:
            countField && refCount > 0 && dict.forbidDeleteWhenRef !== false
              ? '需先解除引用'
              : '删除',
          data: it,
        };
      }),
    [items, currentId, disabled, countField, dict.forbidDeleteWhenRef],
  );

  // ---- 选择档案（换引用/预选）----
  const handleSelect = useCallback(
    (item: DictListPanelItem) => {
      const it = item.data as T;
      onSelect(it.id, it.name);
    },
    [onSelect],
  );

  // ---- 新增档案 ----
  const handleCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const block = resolveGuard('dict_item_add', {
        collections: { items },
        form: { trimmed, entityName },
      });
      if (block) {
        message.warning(block);
        return;
      }
      try {
        const created = await dict.create(trimmed);
        setItems((prev) => [{ ...created } as T, ...prev]);
        message.success(`已创建${entityName}「${trimmed}」`);
      } catch {
        message.error(`新增${entityName}失败，请重试`);
      }
    },
    [items, dict, entityName, message],
  );

  // ---- 保存编辑（改名口径全站统一：字典类同名 → dictMerge 并档；无同名 → 直接改名）----
  // 用户拍板（2026-09）：字典项改名输入已有同名不再报「已存在」，而是并档——
  // preview 影响行数 → 确认 → applyDictChange（引用归并，单据快照不受影响）。
  // 非字典类（无 dictMerge 支持）同名仍按声明化守卫拦截。
  const handleRename = useCallback(
    async (item: DictListPanelItem, newName: string) => {
      const it = item.data as T;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === it.name) return;
      const dup = items.find((x) => String(x.id) !== String(it.id) && x.name === trimmed);
      const canMerge =
        !!dup && !!dict.suggestField && isDictEntryField(dict.suggestField) && !!it.id && dup.id != null;
      if (dup && !canMerge) {
        // 非字典类：保留声明化 rowUnique 守卫（entity-meta.yml dict_item_rename）
        const block = resolveGuard('dict_item_rename', {
          collections: { items },
          form: { trimmed, entityName },
        });
        if (block) {
          message.warning(block);
          throw new Error('duplicate');
        }
      }
      if (canMerge) {
        const kind = dictChangeKindOfField(dict.suggestField!);
        let preview;
        try {
          preview = await previewDictChange({ kind, fromId: String(it.id), toName: trimmed });
        } catch (e) {
          message.error((e as { message?: string })?.message || '无法计算并档影响');
          throw e;
        }
        try {
          await modal.confirm({
            title: `并档：${entityName}「${trimmed}」已存在`,
            content: `${preview.summary}（影响 ${preview.total} 处引用）。确认把「${it.name}」并到「${trimmed}」？`,
            okText: '并档',
            cancelText: '取消',
          });
        } catch {
          throw new Error('cancelled');
        }
        try {
          await applyDictChange({ kind, fromId: String(it.id), toName: trimmed });
          setItems((prev) => prev.filter((x) => String(x.id) !== String(it.id)));
          if (currentId != null && String(it.id) === String(currentId)) {
            onSelect(dup.id, dup.name);
          }
          message.success(`已把「${it.name}」并到「${trimmed}」，所有引用同步归并`);
        } catch {
          message.error('并档失败，请重试');
          throw new Error('merge failed');
        }
        return;
      }
      try {
        await dict.update(String(it.id), { name: trimmed });
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, name: trimmed } : x)));
        // 当前绑定档案被改名 → 同步外部引用名
        if (currentId != null && String(it.id) === String(currentId)) {
          onSelect(it.id, trimmed);
        }
        message.success(`${entityName}名称已更新（所有引用方同步生效）`);
      } catch {
        message.error('修改失败，请重试');
        throw new Error('update failed');
      }
    },
    [items, dict, currentId, entityName, message, modal, onSelect],
  );

  // ---- 删除档案（被引用时禁止删除，先解除引用）----
  const handleDelete = useCallback(
    (item: DictListPanelItem) => {
      const it = item.data as T;
      const refCount = refCountOf(it, countField);
      const forbid = countField && refCount > 0 && dict.forbidDeleteWhenRef !== false;
      modal.confirm({
        title: `删除${entityName}档案`,
        content: forbid
          ? `${entityName}「${it.name}」被 ${refCount} 处引用，请先解除引用后再删除。`
          : `确认删除${entityName}档案「${it.name}」？此操作不可恢复。`,
        okText: forbid ? '知道了' : '确认删除',
        cancelText: '取消',
        okType: forbid ? 'default' : 'danger',
        onOk:
          forbid
            ? () => Promise.resolve()
            : async () => {
                try {
                  await dict.remove(String(it.id));
                  setItems((prev) => prev.filter((x) => String(x.id) !== String(it.id)));
                  message.success(`${entityName}已删除`);
                } catch {
                  message.error(`删除失败，可能存在引用`);
                }
              },
      });
    },
    [modal, message, dict, entityName, countField],
  );

  return (
    <DictListPanel
      items={rows}
      nameHeader={dict.nameHeader ?? `${entityName}名称`}
      countHeader={countField ? (dict.countHeader ?? '引用数') : undefined}
      searchable={false}
      addPlaceholder={dict.addPlaceholder ?? `输入新${entityName}名称`}
      addPosition="top"
      addMode="input"
      onCreate={handleCreate}
      onRename={handleRename}
      onDelete={handleDelete}
      onSelect={handleSelect}
      emptyText={dict.emptyText ?? `暂无${entityName}，请在上方输入框新增`}
      loading={loading}
      disabled={disabled}
      editPlaceholder={dict.editPlaceholder ?? `输入新${entityName}名称`}
    />
  );
}

// ============================================================
// §3 档案引用输入 + 管理下拉按钮（一体化）
// ============================================================

export interface DictRefFieldProps<T extends { id: string | number; name: string } = DictRecord> {
  /** 字段类型（supplier/brand/priceType/category），决定输入框检索接口与快捷新建函数 */
  field: SuggestField;
  /** 当前绑定档案名（受控） */
  value: string;
  /** 引用解析回调（选择复用/快捷新建/失焦解析/管理面板选用均带 id） */
  onResolve: (item: { id: string; name: string }) => void;
  /** 当前绑定档案 ID（管理面板高亮当前行；分类等 number id 直接传入） */
  currentId?: string | number | null;
  /** 档案管理面板增删改查配置 */
  dict: DictRecordConfig<T>;
  /** 占位符 */
  placeholder?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 输入框失焦回调（退出编辑态等） */
  onBlur?: () => void;
  /** 输入框按键回调（Enter 提交等） */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** 输入框自定义样式（如宽度/字号） */
  inputStyle?: CSSProperties;
  /** 自定义样式（应用到根容器） */
  style?: CSSProperties;
}

export function DictRefField<T extends { id: string | number; name: string } = DictRecord>({
  field,
  value,
  onResolve,
  currentId,
  dict,
  placeholder,
  disabled,
  onBlur,
  onKeyDown,
  inputStyle,
  style,
}: DictRefFieldProps<T>) {
  return (
    <div
      data-shared-badge="C15"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        width: '100%',
        ...style,
      }}
    >
      <DictRefCell
        field={field}
        value={value}
        onResolve={onResolve}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        style={{ flex: '1 1 auto', minWidth: 0, ...inputStyle }}
      />
      <Popover
        trigger="click"
        placement="bottomLeft"
        destroyOnHidden={false}
        getPopupContainer={smartPopupContainer}
        autoAdjustOverflow={false}
        content={
          <DictRecordManagePanel
            dict={dict}
            currentId={currentId}
            disabled={disabled}
            onSelect={(id, name) => onResolve({ id: String(id), name })}
          />
        }
      >
        <DsButton
          size="sm"
          variant="ghost"
          className="ds-addon-btn"
          icon={<DownOutlined />}
          disabled={disabled}
          title="管理档案（新增/修改档案名称）"
        />
      </Popover>
    </div>
  );
}

export default DictRefField;
