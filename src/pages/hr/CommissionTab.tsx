import { useMemo, useState } from 'react';
import { Card, Empty, Flex, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { DEMO_TODAY } from '../../domain/clock';
import { can } from '../../config/permissions';
import { canSeeWithGrants, nowIso, useAdmin } from '../../data/admin';
import { commissionFor, employeeById, useHr } from '../../data/hr';
import type { CommissionRow } from '../../data/hr';
import { useOps } from '../../data/ops';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import { CardList } from '../../components/CardList';
import { FilterChip } from '../../components/FilterChip';
import { DataTableCard } from '../../components/DataTableCard';
import { useTablePagination } from '../../utils/useTablePagination';
import { useMockLoading } from '../../utils/useMockLoading';
import { money, percent } from '../../utils/format';
import { useDensity } from '../../utils/useDensity';

const { Text } = Typography;

const MONTHS = 6;

/**
 * 佣金：純推導（當月已完成訂單 × 佣金率），冇 setter（Invariant 2）。
 * sales 只見自己（SCOPE hr.self）；owner / finance 見全部。預設排序：月份降序。
 */
export function CommissionTab() {
  const t = useT();
  const { user } = useAuth();
  const { wc } = useDensity();
  const hr = useHr();
  const ops = useOps();
  const admin = useAdmin();
  const me = user as StaffUser;
  const all = can(me.role, 'payroll', 'view') || canSeeWithGrants(me, 'HR', Date.parse(nowIso()), admin);
  const [employees, setEmployees] = useState<string[]>([]);

  const rows = useMemo(() => {
    const months = Array.from({ length: MONTHS }, (_, i) => dayjs(DEMO_TODAY).subtract(i, 'month').format('YYYY-MM'));
    const staff = hr.employees.filter((e) => e.commissionRate !== null && (all || e.userId === me.id));
    return months
      .flatMap((m) => commissionFor(m, staff, ops.orders))
      .filter((r) => employees.length === 0 || employees.includes(r.employeeId));
  }, [hr.employees, ops.orders, all, me.id, employees]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);
  const num = (v: number, strong = false) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined }}>{money(v)}</Text>;

  const columns: TableColumnsType<CommissionRow> = [
    { title: t('hr.commission.col.month'), dataIndex: 'month', fixed: 'left', width: wc(100), sorter: (a, b) => a.month.localeCompare(b.month), defaultSortOrder: 'descend', render: (v: string) => <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v}</Text> },
    { title: t('hr.commission.col.employee'), key: 'employee', width: wc(110), render: (_, r) => <Text>{employeeById(r.employeeId, hr)?.name}</Text> },
    { title: t('hr.commission.col.orders'), dataIndex: 'orders', width: wc(100), align: 'right', sorter: (a, b) => a.orders - b.orders, render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</Text> },
    { title: t('hr.commission.col.sales'), dataIndex: 'salesAmount', width: wc(130), align: 'right', sorter: (a, b) => a.salesAmount - b.salesAmount, render: (v: number) => (v === 0 ? <Text type="secondary">—</Text> : num(v)) },
    { title: t('hr.commission.col.rate'), dataIndex: 'rate', width: wc(90), align: 'right', render: (v: number) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{percent(v)}</Text> },
    { title: t('hr.commission.col.commission'), dataIndex: 'commission', width: wc(120), align: 'right', sorter: (a, b) => a.commission - b.commission, render: (v: number) => (v === 0 ? <Text type="secondary">—</Text> : num(v, true)) },
  ];

  const options = hr.employees.filter((e) => e.commissionRate !== null).map((e) => ({ value: e.id, label: e.name }));

  return (
    <Flex vertical gap={12}>
      <Text type="secondary">{t('hr.commission.hint')}</Text>
      <DataTableCard
        filters={all && <FilterChip label={t('hr.commission.col.employee')} options={options} value={employees} onChange={setEmployees} />}
        onClearFilters={employees.length ? () => setEmployees([]) : undefined}
        count={`${t('hr.commission.count', { n: rows.length })}${all ? '' : ` · ${t('hr.selfOnly')}`}`}
        mobile={
          <CardList
            items={rows}
            rowKey={(r) => `${r.month}|${r.employeeId}`}
            renderItem={(r) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex justify="space-between" align="center" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{r.month} · {employeeById(r.employeeId, hr)?.name}</Text>
                  {num(r.commission, true)}
                </Flex>
                <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.orders} · {money(r.salesAmount)} × {percent(r.rate)}</Text>
              </Card>
            )}
          />
        }
      >
        <Table<CommissionRow>
          loading={loading}
          rowKey={(r) => `${r.month}|${r.employeeId}`}
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(650) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>
    </Flex>
  );
}
