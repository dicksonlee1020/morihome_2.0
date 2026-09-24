import { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Empty, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { can } from '../../config/permissions';
import { canApprove, ruleFor, useAdmin } from '../../data/admin';
import { annualLeaveBalance, cancelLeave, decideLeave, employeeById, employeeOfUser, LEAVE_TYPES, leaveDays, requestLeave, seesAllStaff, useHr } from '../../data/hr';
import type { HrError, LeaveRequest, LeaveStatus, LeaveType } from '../../data/hr';
import { staffById } from '../../data/staff';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { FilterChip } from '../../components/FilterChip';
import { DataTableCard } from '../../components/DataTableCard';
import { useTablePagination } from '../../utils/useTablePagination';
import { useMockLoading } from '../../utils/useMockLoading';
import { cmpDate, fmtDate, fmtWhen } from '../../utils/date';
import { useDensity } from '../../utils/useDensity';
import { useIsMobile } from '../../theme';
import type { Tone } from '../../utils/tones';

const { Text } = Typography;

const STATUS_TONE: Record<LeaveStatus, Tone> = { pending: 'warning', approved: 'success', rejected: 'error', cancelled: 'muted' };
const STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

/**
 * 請假：申請 → ApprovalRule('leave') 嘅審批人批 → 排班自動變「請假」。
 * 預設排序：提交時間降序。審批人由規則決定，唔係 code。
 */
export function LeaveTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const hr = useHr();
  const admin = useAdmin();
  const me = user as StaffUser;
  const all = seesAllStaff(me.role);
  const [statuses, setStatuses] = useState<LeaveStatus[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');

  const rows = useMemo(
    () =>
      hr.leaves
        .filter((l) => all || employeeById(l.employeeId, hr)?.userId === me.id)
        .filter((l) => (statuses.length === 0 || statuses.includes(l.status)) && (types.length === 0 || types.includes(l.type)))
        .sort((a, b) => cmpDate(b.createdAt, a.createdAt)),
    [hr, all, me.id, statuses, types]
  );

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const rule = ruleFor('leave', admin);
  const approverName = rule?.approverUserId ? staffById(rule.approverUserId).name : t(`role.${rule?.approverRole ?? 'owner'}` as MessageKey);
  const requesterId = (l: LeaveRequest) => employeeById(l.employeeId, hr)?.userId ?? '';
  const mayDecide = (l: LeaveRequest) => l.status === 'pending' && canApprove('leave', me, requesterId(l), admin);
  const mayCancel = (l: LeaveRequest) => l.status === 'pending' && (requesterId(l) === me.id || can(me.role, 'hr', 'edit'));

  const ERR: Record<HrError, MessageKey> = {
    forbidden: 'hr.leave.msg.forbidden',
    notFound: 'hr.leave.msg.forbidden',
    notApprover: 'hr.leave.msg.notApprover',
    alreadyDecided: 'hr.leave.msg.alreadyDecided',
    overlap: 'hr.leave.msg.overlap',
  };
  const report = (res: { ok: true; value?: unknown } | { ok: false; error: HrError }, okKey: MessageKey) => {
    if (res.ok) message.success(t(okKey));
    else message.error(t(ERR[res.error], { name: approverName }));
  };

  const typeLabel = (v: LeaveType) => t(`hr.leave.type.${v}` as MessageKey);
  const statusPill = (s: LeaveStatus) => <Pill tone={STATUS_TONE[s]} dot>{t(`hr.leave.status.${s}` as MessageKey)}</Pill>;

  const actions = (l: LeaveRequest) => (
    <Space size={4} onClick={(e) => e.stopPropagation()}>
      {mayDecide(l) && (
        <>
          <Popconfirm
            title={t('hr.leave.approve')}
            description={<Input.TextArea size="small" placeholder={t('hr.leave.decisionNote')} value={note} onChange={(e) => setNote(e.target.value)} autoSize style={{ width: 240 }} />}
            okText={t('hr.leave.approve')}
            cancelText={t('common.cancel')}
            onConfirm={() => { report(decideLeave(l.id, 'approved', me, note), 'hr.leave.msg.approved'); setNote(''); }}
          >
            <Button size="small" type="primary">{t('hr.leave.approve')}</Button>
          </Popconfirm>
          <Popconfirm
            title={t('hr.leave.reject')}
            description={<Input.TextArea size="small" placeholder={t('hr.leave.decisionNote')} value={note} onChange={(e) => setNote(e.target.value)} autoSize style={{ width: 240 }} />}
            okText={t('hr.leave.reject')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => { report(decideLeave(l.id, 'rejected', me, note), 'hr.leave.msg.rejected'); setNote(''); }}
          >
            <Button size="small" danger>{t('hr.leave.reject')}</Button>
          </Popconfirm>
        </>
      )}
      {mayCancel(l) && <Button size="small" type="text" onClick={() => report(cancelLeave(l.id, me), 'hr.leave.msg.cancelled')}>{t('hr.leave.cancel')}</Button>}
    </Space>
  );

  const columns: TableColumnsType<LeaveRequest> = [
    { title: t('hr.leave.col.employee'), key: 'employee', fixed: 'left', width: wc(100), render: (_, l) => <Text style={{ fontWeight: 500 }}>{employeeById(l.employeeId, hr)?.name}</Text> },
    { title: t('hr.leave.col.type'), dataIndex: 'type', width: wc(90), render: (v: LeaveType) => <Text>{typeLabel(v)}</Text> },
    { title: t('hr.leave.col.from'), dataIndex: 'from', width: wc(100), sorter: (a, b) => cmpDate(a.from, b.from), render: (v: string) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(v)}</Text> },
    { title: t('hr.leave.col.to'), dataIndex: 'to', width: wc(100), sorter: (a, b) => cmpDate(a.to, b.to), render: (v: string) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(v)}</Text> },
    { title: t('hr.leave.col.days'), dataIndex: 'days', width: wc(70), align: 'right', sorter: (a, b) => a.days - b.days, render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</Text> },
    { title: t('hr.leave.col.reason'), dataIndex: 'reason', width: wc(180), ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}><Text type="secondary" ellipsis>{v || '—'}</Text></Tooltip> },
    { title: t('hr.leave.col.status'), dataIndex: 'status', width: wc(100), render: (s: LeaveStatus) => statusPill(s) },
    { title: t('hr.leave.col.createdAt'), dataIndex: 'createdAt', width: wc(100), sorter: (a, b) => cmpDate(a.createdAt, b.createdAt), defaultSortOrder: 'descend', render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(v)}</Text> },
    { title: t('hr.leave.col.decidedBy'), key: 'decidedBy', width: wc(140), ellipsis: { showTitle: false }, render: (_, l) => (l.decidedBy ? <Tooltip title={l.decisionNote}><Text type="secondary" ellipsis>{staffById(l.decidedBy).name}{l.decisionNote && ` · ${l.decisionNote}`}</Text></Tooltip> : <Text type="secondary">—</Text>) },
    { title: t('common.actions'), key: 'actions', fixed: 'right', width: wc(190), render: (_, l) => actions(l) },
  ];

  const statusOptions = STATUSES.map((s) => ({ value: s, label: statusPill(s) }));
  const typeOptions = LEAVE_TYPES.map((v) => ({ value: v, label: typeLabel(v) }));

  return (
    <Flex vertical gap={12}>
      <DataTableCard
        filters={
          <>
            <FilterChip label={t('hr.leave.filter.status')} options={statusOptions} value={statuses} onChange={setStatuses} />
            <FilterChip label={t('hr.leave.filter.type')} options={typeOptions} value={types} onChange={setTypes} />
          </>
        }
        onClearFilters={statuses.length || types.length ? () => { setStatuses([]); setTypes([]); } : undefined}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t('hr.leave.new')}</Button>}
        count={`${t('hr.leave.count', { n: rows.length })} · ${t('hr.leave.approverHint', { name: approverName })}${all ? '' : ` · ${t('hr.selfOnly')}`}`}
        mobile={
          <CardList
            items={rows}
            rowKey={(l) => l.id}
            renderItem={(l) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={8}>
                  <Flex justify="space-between" align="center" gap={8}>
                    <Text style={{ fontWeight: 600 }}>{employeeById(l.employeeId, hr)?.name} · {typeLabel(l.type)}</Text>
                    {statusPill(l.status)}
                  </Flex>
                  <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(l.from)} – {fmtDate(l.to)} · {l.days}</Text>
                  {l.reason && <Text type="secondary">{l.reason}</Text>}
                  {actions(l)}
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<LeaveRequest>
          loading={loading}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(1170) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>
      <LeaveModal open={creating} onClose={() => setCreating(false)} me={me} />
    </Flex>
  );
}

