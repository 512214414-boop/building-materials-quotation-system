// DsDialog — 范式 B 专用弹窗组件
// v10.0 双端视觉交互一致：统一桌面端弹窗形态，safe-area 双端适配（桌面端为 0 不影响）
// v11.3.1 固定画布模式：弹窗保持桌面端原始宽度（780px），手机端可横向滚动查看
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { overlayModalContainer } from '../utils/canvasStage.js';

export interface DsDialogProps extends ModalProps {
  title?: ReactNode;
}

export function DsDialog(props: DsDialogProps) {
  const { title, closeIcon, styles, style, width, getContainer, centered, ...rest } = props;
  return (
    <Modal
      data-shared-badge="C07"
      getContainer={getContainer ?? overlayModalContainer}
      centered={centered ?? true}
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
