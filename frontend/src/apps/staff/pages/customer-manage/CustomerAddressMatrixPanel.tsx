import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import ArchiveCustomerAddressMatrixEditor, {
  type ArchiveCustomerAddressRecord,
} from '../../../../shared/components/archive/ArchiveCustomerAddressMatrixEditor.js';
import {
  listCustomerAddresses,
  type CustomerAddressView,
} from '../../../../shared/services/api/baseDataApi.js';
import { toArchiveCustomerAddressRecords } from '../../../../shared/services/customerAddressSync.js';

export default function CustomerAddressMatrixPanel({
  customerId,
  canWrite,
  onDirty,
  onBaseline,
  selectedRowKey,
  onRowSelect,
}: {
  customerId: string;
  canWrite: boolean;
  onDirty: (rows: ArchiveCustomerAddressRecord[]) => void;
  onBaseline: (rows: ArchiveCustomerAddressRecord[], raw: CustomerAddressView[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState<ArchiveCustomerAddressRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCustomerAddresses(customerId)
      .then((list) => {
        if (cancelled) return;
        const rows = toArchiveCustomerAddressRecords(list);
        setValue(rows);
        onBaseline(rows, list);
      })
      .catch(() => {
        if (!cancelled) {
          setValue([]);
          onBaseline([], []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, onBaseline]);

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <ArchiveCustomerAddressMatrixEditor
      key={`addr-panel-${customerId}`}
      value={value}
      canWrite={canWrite}
      onDirty={onDirty}
      selectedRowKey={selectedRowKey}
      onRowSelect={onRowSelect}
    />
  );
}
