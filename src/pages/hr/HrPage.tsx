import { useState } from 'react';
import { Empty, Flex, Tabs, Tooltip, Typography } from 'antd';
import { can } from '../../config/permissions';
import { employeeOfUser, useHr } from '../../data/hr';
import { useAuth } from '../../auth';
import { useT } from '../../i18n';
import { Pill } from '../../components/Pill';
import { EmployeesTab } from './EmployeesTab';
import { RosterTab } from './RosterTab';
import { LeaveTab } from './LeaveTab';
import { PayrollTab } from './PayrollTab';
import { CommissionTab } from './CommissionTab';

const { Text, Title } = Typography;

/**
 * 人事：員工 / 排班 / 請假 / 薪資 / 佣金。
 * Spec v0.2 凍結咗呢個模組；Dickson 2026-09-24 決定一齊起。流程全部係假設
 * （data/hr.ts 頂部列明），所以標題旁邊有「假設」pill 提醒。
 */
export function HrPage() {
  const t = useT();
  const { user } = useAuth();
  const hr = useHr();
  const role = user?.role ?? 'sales';
  // 佣金：見全公司（payroll.view）或者自己有佣金率先有呢個 tab
  const hasCommission = can(role, 'payroll', 'view') || (employeeOfUser(user?.id ?? '', hr)?.commissionRate ?? null) !== null;

  const items = [
    can(role, 'hr', 'view') && { key: 'employees', label: t('hr.tab.employees'), children: <EmployeesTab /> },
    can(role, 'hr', 'view') && { key: 'roster', label: t('hr.tab.roster'), children: <RosterTab /> },
    can(role, 'hr', 'view') && { key: 'leave', label: t('hr.tab.leave'), children: <LeaveTab /> },
    can(role, 'payroll', 'view') && { key: 'payroll', label: t('hr.tab.payroll'), children: <PayrollTab /> },
    can(role, 'hr', 'view') && hasCommission && { key: 'commission', label: t('hr.tab.commission'), children: <CommissionTab /> },
  ].filter((x): x is { key: string; label: string; children: React.ReactElement } => Boolean(x));

  const [active, setActive] = useState(items[0]?.key ?? 'employees');

  return (
    <Flex vertical gap={12}>
      <Flex vertical gap={2}>
        <Flex align="center" gap={10}>
          <Title level={1} style={{ margin: 0 }}>{t('hr.title')}</Title>
          <Tooltip title={t('hr.assumption')}>
            <span><Pill tone="warning" dot>TODO</Pill></span>
          </Tooltip>
        </Flex>
        <Text type="secondary">{t('hr.subtitle')}</Text>
      </Flex>
      {items.length === 0 ? (
        <Flex align="center" justify="center" style={{ minHeight: 400 }}>
          <Empty description={t('nav.noAccess')} />
        </Flex>
      ) : (
        <Tabs activeKey={active} onChange={setActive} items={items} destroyOnHidden />
      )}
    </Flex>
  );
}
