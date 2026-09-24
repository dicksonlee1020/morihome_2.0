import { useState } from 'react';
import { App, Button, Card, Empty, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FIELD_CLASS_ROLES, ROLE_MATRIX, ROLES, SCOPE_RULES } from '../../config/permissions';
import type { Action, FieldClass, Module, StaffRole } from '../../config/permissions';
import { grantActive, issueGrant, nowIso, revokeGrant, useAccounts, useAdmin } from '../../data/admin';
import type { FieldGrant } from '../../data/admin';
import { staffById } from '../../data/staff';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { DataTableCard } from '../../components/DataTableCard';
import { useMockLoading } from '../../utils/useMockLoading';
import { cmpDate, fmtWhen } from '../../utils/date';
import { useDensity } from '../../utils/useDensity';
import { colors, useIsMobile } from '../../theme';

const { Text, Title } = Typography;

const MODULES = Object.keys(ROLE_MATRIX) as Module[];
const ACTIONS: Action[] = ['view', 'edit', 'execute', 'export'];
const FIELD_CLASSES = Object.keys(FIELD_CLASS_ROLES) as FieldClass[];

/**
 * 權限（§9.2 registry 只讀、§9.5 field classes、§9.4 scope、§9.8 臨時授權）。
 * 矩陣直接由 config/permissions.ts render —— 改權限 = 改 registry，唔係呢頁。
 */
