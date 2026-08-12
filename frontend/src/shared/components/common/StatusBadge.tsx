// v2.0 单据状态徽章组件

import { Tag } from 'antd';
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '../../types/index.js';

const STATUS_COLOR_MAP: Record<DocumentStatus, string> = {
  demand_pending: 'default',
  quote_confirmed: 'blue',
  payment_settled: 'cyan',
  allocation_in_progress: 'gold',
  delivery_completed: 'green',
  cost_verified: 'purple',
  after_sales: 'magenta',
  archived: 'default',
};

interface StatusBadgeProps {
  status: DocumentStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = DOCUMENT_STATUS_LABELS[status] ?? status;
  const color = STATUS_COLOR_MAP[status] ?? 'default';
  return <Tag color={color} data-shared-badge="C59">{label}</Tag>;
}
