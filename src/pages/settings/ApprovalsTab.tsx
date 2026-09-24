import { App, Card, Empty, Flex, InputNumber, Segmented, Select, Switch, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { can, ROLES } from '../../config/permissions';
import type { StaffRole } from '../../config/permissions';
import { updateRule, useAccounts, useAdmin } from '../../data/admin';
import type { ApprovalRule } from '../../data/admin';
import { staffById } from '../../data/staff';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { DataTableCard } from '../../components/DataTableCard';
import { useMockLoading } from '../../utils/useMockLoading';
import { useDensity } from '../../utils/useDensity';

const { Text } = Typography;

/**
 * 審批規則（§9.6）：審批係設定唔係 code。每行一個 approvalType；
 * 觸發值同審批人 inline 改，每次改動落 audit（data/admin.updateRule）。
 */
export function ApprovalsTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const admin = useAdmin();
  const accounts = useAccounts();
  const me = user as StaffUser;
  const editable = can(me.role, 'settings', 'edit');
  const loading = useMockLoading();

  const rows = [...admin.rules].sort((a, b) => (a.group === b.group ? a.id.localeCompare(b.id) : a.group === 'business' ? -1 : 1));

  const save = (id: string, patch: Parameters<typeof updateRule>[1]) => {
    const res = updateRule(id, patch, me);
    if (res.ok) message.success(t('approvals.msg.saved'));
    else message.error(t('accounts.msg.forbidden'));
  };

  const typeLabel = (r: ApprovalRule) => t(`approvals.type.${r.approvalType}` as MessageKey);

  const triggerCell = (r: ApprovalRule) => {
    if (r.thresholdUnit === null) return <Text type="secondary">{t('approvals.trigger.all')}</Text>;
    const key: MessageKey = r.thresholdUnit === 'hkd' ? 'approvals.trigger.amount' : 'approvals.trigger.pcs';
    if (!editable) return <Text>{t(key, { n: (r.threshold ?? 0).toLocaleString('en-HK') })}</Text>;
    return (
      <Flex align="center" gap={6} wrap>
        <Text type="secondary">{r.thresholdUnit === 'hkd' ? 'HK$ ≥' : '≥'}</Text>
        <InputNumber size="small" min={0} value={r.threshold ?? 0} style={{ width: 110 }} onChange={(v) => v != null && v !== r.threshold && save(r.id, { threshold: v })} />
        {r.thresholdUnit === 'pcs' && <Text type="secondary">{t('approvals.trigger.pcs', { n: '' }).replace(/[≥\s]/g, '').replace('差異', '')}</Text>}
      </Flex>
    );
  };

  const approverCell = (r: ApprovalRule) => {
    const person = r.approverUserId ? staffById(r.approverUserId).name : null;
    if (!editable) {
      return person ? <Text>{person}</Text> : <Text>{t(`role.${r.approverRole ?? 'owner'}` as MessageKey)}</Text>;
    }
    const mode = r.approverUserId ? 'person' : 'role';
    return (
      <Flex align="center" gap={6} wrap>
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => save(r.id, v === 'person' ? { approverUserId: accounts.find((a) => a.role === (r.approverRole ?? 'owner'))?.id ?? 'u-ocean' } : { approverUserId: null, approverRole: r.approverRole ?? 'owner' })}
          options={[
            { value: 'role', label: t('approvals.approver.byRole') },
            { value: 'person', label: t('approvals.approver.byPerson') },
          ]}
        />
        {mode === 'person' ? (
          <Select
            size="small"
            value={r.approverUserId ?? undefined}
            style={{ width: 120 }}
            options={accounts.filter((a) => a.status === 'active').map((a) => ({ value: a.id, label: a.displayName }))}
            onChange={(v) => save(r.id, { approverUserId: v })}
          />
        ) : (
          <Select
            size="small"
            value={r.approverRole ?? 'owner'}
            style={{ width: 120 }}
            options={ROLES.filter((x) => x !== 'sysadmin').map((x) => ({ value: x, label: t(`role.${x}` as MessageKey) }))}
            onChange={(v: StaffRole) => save(r.id, { approverRole: v })}
          />
        )}
      </Flex>
    );
  };

  const activeCell = (r: ApprovalRule) => (
    <Switch size="small" checked={r.active} disabled={!editable} onChange={(v) => save(r.id, { active: v })} />
  );

  const columns: TableColumnsType<ApprovalRule> = [
    { title: t('approvals.col.type'), key: 'type', fixed: 'left', width: wc(150), render: (_, r) => <Text style={{ fontWeight: 500 }}>{typeLabel(r)}</Text> },
    { title: t('approvals.col.group'), dataIndex: 'group', width: wc(90), render: (g: ApprovalRule['group']) => <Pill tone={g === 'business' ? 'brand' : 'muted'}>{t(`approvals.group.${g}` as MessageKey)}</Pill> },
    { title: t('approvals.col.trigger'), key: 'trigger', width: wc(220), render: (_, r) => triggerCell(r) },
    { title: t('approvals.col.approver'), key: 'approver', width: wc(300), render: (_, r) => approverCell(r) },
    { title: t('approvals.col.active'), key: 'active', width: wc(80), align: 'center', render: (_, r) => activeCell(r) },
  ];

  return (
    <Flex vertical gap={12}>
      <Text type="secondary">{t('approvals.subtitle')}</Text>
      {!editable && <Text type="secondary">{t('approvals.readOnly')}</Text>}
      <DataTableCard
        count={`${rows.length}`}
        mobile={
          <CardList
            items={rows}
            rowKey={(r) => r.id}
            renderItem={(r) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={8}>
                  <Flex justify="space-between" align="center">
                    <Text style={{ fontWeight: 600 }}>{typeLabel(r)}</Text>
                    {activeCell(r)}
                  </Flex>
                  <Flex gap={8} align="center"><Text type="secondary">{t('approvals.col.trigger')}</Text>{triggerCell(r)}</Flex>
                  <Flex gap={8} align="center" wrap><Text type="secondary">{t('approvals.col.approver')}</Text>{approverCell(r)}</Flex>
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<ApprovalRule>
          loading={loading}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: wc(840) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>
    </Flex>
  );
}
