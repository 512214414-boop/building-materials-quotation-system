// DsDialog — 范式 B 专用弹窗组件
// v10.0 双端视觉交互一致：统一桌面端弹窗形态，safe-area 双端适配（桌面端为 0 不影响）
// v11.3.1 固定画布模式：弹窗保持桌面端原始宽度（780px），手机端可横向滚动查看
// v13 层级统一：弹窗注册进面板树，z 由 PanelTree.getPanelZ 统一导出（不再用 antd 静态 1000）。
//   此前弹窗是「树外节点」，与 FloatPanel 的动态 z 分属两套基数 → FloatPanel 恒压弹窗、
//   弹窗之间只靠 DOM 顺序，层级无法自动正确。现在两者同树，后开的永远在最上。
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { overlayModalContainer } from '../utils/canvasStage.js';
import {
  allocPanelId,
  registerPanel,
  unregisterPanel,
  getPanelZ,
  topPanelId,
  MODAL_Z_BASE,
} from './PanelTree.js';

export interface DsDialogProps extends ModalProps {
  title?: ReactNode;
}

export function DsDialog(props: DsDialogProps) {
  const {
    title,
    closeIcon,
    styles,
    style,
    width,
    getContainer,
    centered,
    zIndex,
    open,
    onCancel,
    ...rest
  } = props;
  // 稳定槽位 id：首帧即可用于取 z，注册在 effect 内完成
  // @types/react 19 去掉了无参 useRef<T>() 重载（T 无法从实参推断），必须显式给初值
  const panelIdRef = useRef<string | undefined>(undefined);
  if (!panelIdRef.current) panelIdRef.current = allocPanelId();
  const panelId = panelIdRef.current;
  const [panelZ, setPanelZ] = useState(MODAL_Z_BASE);
  const isOpen = open ?? true;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!isOpen) return;
    registerPanel({
      id: panelId,
      // 新弹窗挂在当前 z 最高者之下 → z 天然递增，无需调用方关心层级。
      // exclusive: false —— 弹窗叠弹窗（编辑框上开确认框）是合法栈式场景，不能互斥关闭。
      parentId: topPanelId(panelId),
      kind: 'modal',
      exclusive: false,
      close: () => {
        onCancelRef.current?.(undefined as unknown as MouseEvent<HTMLButtonElement>);
      },
    });
    setPanelZ(getPanelZ(panelId));
    return () => {
      unregisterPanel(panelId);
    };
  }, [isOpen, panelId]);

  return (
    <Modal
      data-shared-badge="C07"
      getContainer={getContainer ?? overlayModalContainer}
      centered={centered ?? true}
      open={open}
      onCancel={onCancel}
      zIndex={zIndex ?? panelZ}
      title={title}
      closeIcon={
        closeIcon ?? <CloseOutlined style={{ color: 'var(--text-secondary)' }} />
      }
      style={{
        background: 'var(--bg-base-secondary)',
        ...style,
      }}
      styles={{
        header: {
          background: 'var(--bg-base-secondary)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
          paddingTop: 'calc(var(--overlay-pad-y) + var(--safe-area-top))',
          minHeight: 'var(--shell-row-h)',
        },
        title: {
          color: 'var(--text-default)',
          fontSize: 'var(--heading-xs-font-size)',
          lineHeight: 'var(--shell-row-h)',
        },
        body: {
          background: 'var(--bg-base-secondary)',
          padding: 'var(--overlay-pad-x)',
          paddingBottom: 'calc(var(--overlay-pad-x) + var(--safe-area-bottom))',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        },
        footer: {
          background: 'var(--bg-base-secondary)',
          borderTop: '1px solid var(--border-neutral-l1)',
          padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
        },
        ...styles,
      }}
      width={width ?? 780}
      {...rest}
    />
  );
}

export default DsDialog;
