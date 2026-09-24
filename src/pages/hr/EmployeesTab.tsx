import { useMemo, useState } from 'react';
import { App, Card, Empty, Flex, InputNumber, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { can } from '../../config/permissions';
import { canSeeWithGrants, nowIso, useAdmin } from '../../data/admin';
import { annualLeaveBalance, DEPARTMENTS, seesAllStaff, updateEmployee, useHr } from '../../data/hr';
import type { Department, Employee } from '../../data/hr';
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
import { cmpDate, fmtDate } from '../../utils/date';
import { money, percent } from '../../utils/format';
import { useDensity } from '../../utils/useDensity';

const { Text } = Typography;

/** 員工名錄。預設排序：入職日期升序。薪資欄係 HR class；自己嗰行永遠見到。 */
export function EmployeesTab() {
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { wc } = useDensity();
  const hr = useHr();
  const admin = useAdmin();
  const me = user as StaffUser;
  const all = seesAllStaff(me.role);
  const seesHr = canSeeWithGrants(me, 'HR', Date.parse(nowIso()), admin);
  const payEdit = can(me.role, 'payroll', 'edit');

  const [depts, setDepts] = useState<Department[]>([]);
  const [keyword, setKeyword] = useState('');

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return hr.employees
      .filter((e) => all || e.userId === me.id)
      .filter((e) => (depts.length === 0 || depts.includes(e.dept)) && (!kw || e.name.toLowerCase().includes(kw)))
      .sort((a, b) => cmpDate(a.joinedAt, b.joinedAt));
  }, [hr.employees, all, me.id, depts, keyword]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const hrVisible = (e: Employee) => seesHr || e.userId === me.id;
  const deptLabel = (d: Department) => t(`hr.dept.${d}` as MessageKey);
  const numCell = (v: number, strong = false) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 500 : undefined }}>{v}</Text>;
  const save = (e: Employee, patch: Parameters<typeof updateEmployee>[1]) => {
    const res = updateEmployee(e.id, patch, me);
    if (res.ok) message.success(t('hr.employees.msg.saved'));
  };
  const payCell = (e: Employee, field: 'baseSalary' | 'allowance') =>
    !hrVisible(e) ? <Text type="secondary">···</Text> : payEdit ? (
      <InputNumber size="small" min={0} step={500} value={e[field]} style={{ width: 100 }} onChange={(v) => v != null && v !== e[field] && save(e, { [field]: v })} />
    ) : (
      <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{money(e[field])}</Text>
    );

  const columns: TableColumnsType<Employee> = [
    { title: t('hr.employees.col.name'), key: 'name', fixed: 'left', width: wc(120), sorter: (a, b) => a.name.localeCompare(b.name, 'zh-Hant'), render: (_, e) => <Text style={{ fontWeight: 500 }}>{e.name}{e.userId === me.id && <Text type="secondary">{t('common.me')}</Text>}</Text> },
    { title: t('hr.employees.col.dept'), dataIndex: 'dept', width: wc(110), render: (d: Department) => <Pill tone="muted">{deptLabel(d)}</Pill> },
    { title: t('hr.employees.col.type'), dataIndex: 'employmentType', width: wc(80), render: (v: Employee['employmentType']) => <Text type="secondary">{t(`hr.employment.${v}` as MessageKey)}</Text> },
    { title: t('hr.employees.col.joinedAt'), dataIndex: 'joinedAt', width: wc(110), sorter: (a, b) => cmpDate(a.joinedAt, b.joinedAt), defaultSortOrder: 'ascend', render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(v)}</Text> },
    { title: t('hr.employees.col.quota'), dataIndex: 'annualQuota', width: wc(90), align: 'right', sorter: (a, b) => a.annualQuota - b.annualQuota, render: (_, e) => (hrVisible(e) ? numCell(e.annualQuota) : <Text type="secondary">···</Text>) },
    { title: t('hr.employees.col.balance'), key: 'balance', width: wc(90), align: 'right', sorter: (a, b) => annualLeaveBalance(a, hr.leaves) - annualLeaveBalance(b, hr.leaves), render: (_, e) => (hrVisible(e) ? numCell(annualLeaveBalance(e, hr.leaves), true) : <Text type="secondary">···</Text>) },
    { title: t('hr.employees.col.base'), key: 'base', width: wc(120), align: 'right', sorter: (a, b) => a.baseSalary - b.baseSalary, render: (_, e) => payCell(e, 'baseSalary') },
    { title: t('hr.employees.col.allowance'), key: 'allowance', width: wc(110), align: 'right', sorter: (a, b) => a.allowance - b.allowance, render: (_, e) => payCell(e, 'allowance') },
    { title: t('hr.employees.col.commissionRate'), key: 'rate', width: wc(90), align: 'right', render: (_, e) => (!hrVisible(e) ? <Text type="secondary">···</Text> : e.commissionRate === null ? <Text type="secondary">—</Text> : <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{percent(e.commissionRate)}</Text>) },
  ];

  const deptOptions = DEPARTMENTS.map((d) => ({ value: d, label: deptLabel(d) }));

  return (
    <DataTableCard
      filters={all && <FilterChip label={t('hr.employees.filter.dept')} options={deptOptions} value={depts} onChange={setDepts} />}
      onClearFilters={depts.length || keyword ? () => { setDepts([]); setKeyword(''); } : undefined}
      search={all ? { value: keyword, onChange: setKeyword, placeholder: t('hr.employees.search') } : undefined}
      count={`${t('hr.employees.count', { n: rows.length })}${all ? '' : ` · ${t('hr.selfOnly')}`}${seesHr ? '' : ` · ${t('hr.employees.restricted')}`}`}
      mobile={
        <CardList
          items={rows}
          rowKey={(e) => e.id}
          renderItem={(e) => (
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Flex vertical gap={6}>
                <Flex justify="space-between" align="center">
                  <Text style={{ fontWeight: 600 }}>{e.name}</Text>
                  <Pill tone="muted">{deptLabel(e.dept)}</Pill>
                </Flex>
                <Text type="secondary">{t('hr.employees.col.joinedAt')} {fmtDate(e.joinedAt)} · {t(`hr.employment.${e.employmentType}` as MessageKey)}</Text>
                {hrVisible(e) && (
                  <Text type="secondary">{t('hr.leave.balance', { n: annualLeaveBalance(e, hr.leaves) })} · {t('hr.employees.col.base')} {money(e.baseSalary)}</Text>
                )}
              </Flex>
            </Card>
          )}
        />
      }
    >
      <Table<Employee>
        loading={loading}
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={pagination}
        scroll={{ x: wc(920) }}
        locale={{ emptyText: <Empty description={t('common.empty')} /> }}
      />
    </DataTableCard>
  );
}
