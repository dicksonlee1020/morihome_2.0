import { useMemo, useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { KeyOutlined, PlusOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons';
import { can, ROLES } from '../../config/permissions';
import type { StaffRole } from '../../config/permissions';
import { changeRole, createAccount, decideRoleChange, pendingRoleRequests, resetAccountPassword, setAccountStatus, useAccounts, useAdmin } from '../../data/admin';
import type { AdminError } from '../../data/admin';
import { staffById } from '../../data/staff';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { Locale, MessageKey } from '../../i18n';
import { LOCALES } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { FilterChip } from '../../components/FilterChip';
import { DataTableCard } from '../../components/DataTableCard';
import { useTablePagination } from '../../utils/useTablePagination';
import { useMockLoading } from '../../utils/useMockLoading';
import { cmpDate, fmtDate, fmtWhen } from '../../utils/date';
import { useDensity } from '../../utils/useDensity';
import type { Tone } from '../../utils/tones';

const { Text } = Typography;

type AccountState = 'active' | 'inactive' | 'expired' | 'tempPassword';

const STATE_META: Record<AccountState, { labelKey: MessageKey; tone: Tone }> = {
  active: { labelKey: 'accounts.status.active', tone: 'success' },
  tempPassword: { labelKey: 'accounts.status.tempPassword', tone: 'warning' },
  expired: { labelKey: 'accounts.status.expired', tone: 'muted' },
  inactive: { labelKey: 'accounts.status.inactive', tone: 'muted' },
};

const accountState = (u: StaffUser, nowMs: number): AccountState =>
  u.status === 'inactive' ? 'inactive' : u.expiresAt && Date.parse(u.expiresAt) <= nowMs ? 'expired' : u.mustChangePassword ? 'tempPassword' : 'active';

const ERROR_KEY: Record<AdminError, MessageKey> = {
  forbidden: 'accounts.msg.forbidden',
  selfRole: 'accounts.msg.selfRole',
  selfStatus: 'accounts.msg.selfStatus',
  duplicate: 'accounts.msg.duplicate',
  notFound: 'accounts.msg.forbidden',
  notOwner: 'accounts.msg.forbidden',
  sameActor: 'accounts.msg.sameActor',
};

/** 帳號管理（§9.1、§9.3 註⁹）。預設排序：最後登入降序。 */
export function AccountsTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const accounts = useAccounts();
  const admin = useAdmin();
  const me = user as StaffUser;
  const editable = can(me.role, 'accounts', 'edit');
  const nowMs = Date.now();

  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [states, setStates] = useState<AccountState[]>([]);
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return accounts
      .filter((u) => (roles.length === 0 || roles.includes(u.role)) && (states.length === 0 || states.includes(accountState(u, nowMs))))
      .filter((u) => !kw || u.displayName.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw))
      .sort((a, b) => cmpDate(b.lastLoginAt, a.lastLoginAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, roles, states, keyword]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);
  const pending = pendingRoleRequests(admin);

  const report = (res: { ok: true; value?: unknown } | { ok: false; error: AdminError }, okKey: MessageKey) => {
    if (res.ok) message.success(t(okKey));
    else message.error(t(ERROR_KEY[res.error]));
  };

  const onRole = (u: StaffUser, to: StaffRole) => {
    const res = changeRole(u.id, to, me);
    if (res.ok) message.success(t(res.value === 'pending' ? 'accounts.msg.rolePending' : 'accounts.msg.roleApplied'));
    else message.error(t(ERROR_KEY[res.error]));
  };

  const roleLabel = (r: StaffRole) => t(`role.${r}` as MessageKey);
  const isSelf = (u: StaffUser) => u.id === me.id;
  const roleLocked = (u: StaffUser) => !editable || (isSelf(u) && me.role === 'sysadmin') || u.status === 'inactive';
  const hasPending = (u: StaffUser) => pending.some((r) => r.userId === u.id);

  const roleCell = (u: StaffUser) =>
    roleLocked(u) ? (
      <Text>{roleLabel(u.role)}</Text>
    ) : (
      <Flex align="center" gap={6}>
        <Select
          size="small"
          value={u.role}
          onChange={(v) => onRole(u, v)}
          options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
          style={{ width: 120 }}
          disabled={hasPending(u)}
        />
        {hasPending(u) && <Pill tone="warning" dot>{t('accounts.pending.self')}</Pill>}
      </Flex>
    );

  const actions = (u: StaffUser) =>
    editable && !isSelf(u) ? (
      <Space size={4} onClick={(e) => e.stopPropagation()}>
        {u.status === 'active' ? (
          <Popconfirm
            title={t('accounts.deactivate.title', { name: u.displayName })}
            description={t('accounts.deactivate.hint')}
            okText={t('accounts.action.deactivate')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => report(setAccountStatus(u.id, 'inactive', me), 'accounts.msg.statusChanged')}
          >
            <Button size="small" type="text" danger icon={<StopOutlined />}>{t('accounts.action.deactivate')}</Button>
          </Popconfirm>
        ) : (
          <Button size="small" type="text" onClick={() => report(setAccountStatus(u.id, 'active', me), 'accounts.msg.statusChanged')}>{t('accounts.action.activate')}</Button>
        )}
        <Popconfirm
          title={t('accounts.resetPassword.title', { name: u.displayName })}
          description={t('accounts.resetPassword.hint')}
          okText={t('accounts.action.resetPassword')}
          cancelText={t('common.cancel')}
          onConfirm={() => report(resetAccountPassword(u.id, me), 'accounts.msg.reset')}
        >
          <Tooltip title={t('accounts.action.resetPassword')}>
            <Button size="small" type="text" icon={<KeyOutlined />} aria-label={t('accounts.action.resetPassword')} />
          </Tooltip>
        </Popconfirm>
      </Space>
    ) : null;

  const statePill = (u: StaffUser) => {
    const m = STATE_META[accountState(u, nowMs)];
    return <Pill tone={m.tone} dot>{t(m.labelKey)}</Pill>;
  };

  const columns: TableColumnsType<StaffUser> = [
    {
      title: t('accounts.col.name'),
      key: 'name',
      fixed: 'left',
      width: wc(150),
      sorter: (a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hant'),
      render: (_, u) => (
        <Text style={{ fontWeight: 500 }}>
          {u.displayName}
          {isSelf(u) && <Text type="secondary">{t('common.me')}</Text>}
        </Text>
      ),
    },
    { title: t('accounts.col.email'), dataIndex: 'email', width: wc(230), ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}><Text type="secondary" ellipsis>{v}</Text></Tooltip> },
    { title: t('accounts.col.role'), key: 'role', width: wc(230), sorter: (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role), render: (_, u) => roleCell(u) },
    { title: t('accounts.col.locale'), dataIndex: 'locale', width: wc(90), render: (v: Locale) => <Text type="secondary">{LOCALES.find((l) => l.value === v)?.label ?? v}</Text> },
    { title: t('accounts.col.status'), key: 'status', width: wc(120), render: (_, u) => statePill(u) },
    {
      title: t('accounts.col.lastLogin'),
      dataIndex: 'lastLoginAt',
      width: wc(110),
      sorter: (a, b) => cmpDate(a.lastLoginAt, b.lastLoginAt),
      defaultSortOrder: 'descend',
      render: (v: string | null) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{v ? fmtWhen(v) : '—'}</Text>,
    },
    { title: t('accounts.col.expires'), dataIndex: 'expiresAt', width: wc(100), sorter: (a, b) => cmpDate(a.expiresAt, b.expiresAt), render: (v: string | null) => <Text type="secondary">{fmtDate(v)}</Text> },
    { title: t('common.actions'), key: 'actions', fixed: 'right', width: wc(170), render: (_, u) => actions(u) },
  ];

  const roleOptions = ROLES.map((r) => ({ value: r, label: roleLabel(r) }));
  const stateOptions = (Object.keys(STATE_META) as AccountState[]).map((s) => ({ value: s, label: <Pill tone={STATE_META[s].tone} dot>{t(STATE_META[s].labelKey)}</Pill> }));

  return (
    <Flex vertical gap={12}>
      <Alert type="info" showIcon title={t('accounts.hint')} />
      {pending.map((r) => {
        const requester = staffById(r.requestedBy).name;
        const mine = r.requestedBy === me.id;
        return (
          <Alert
            key={r.id}
            type="warning"
            showIcon
            title={t('accounts.pending.title')}
            description={t('accounts.pending.line', { requester, from: roleLabel(r.from), to: roleLabel(r.to) })}
            action={
              me.role === 'owner' && !mine ? (
                <Space>
                  <Button size="small" type="primary" onClick={() => report(decideRoleChange(r.id, 'confirmed', me), 'accounts.msg.roleApplied')}>{t('common.confirm')}</Button>
                  <Button size="small" onClick={() => report(decideRoleChange(r.id, 'rejected', me), 'accounts.msg.statusChanged')}>{t('hr.leave.reject')}</Button>
                </Space>
              ) : undefined
            }
          />
        );
      })}

      <DataTableCard
        filters={
          <>
            <FilterChip label={t('accounts.col.role')} options={roleOptions} value={roles} onChange={setRoles} />
            <FilterChip label={t('accounts.col.status')} options={stateOptions} value={states} onChange={setStates} />
          </>
        }
        onClearFilters={roles.length || states.length || keyword ? () => { setRoles([]); setStates([]); setKeyword(''); } : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('accounts.search') }}
        extra={editable && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('accounts.new')}</Button>}
        count={t('accounts.count', { n: rows.length })}
        mobile={
          <CardList
            items={rows}
            rowKey={(u) => u.id}
            renderItem={(u) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={8}>
                  <Flex justify="space-between" align="center" gap={8}>
                    <Text style={{ fontWeight: 600 }}>{u.displayName}{isSelf(u) && <Text type="secondary">{t('common.me')}</Text>}</Text>
                    {statePill(u)}
                  </Flex>
                  <Text type="secondary" ellipsis>{u.email}</Text>
                  {roleCell(u)}
                  <Text type="secondary">{t('accounts.col.lastLogin')} {u.lastLoginAt ? fmtWhen(u.lastLoginAt) : '—'}</Text>
                  {actions(u)}
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<StaffUser>
          loading={loading}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(1200) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>

      <CreateAccountModal open={creating} onClose={() => setCreating(false)} me={me} />
    </Flex>
  );
}

