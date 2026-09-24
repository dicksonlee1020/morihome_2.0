import { useState } from 'react';
import { App, Button, Card, Empty, Flex, Segmented, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { can } from '../../config/permissions';
import { canApprove, ruleFor, useAdmin } from '../../data/admin';
import { confirmPayroll, employeeById, refreshPayrollDraft, useHr } from '../../data/hr';
import type { PayrollLine } from '../../data/hr';
import { staffById } from '../../data/staff';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { DataTableCard } from '../../components/DataTableCard';
import { useMockLoading } from '../../utils/useMockLoading';
import { fmtDate } from '../../utils/date';
import { money } from '../../utils/format';
import { useDensity } from '../../utils/useDensity';

const { Text } = Typography;

const NUM_FIELDS: (keyof Omit<PayrollLine, 'employeeId'>)[] = ['base', 'commission', 'allowance', 'mpfEmployee', 'mpfEmployer', 'net'];

/**
 * 薪資月結：finance 起草（佣金推導、隨時重算），ApprovalRule('payroll') 審批人確認後鎖定。
 * 全部係 HR class —— 呢個 tab 只有 payroll.view 嘅角色見到。
 */
export function PayrollTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const hr = useHr();
  const admin = useAdmin();
  const me = user as StaffUser;
  const runs = [...hr.payroll].sort((a, b) => b.month.localeCompare(a.month));
  const [month, setMonth] = useState(runs[0]?.month ?? '');
  const run = runs.find((r) => r.month === month) ?? runs[0];
  const loading = useMockLoading();

  const rule = ruleFor('payroll', admin);
  const approverName = rule?.approverUserId ? staffById(rule.approverUserId).name : t(`role.${rule?.approverRole ?? 'owner'}` as MessageKey);
  const canEdit = can(me.role, 'payroll', 'edit');
  const mayConfirm = run && run.status === 'draft' && canApprove('payroll', me, run.preparedBy, admin);

  const refresh = () => {
    if (!run) return;
    const res = refreshPayrollDraft(run.month, me);
    message[res.ok ? 'success' : 'error'](t(res.ok ? 'hr.payroll.msg.refreshed' : 'hr.payroll.msg.alreadyDecided'));
  };
  const confirm = () => {
    if (!run) return;
    const res = confirmPayroll(run.month, me);
    if (res.ok) message.success(t('hr.payroll.msg.confirmed'));
    else message.error(t(res.error === 'notApprover' ? 'hr.payroll.msg.notApprover' : 'hr.payroll.msg.alreadyDecided', { name: approverName }));
  };

  const num = (v: number, strong = false) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined }}>{money(v)}</Text>;
  const lines = run?.lines ?? [];
  const totals = Object.fromEntries(NUM_FIELDS.map((f) => [f, lines.reduce((s, l) => s + l[f], 0)])) as Record<(typeof NUM_FIELDS)[number], number>;

  const columns: TableColumnsType<PayrollLine> = [
    { title: t('hr.payroll.col.employee'), key: 'employee', fixed: 'left', width: wc(110), render: (_, l) => <Text style={{ fontWeight: 500 }}>{employeeById(l.employeeId, hr)?.name}</Text> },
    ...NUM_FIELDS.map((f) => ({
      title: t(`hr.payroll.col.${f}` as MessageKey),
      dataIndex: f,
      width: wc(f === 'net' ? 120 : 110),
      align: 'right' as const,
      sorter: (a: PayrollLine, b: PayrollLine) => a[f] - b[f],
      render: (v: number) => (f === 'net' ? num(v, true) : v === 0 ? <Text type="secondary">—</Text> : num(v)),
    })),
  ];

  const statusPill = run && <Pill tone={run.status === 'confirmed' ? 'success' : 'warning'} dot>{t(`hr.payroll.status.${run.status}` as MessageKey)}</Pill>;
  const meta = run && (
    run.status === 'confirmed' && run.confirmedBy && run.confirmedAt
      ? t('hr.payroll.confirmedBy', { name: staffById(run.confirmedBy).name, date: fmtDate(run.confirmedAt, 'detail') })
      : t('hr.payroll.preparedBy', { name: staffById(run.preparedBy).name, date: fmtDate(run.preparedAt, 'detail') })
  );

  return (
    <Flex vertical gap={12}>
      <Text type="secondary">{t('hr.payroll.hint')}</Text>
      <DataTableCard
        filters={
          <Flex align="center" gap={10} wrap>
            <Segmented value={run?.month} onChange={(v) => setMonth(String(v))} options={runs.map((r) => ({ value: r.month, label: r.month }))} />
            {statusPill}
          </Flex>
        }
        extra={
          <Space>
            {canEdit && run?.status === 'draft' && <Button icon={<ReloadOutlined />} onClick={refresh}>{t('hr.payroll.refresh')}</Button>}
            {can(me.role, 'payroll', 'export') && <Button icon={<DownloadOutlined />} onClick={() => message.success(t('common.exported'))}>{t('common.export')}</Button>}
            {mayConfirm && <Button type="primary" icon={<CheckOutlined />} onClick={confirm}>{t('hr.payroll.confirm')}</Button>}
          </Space>
        }
        count={`${t('hr.payroll.count', { n: lines.length })} · ${meta ?? ''}`}
        mobile={
          <CardList
            items={lines}
            rowKey={(l) => l.employeeId}
            renderItem={(l) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex justify="space-between" align="center" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{employeeById(l.employeeId, hr)?.name}</Text>
                  {num(l.net, true)}
                </Flex>
                <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {t('hr.payroll.col.base')} {money(l.base)}{l.commission > 0 && ` · ${t('hr.payroll.col.commission')} ${money(l.commission)}`}{l.allowance > 0 && ` · ${t('hr.payroll.col.allowance')} ${money(l.allowance)}`}
                </Text>
              </Card>
            )}
          />
        }
      >
        <Table<PayrollLine>
          loading={loading}
          rowKey="employeeId"
          columns={columns}
          dataSource={lines}
          pagination={false}
          scroll={{ x: wc(790) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text style={{ fontWeight: 600 }}>{t('hr.payroll.total')}</Text></Table.Summary.Cell>
                {NUM_FIELDS.map((f, i) => (
                  <Table.Summary.Cell key={f} index={i + 1} align="right">{num(totals[f], true)}</Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </DataTableCard>
    </Flex>
  );
}