function LeaveModal({ open, onClose, me }: { open: boolean; onClose: () => void; me: StaffUser }) {
  const t = useT();
  const { message } = App.useApp();
  const hr = useHr();
  const isMobile = useIsMobile();
  const all = can(me.role, 'hr', 'edit');
  const mine = employeeOfUser(me.id, hr);
  const [form] = Form.useForm<{ employeeId: string; type: LeaveType; range: [Dayjs, Dayjs] | null; reason: string }>();
  const range = Form.useWatch('range', form);
  const employeeId = Form.useWatch('employeeId', form) ?? mine?.id;
  const emp = employeeId ? employeeById(employeeId, hr) : null;
  const days = range?.[0] && range?.[1] ? leaveDays(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')) : 0;

  return (
    <Modal
      open={open}
      title={t('hr.leave.new')}
      okText={t('hr.leave.form.submit')}
      cancelText={t('common.cancel')}
      onCancel={onClose}
      destroyOnHidden
      width={isMobile ? '100%' : 480}
      onOk={() =>
        form.validateFields().then((v) => {
          if (!v.range) return;
          const res = requestLeave({ employeeId: v.employeeId ?? mine?.id ?? '', type: v.type, from: v.range[0].format('YYYY-MM-DD'), to: v.range[1].format('YYYY-MM-DD'), reason: v.reason ?? '' }, me);
          if (res.ok) {
            message.success(t('hr.leave.msg.submitted'));
            form.resetFields();
            onClose();
          } else message.error(t(res.error === 'overlap' ? 'hr.leave.msg.overlap' : 'hr.leave.msg.forbidden'));
        })
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ type: 'annual', employeeId: mine?.id }}>
        <Form.Item name="employeeId" label={t('hr.leave.form.employee')} rules={[{ required: true }]}>
          <Select disabled={!all} options={hr.employees.map((e) => ({ value: e.id, label: e.name }))} />
        </Form.Item>
        <Form.Item name="type" label={t('hr.leave.form.type')}>
          <Select options={LEAVE_TYPES.map((v) => ({ value: v, label: t(`hr.leave.type.${v}` as MessageKey) }))} />
        </Form.Item>
        <Form.Item name="range" label={t('hr.leave.form.range')} rules={[{ required: true }]} extra={days > 0 ? t('hr.leave.form.days', { n: days }) : undefined}>
          <DatePicker.RangePicker style={{ width: '100%' }} minDate={dayjs().subtract(30, 'day')} />
        </Form.Item>
        <Form.Item name="reason" label={t('hr.leave.form.reason')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
        {emp && <Text type="secondary" style={{ fontSize: 13 }}>{t('hr.leave.balance', { n: annualLeaveBalance(emp, hr.leaves) })}</Text>}
      </Form>
    </Modal>
  );
}