function CreateAccountModal({ open, onClose, me }: { open: boolean; onClose: () => void; me: StaffUser }) {
  const t = useT();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ displayName: string; email: string; role: StaffRole; locale: Locale; expiresAt?: { format: (f: string) => string } | null }>();

  return (
    <Modal
      open={open}
      title={t('accounts.new')}
      okText={t('accounts.form.submit')}
      cancelText={t('common.cancel')}
      onCancel={onClose}
      destroyOnHidden
      onOk={() =>
        form.validateFields().then((v) => {
          const res = createAccount({ email: v.email, displayName: v.displayName, role: v.role, locale: v.locale, expiresAt: v.expiresAt ? v.expiresAt.format('YYYY-MM-DD') : null }, me);
          if (res.ok) {
            message.success(t('accounts.msg.created'));
            form.resetFields();
            onClose();
          } else message.error(t(ERROR_KEY[res.error]));
        })
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ role: 'sales', locale: 'zh-Hant' }}>
        <Form.Item name="displayName" label={t('accounts.form.name')} rules={[{ required: true, message: t('auth.error.emailRequired') }]}>
          <Input prefix={<UserAddOutlined />} />
        </Form.Item>
        <Form.Item name="email" label={t('accounts.form.email')} rules={[{ required: true, type: 'email', message: t('auth.error.emailInvalid') }]}>
          <Input />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item name="role" label={t('accounts.form.role')} style={{ flex: 1 }}>
            <Select options={ROLES.map((r) => ({ value: r, label: t(`role.${r}` as MessageKey) }))} />
          </Form.Item>
          <Form.Item name="locale" label={t('accounts.form.locale')} style={{ flex: 1 }}>
            <Select options={LOCALES} />
          </Form.Item>
        </Flex>
        <Form.Item name="expiresAt" label={t('accounts.form.expires')} extra={t('accounts.form.expiresHint')}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