export function PermissionsTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const isMobile = useIsMobile();
  const admin = useAdmin();
  const me = user as StaffUser;
  const isOwner = me.role === 'owner';
  const loading = useMockLoading();
  const nowMs = Date.parse(nowIso());
  const [granting, setGranting] = useState(false);

  const roleLabel = (r: StaffRole) => t(`role.${r}` as MessageKey);
  const actionLabel = (a: Action) => t(`permissions.action.${a}` as MessageKey);

  /* ---- role matrix (read-only) */
  const matrixColumns: TableColumnsType<{ module: Module }> = [
    { title: t('permissions.matrix.module'), key: 'module', fixed: 'left', width: wc(130), render: (_, r) => <Text style={{ fontWeight: 500 }}>{t(`permissions.module.${r.module}` as MessageKey)}</Text> },
    ...ROLES.map((role) => ({
      title: roleLabel(role),
      key: role,
      width: wc(110),
      align: 'center' as const,
      render: (_: unknown, r: { module: Module }) => {
        const actions = ROLE_MATRIX[r.module][role];
        if (actions.length === 0) return <Text style={{ color: colors.textDisabled }}>{t('permissions.short.none')}</Text>;
        const full = ACTIONS.every((a) => actions.includes(a));
        return (
          <Tooltip title={actions.map(actionLabel).join(' · ')}>
            <span>
              <Pill tone={full ? 'brand' : 'muted'}>
                {full ? t('permissions.short.all') : ACTIONS.filter((a) => actions.includes(a)).map((a) => t(`permissions.short.${a}` as MessageKey)).join('·')}
              </Pill>
            </span>
          </Tooltip>
        );
      },
    })),
  ];

  /* ---- grants */
  const grantState = (g: FieldGrant): 'active' | 'expired' | 'revoked' => (g.revokedAt ? 'revoked' : grantActive(g, nowMs) ? 'active' : 'expired');
  const grants = [...admin.grants].sort((a, b) => cmpDate(b.grantedAt, a.grantedAt));
  const grantPill = (g: FieldGrant) => {
    const s = grantState(g);
    return <Pill tone={s === 'active' ? 'success' : 'muted'} dot>{t(`permissions.grants.status.${s}` as MessageKey)}</Pill>;
  };
  const revoke = (g: FieldGrant) => {
    const res = revokeGrant(g.id, me);
    if (res.ok) message.success(t('permissions.grants.msg.revoked'));
    else message.error(t('permissions.grants.msg.notOwner'));
  };
  const classLabel = (c: FieldClass) => t(`permissions.fieldClass.${c}` as MessageKey);

  const grantColumns: TableColumnsType<FieldGrant> = [
    { title: t('permissions.grants.col.user'), key: 'user', fixed: 'left', width: wc(110), render: (_, g) => <Text style={{ fontWeight: 500 }}>{staffById(g.userId).name}</Text> },
    { title: t('permissions.grants.col.class'), dataIndex: 'fieldClass', width: wc(150), render: (c: FieldClass) => <Pill tone="brand">{classLabel(c)}</Pill> },
    { title: t('permissions.grants.col.grantedBy'), key: 'by', width: wc(100), render: (_, g) => <Text type="secondary">{staffById(g.grantedBy).name}</Text> },
    { title: t('permissions.grants.col.grantedAt'), dataIndex: 'grantedAt', width: wc(110), sorter: (a, b) => cmpDate(a.grantedAt, b.grantedAt), defaultSortOrder: 'descend', render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(v)}</Text> },
    { title: t('permissions.grants.col.expires'), dataIndex: 'expiresAt', width: wc(110), sorter: (a, b) => cmpDate(a.expiresAt, b.expiresAt), render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(v)}</Text> },
    { title: t('permissions.grants.col.reason'), dataIndex: 'reason', width: wc(260), ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}><Text ellipsis>{v}</Text></Tooltip> },
    { title: t('permissions.grants.col.status'), key: 'status', width: wc(110), render: (_, g) => grantPill(g) },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right',
      width: wc(90),
      render: (_, g) =>
        isOwner && grantState(g) === 'active' ? (
          <Popconfirm title={t('permissions.grants.revoke')} okText={t('permissions.grants.revoke')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }} onConfirm={() => revoke(g)}>
            <Button size="small" type="text" danger>{t('permissions.grants.revoke')}</Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Text type="secondary">{t('permissions.subtitle')}</Text>

      <Card title={t('permissions.matrix.title')} size="small" styles={{ body: { padding: 0 } }}>
        <Table<{ module: Module }>
          size="small"
          rowKey="module"
          columns={matrixColumns}
          dataSource={MODULES.map((module) => ({ module }))}
          pagination={false}
          scroll={{ x: wc(130 + 110 * ROLES.length) }}
        />
        <Flex gap={16} wrap style={{ padding: '8px 12px' }}>
          {ACTIONS.map((a) => (
            <Text key={a} type="secondary" style={{ fontSize: 13 }}>{t(`permissions.short.${a}` as MessageKey)} = {actionLabel(a)}</Text>
          ))}
        </Flex>
      </Card>

      <Card title={t('permissions.fieldClass.title')} size="small" extra={<Text type="secondary" style={{ fontSize: 13 }}>{t('permissions.fieldClass.hint')}</Text>}>
        <Flex vertical gap={8}>
          {FIELD_CLASSES.map((c) => (
            <Flex key={c} gap={12} align="center" wrap>
              <Pill tone="brand">{classLabel(c)}</Pill>
              <Text type="secondary" style={{ fontSize: 13 }}>{t('permissions.fieldClass.roles')}</Text>
              <Flex gap={6} wrap>
                {FIELD_CLASS_ROLES[c].map((r) => <Pill key={r} tone="muted">{roleLabel(r)}</Pill>)}
              </Flex>
            </Flex>
          ))}
        </Flex>
      </Card>

      <Card title={t('permissions.scope.title')} size="small">
        <Flex vertical gap={6}>
          {Object.entries(SCOPE_RULES).map(([k, v]) => (
            <Flex key={k} gap={12} align="baseline" wrap>
              <Text code>{k}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text>
            </Flex>
          ))}
        </Flex>
      </Card>

      <Flex vertical gap={4}>
        <Title level={4} style={{ margin: 0 }}>{t('permissions.grants.title')}</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>{t('permissions.grants.hint')}</Text>
      </Flex>
      <DataTableCard
        count={t('permissions.grants.count', { n: grants.length })}
        extra={isOwner && <Button type="primary" icon={<PlusOutlined />} onClick={() => setGranting(true)}>{t('permissions.grants.new')}</Button>}
        mobile={
          <CardList
            items={grants}
            rowKey={(g) => g.id}
            renderItem={(g) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={6}>
                  <Flex justify="space-between" align="center">
                    <Text style={{ fontWeight: 600 }}>{staffById(g.userId).name} · {classLabel(g.fieldClass)}</Text>
                    {grantPill(g)}
                  </Flex>
                  <Text type="secondary">{t('permissions.grants.col.expires')} {fmtWhen(g.expiresAt)} · {staffById(g.grantedBy).name}</Text>
                  <Text>{g.reason}</Text>
                  {isOwner && grantState(g) === 'active' && <Button size="small" danger onClick={() => revoke(g)}>{t('permissions.grants.revoke')}</Button>}
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<FieldGrant>
          loading={loading}
          rowKey="id"
          columns={grantColumns}
          dataSource={grants}
          pagination={false}
          scroll={{ x: wc(1040) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>

      <GrantModal open={granting} onClose={() => setGranting(false)} me={me} isMobile={isMobile} />
    </Flex>
  );
}

function GrantModal({ open, onClose, me, isMobile }: { open: boolean; onClose: () => void; me: StaffUser; isMobile: boolean }) {
  const t = useT();
  const { message } = App.useApp();
  const accounts = useAccounts();
  const [form] = Form.useForm<{ userId: string; fieldClass: FieldClass; hours: number; reason: string }>();

  return (
    <Modal
      open={open}
      title={t('permissions.grants.new')}
      okText={t('permissions.grants.form.submit')}
      cancelText={t('common.cancel')}
      onCancel={onClose}
      destroyOnHidden
      width={isMobile ? '100%' : 480}
      onOk={() =>
        form.validateFields().then((v) => {
          const res = issueGrant(v, me);
          if (res.ok) {
            message.success(t('permissions.grants.msg.issued'));
            form.resetFields();
            onClose();
          } else message.error(t('permissions.grants.msg.notOwner'));
        })
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ fieldClass: 'COST', hours: 24 }}>
        <Form.Item name="userId" label={t('permissions.grants.form.user')} rules={[{ required: true }]}>
          <Select options={accounts.filter((a) => a.status === 'active' && a.id !== me.id).map((a) => ({ value: a.id, label: `${a.displayName} · ${t(`role.${a.role}` as MessageKey)}` }))} />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item name="fieldClass" label={t('permissions.grants.form.class')} style={{ flex: 1 }}>
            <Select options={FIELD_CLASSES.map((c) => ({ value: c, label: t(`permissions.fieldClass.${c}` as MessageKey) }))} />
          </Form.Item>
          <Form.Item name="hours" label={t('permissions.grants.form.hours')} style={{ width: 140 }}>
            <InputNumber min={1} max={168} style={{ width: '100%' }} />
          </Form.Item>
        </Flex>
        <Form.Item name="reason" label={t('permissions.grants.form.reason')} rules={[{ required: true, whitespace: true }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
