// 统一登录页
// 客户端与员工端页面程序仍独立，仅登录入口整合
// 页内「员工登录 / 客户登录」切换，提交后按身份路由分流至 /staff/* 或 /gate/*
// 旧路径 /staff/login、/gate 重定向到本页并预选对应身份 Tab

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { DsButton } from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import { DsSegmented } from '../../../shared/components/DsSegmented.js';
import { useStaffAuthStore } from '../../../shared/stores/auth.js';
import { useCustomerAuthStore } from '../../../shared/stores/customer-auth.js';
import { customerTokenStorage, staffTokenStorage } from '../../../shared/services/request.js';

type Role = 'staff' | 'customer';
type CustomerMode = 'verify' | 'request';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();

  // 身份切换：URL query ?role=staff|customer 预选，默认 staff
  const initialRole = (searchParams.get('role') === 'customer' ? 'customer' : 'staff') as Role;
  const [role, setRole] = useState<Role>(initialRole);

  // ----- 员工登录表单状态 -----
  const { login: staffLogin, loading: staffLoading } = useStaffAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ----- 客户登录表单状态 -----
  const { verify, requestAccess, loading: customerLoading } = useCustomerAuthStore();
  const [customerMode, setCustomerMode] = useState<CustomerMode>('verify');
  const [phone, setPhone] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');

  // 已登录直接跳转（按身份分流）
  useEffect(() => {
    if (role === 'staff' && staffTokenStorage.get()) {
      navigate('/staff/documents', { replace: true });
    } else if (role === 'customer' && customerTokenStorage.get()) {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  // ----- 员工登录提交 -----
  const handleStaffLogin = async () => {
    if (!username.trim()) {
      message.warning('请输入用户名');
      return;
    }
    if (!password) {
      message.warning('请输入密码');
      return;
    }
    try {
      await staffLogin(username.trim(), password);
      message.success('登录成功');
      navigate('/staff/documents', { replace: true });
    } catch (err) {
      message.error((err as Error).message || '登录失败');
    }
  };

  // ----- 客户授权码准入 -----
  const validLogin = () => /^[A-Za-z0-9_+\-.]{1,200}$/.test(phone.trim());

  const handleCustomerVerify = async () => {
    if (!validLogin()) {
      message.warning('请输入登录账号（电话或微信）');
      return;
    }
    if (!authCode.trim()) {
      message.warning('请输入授权码');
      return;
    }
    try {
      await verify(authCode.trim(), phone.trim());
      message.success('准入成功');
      navigate('/', { replace: true });
    } catch (err) {
      message.error((err as Error).message || '准入失败，请检查授权码和手机号');
    }
  };

  // ----- 客户申请准入 -----
  const handleCustomerRequest = async () => {
    if (!validLogin()) {
      message.warning('请输入登录账号（电话或微信）');
      return;
    }
    try {
      await requestAccess(phone.trim(), customerName.trim() || undefined, note.trim() || undefined);
      message.success('已提交申请，请等待门店审核');
      setCustomerMode('verify');
      setCustomerName('');
      setNote('');
    } catch (err) {
      message.error((err as Error).message || '申请提交失败');
    }
  };

  const customerInputStyle: React.CSSProperties = {
    height: '32px',
    background: 'var(--bg-base-tertiary)',
    borderColor: 'var(--border-neutral-l2)',
    color: 'var(--text-default)',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base-default)',
        color: 'var(--text-default)',
        padding: 'calc(var(--spacer-24) + var(--safe-area-top)) var(--spacer-16) calc(var(--spacer-24) + var(--safe-area-bottom))',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-base-secondary)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-8)',
          padding: 'var(--spacer-24) var(--spacer-16)',
        }}
      >
        {/* 品牌头部 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            marginBottom: 'var(--spacer-24)',
          }}
        >
          <span
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-8)',
              background: 'var(--bg-brand)',
              color: 'var(--text-onbrand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: '22px',
              marginBottom: 'var(--spacer-16)',
            }}
          >
            建
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-family-heading)',
              fontSize: 'var(--heading-xl-font-size)',
              fontWeight: 'var(--heading-xl-font-weight)',
              lineHeight: 'var(--heading-xl-line-height)',
              color: 'var(--text-default)',
              margin: 0,
            }}
          >
            订单中心
          </h1>
          <p
            style={{
              fontSize: 'var(--body-base-font-size)',
              lineHeight: 'var(--body-base-line-height)',
              color: 'var(--text-secondary)',
              marginTop: 'var(--spacer-6)',
            }}
          >
            订单协同工作台
          </p>
        </div>

        {/* 身份切换 Tab */}
        <div style={{ marginBottom: 'var(--spacer-20)' }}>
          <DsSegmented
            block
            value={role}
            onChange={(val) => setRole(val as Role)}
            options={[
              { label: '员工登录', value: 'staff' },
              { label: '客户登录', value: 'customer' },
            ]}
          />
        </div>

        {/* 员工登录区 */}
        {role === 'staff' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            <DsInput
              size="lg"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={{ height: '32px' }}
              onPressEnter={handleStaffLogin}
            />
            <DsInput
              size="lg"
              type={showPassword ? 'text' : 'password'}
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ height: '32px' }}
              onPressEnter={handleStaffLogin}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'var(--icon-secondary)',
                    fontSize: 'var(--body-xs-font-size)',
                    lineHeight: 1,
                  }}
                  aria-label="显示或隐藏密码"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              }
            />
            <DsButton
              variant="primary"
              size="lg"
              block
              loading={staffLoading}
              onClick={handleStaffLogin}
              style={{ height: '32px', marginTop: 'var(--spacer-4)' }}
            >
              登录
            </DsButton>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--spacer-4)' }}>
              <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                忘记密码？联系管理员重置
              </span>
            </div>
          </div>
        )}

        {/* 客户登录区 */}
        {role === 'customer' && (
          <>
            {/* 客户模式二级切换：授权码准入 / 申请准入 */}
            <div style={{ marginBottom: 'var(--spacer-12)' }}>
              <DsSegmented
                block
                value={customerMode}
                onChange={(val) => setCustomerMode(val as CustomerMode)}
                options={[
                  { label: '授权码准入', value: 'verify' },
                  { label: '申请准入', value: 'request' },
                ]}
              />
            </div>

            {/* 授权码准入表单 */}
            {customerMode === 'verify' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
                <DsInput
                  size="lg"
                  placeholder="登录账号（默认联系方式）"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={64}
                  style={customerInputStyle}
                  onPressEnter={handleCustomerVerify}
                />
                <DsInput
                  size="lg"
                  placeholder="请输入门店提供的授权码"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  style={customerInputStyle}
                  onPressEnter={handleCustomerVerify}
                />
                <DsButton
                  variant="primary"
                  size="lg"
                  block
                  loading={customerLoading}
                  onClick={handleCustomerVerify}
                  style={{ height: '32px', marginTop: 'var(--spacer-4)' }}
                >
                  进入采购清单
                </DsButton>
              </div>
            )}

            {/* 申请准入表单 */}
            {customerMode === 'request' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
                <DsInput
                  size="lg"
                  placeholder="登录账号（默认联系方式）"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={64}
                  style={customerInputStyle}
                />
                <DsInput
                  size="lg"
                  placeholder="您的姓名（可选）"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={customerInputStyle}
                />
                <DsInput
                  multiline
                  placeholder="补充说明（可选）"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  style={{
                    background: 'var(--bg-base-tertiary)',
                    borderColor: 'var(--border-neutral-l2)',
                    color: 'var(--text-default)',
                    borderRadius: 'var(--radius-4)',
                  }}
                />
                <DsButton
                  variant="primary"
                  size="lg"
                  block
                  loading={customerLoading}
                  onClick={handleCustomerRequest}
                  style={{ height: '32px', marginTop: 'var(--spacer-4)' }}
                >
                  提交申请
                </DsButton>
              </div>
            )}
          </>
        )}
      </section>

      {/* 提示 */}
      <p
        style={{
          maxWidth: '360px',
          textAlign: 'center',
          marginTop: 'var(--spacer-24)',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 'var(--body-xs-line-height)',
          color: 'var(--text-tertiary)',
          padding: '0 var(--spacer-16)',
        }}
      >
        {role === 'customer'
          ? '仅限合作门店客户访问，请使用档案里勾选为登录主号的那条联系方式'
          : '员工请使用分配的账号密码登录'}
      </p>

      {/* 页脚 */}
      <footer style={{
        maxWidth: '360px',
        textAlign: 'center',
        marginTop: 'var(--spacer-32)',
        padding: '0 var(--spacer-16)',
      }}>
        <p
          style={{
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 'var(--body-xs-line-height)',
            color: 'var(--text-tertiary)',
          }}
        >
          © 2026 订单中心 · 订单协同工作台
        </p>
      </footer>
    </div>
  );
}
