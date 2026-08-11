// 无权限说明页：业务话术，不暴露技术词
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PermissionDenied } from '../../../shared/components/common/PermissionDenied.js';
import DsButton from '../../../shared/components/DsButton.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';

export default function NoPermission() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetLabel = searchParams.get('target') || undefined;

  return (
    <ViewFrame>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <PermissionDenied kind="none" featureLabel={targetLabel} minHeight="50vh" />
        <DsButton variant="primary" onClick={() => navigate('/staff/documents')}>
          返回采购清单
        </DsButton>
      </div>
    </ViewFrame>
  );
}
