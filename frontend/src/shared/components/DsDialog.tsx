// DsDialog — 范式 B 专用弹窗组件
// v10.0 双端视觉交互一致：统一桌面端弹窗形态，safe-area 双端适配（桌面端为 0 不影响）
// v11.3.1 固定画布模式：弹窗保持桌面端原始宽度（780px），手机端可横向滚动查看
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface DsDialogProps extends ModalProps {
  title?: ReactNode;
}

export function DsDialog(props: DsDialogProps) {
  const { title, closeIcon, styles, style, width, ...rest } = props;
  return (
    <Modal
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
          paddingTop: 'var(--safe-area-top)',
        },
        title: { color: 'var(--text-default)' },
        body: {
          background: 'var(--bg-base-secondary)',
          paddingBottom: 'var(--safe-area-bottom)',
          overflow: 'auto',
          // v11.3.1：手机端弹窗内容超出时可横向拖动查看
          WebkitOverflowScrolling: 'touch',
        },
        footer: {
          background: 'var(--bg-base-secondary)',
          borderTop: '1px solid var(--border-neutral-l1)',
        },
        ...styles,
      }}
      width={width ?? 780}
      {...rest}
    />
  );
}

export default DsDialog;
