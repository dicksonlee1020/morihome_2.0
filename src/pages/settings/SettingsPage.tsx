import { useState } from 'react';
import { Alert, Empty, Flex, Tabs, Typography } from 'antd';
import { can } from '../../config/permissions';
import { useAuth } from '../../auth';
import { useT } from '../../i18n';
import { AccountsTab } from './AccountsTab';
import { LocationsTab, FinanceCategoriesTab, PaymentSettingsTab, ExpensePolicyTab, SettingsChangesTab } from './MasterSettingsTabs';
import { canViewSettingsFinance } from '../../data/settingsV14';
import { useV14Text } from '../../i18n/v14';
import { PermissionsTab } from './PermissionsTab';
import { AuditTab } from './AuditTab';

const { Text, Title } = Typography;

/**
 * 設定：帳號管理 / 審批規則 / 權限 / 審計紀錄（rbac-spec §9.1、§9.3 註⁹、§9.6–9.8）。
 * 每個 tab 對應 registry 一個 module，冇 view 權嘅 tab 唔出。
 */
export function SettingsPage() {
  const t = useT();
  const l = useV14Text();
  const { user } = useAuth();
  const role = user ?? 'sales';

  const items = [
    can(role, 'accounts', 'view') && { key: 'accounts', label: t('settings.tab.accounts'), children: <AccountsTab /> },
    can(role, 'settings', 'view') && { key: 'locations', label: l('門店／倉庫'), children: <LocationsTab /> },
    user && canViewSettingsFinance(user) && { key: 'categories', label: l('財務分類'), children: <FinanceCategoriesTab /> },
    user && canViewSettingsFinance(user) && { key: 'payments', label: l('收付款設定'), children: <PaymentSettingsTab /> },
    can(role, 'settings', 'view') && { key: 'approvals', label: t('settings.tab.approvals'), children: <ExpensePolicyTab /> },
    (can(role, 'accounts', 'view') || can(role, 'settings', 'view')) && { key: 'permissions', label: t('settings.tab.permissions'), children: <PermissionsTab /> },
    can(role, 'audit', 'view') && { key: 'changes', label: l('設定變更'), children: <SettingsChangesTab /> },
    can(role, 'audit', 'view') && { key: 'audit', label: t('settings.tab.audit'), children: <AuditTab /> },
  ].filter((x): x is { key: string; label: string; children: React.ReactElement } => Boolean(x));

  const [active, setActive] = useState(items[0]?.key ?? 'accounts');

  return (
    <Flex vertical gap={12}>
      <Flex vertical gap={2}>
        <Title level={1} style={{ margin: 0 }}>{t('settings.title')}</Title>
        <Text type="secondary">{t('settings.subtitle')}</Text>
      </Flex>
      <Alert type="info" showIcon title={l('v14 設定示範；重新整理後重置。')} />
      {items.length === 0 ? (
        <Flex align="center" justify="center" style={{ minHeight: 400 }}>
          <Empty description={t('nav.noAccess')} />
        </Flex>
      ) : (
        <Tabs activeKey={items.some(i => i.key === active) ? active : items[0]?.key} onChange={setActive} items={items} destroyOnHidden />
      )}
    </Flex>
  );
}
