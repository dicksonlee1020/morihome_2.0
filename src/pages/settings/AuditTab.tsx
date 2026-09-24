import { useMemo, useState } from 'react';
import { Card, Empty, Flex, Table, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useAdmin } from '../../data/admin';
import type { AdminAuditEntry, AdminAuditEvent } from '../../data/admin';
import { STAFF, staffById } from '../../data/staff';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { CardList } from '../../components/CardList';
import { FilterChip } from '../../components/FilterChip';
import { DataTableCard } from '../../components/DataTableCard';
import { useTablePagination } from '../../utils/useTablePagination';
import { useMockLoading } from '../../utils/useMockLoading';
import { cmpDate, fmtWhen } from '../../utils/date';
import { useDensity } from '../../utils/useDensity';
import type { Tone } from '../../utils/tones';

const { Text } = Typography;

const EVENTS: AdminAuditEvent[] = [
  'login', 'logout', 'accountCreated', 'roleChange', 'roleChangeRequested', 'roleChangeConfirmed', 'roleChangeRejected',
  'statusChange', 'passwordReset', 'ruleChange', 'grantIssued', 'grantRevoked', 'approval', 'exportSensitive',
];

const EVENT_TONE: Partial<Record<AdminAuditEvent, Tone>> = {
  roleChange: 'warning',
  roleChangeRequested: 'warning',
  roleChangeConfirmed: 'warning',
  statusChange: 'warning',
  grantIssued: 'brand',
  grantRevoked: 'brand',
  approval: 'success',
  exportSensitive: 'error',
};

/** 審計紀錄（§9.7 append-only）。預設排序：時間降序。 */
export function AuditTab() {
  const t = useT();
  const { wc } = useDensity();
  const admin = useAdmin();
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return admin.audit
      .filter((a) => (events.length === 0 || events.includes(a.event)) && (users.length === 0 || users.includes(a.userId)))
      .filter((a) => !kw || a.targetId.toLowerCase().includes(kw) || (a.reason ?? '').toLowerCase().includes(kw) || staffById(a.targetId).name.toLowerCase().includes(kw))
      .sort((a, b) => cmpDate(b.ts, a.ts));
  }, [admin.audit, events, users, keyword]);

  const loading = useMockLoading();
  const pagination = useTablePagination(rows.length);

  const eventLabel = (e: AdminAuditEvent) => t(`audit.event.${e}` as MessageKey);
  const targetLabel = (a: AdminAuditEntry) => (a.targetModel === 'user' || a.targetModel === 'session' ? staffById(a.targetId).name : a.targetId);
  const changeText = (a: AdminAuditEntry) => (a.before || a.after ? `${a.before ?? '—'} → ${a.after ?? '—'}` : '');
  const eventPill = (e: AdminAuditEvent) => <Pill tone={EVENT_TONE[e] ?? 'muted'}>{eventLabel(e)}</Pill>;

  const columns: TableColumnsType<AdminAuditEntry> = [
    { title: t('audit.col.ts'), dataIndex: 'ts', fixed: 'left', width: wc(110), sorter: (a, b) => cmpDate(a.ts, b.ts), defaultSortOrder: 'descend', render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(v)}</Text> },
    { title: t('audit.col.user'), key: 'user', width: wc(100), render: (_, a) => <Text style={{ fontWeight: 500 }}>{staffById(a.userId).name}</Text> },
    { title: t('audit.col.event'), dataIndex: 'event', width: wc(160), render: (e: AdminAuditEvent) => eventPill(e) },
    { title: t('audit.col.target'), key: 'target', width: wc(150), ellipsis: { showTitle: false }, render: (_, a) => <Tooltip title={`${a.targetModel} · ${a.targetId}`}><Text ellipsis>{targetLabel(a)}</Text></Tooltip> },
    { title: t('audit.col.change'), key: 'change', width: wc(220), ellipsis: { showTitle: false }, render: (_, a) => <Tooltip title={changeText(a)}><Text type="secondary" ellipsis style={{ fontVariantNumeric: 'tabular-nums' }}>{changeText(a) || '—'}</Text></Tooltip> },
    { title: t('audit.col.reason'), dataIndex: 'reason', width: wc(240), ellipsis: { showTitle: false }, render: (v: string | null) => <Tooltip title={v ?? ''}><Text type="secondary" ellipsis>{v ?? '—'}</Text></Tooltip> },
  ];

  const eventOptions = EVENTS.map((e) => ({ value: e, label: eventPill(e) }));
  const userOptions = STAFF.filter((s) => s.role !== 'system').map((s) => ({ value: s.id, label: s.name }));

  return (
    <Flex vertical gap={12}>
      <Text type="secondary">{t('audit.subtitle')}</Text>
      <DataTableCard
        filters={
          <>
            <FilterChip label={t('audit.filter.event')} options={eventOptions} value={events} onChange={setEvents} />
            <FilterChip label={t('audit.filter.user')} options={userOptions} value={users} onChange={setUsers} />
          </>
        }
        onClearFilters={events.length || users.length || keyword ? () => { setEvents([]); setUsers([]); setKeyword(''); } : undefined}
        search={{ value: keyword, onChange: setKeyword, placeholder: t('audit.search') }}
        count={t('audit.count', { n: rows.length })}
        mobile={
          <CardList
            items={rows}
            rowKey={(a) => a.id}
            renderItem={(a) => (
              <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                <Flex vertical gap={6}>
                  <Flex justify="space-between" align="center" gap={8}>
                    <Text style={{ fontWeight: 600 }}>{staffById(a.userId).name}</Text>
                    <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(a.ts)}</Text>
                  </Flex>
                  <Flex gap={8} align="center" wrap>{eventPill(a.event)}<Text>{targetLabel(a)}</Text></Flex>
                  {changeText(a) && <Text type="secondary">{changeText(a)}</Text>}
                  {a.reason && <Text type="secondary">{a.reason}</Text>}
                </Flex>
              </Card>
            )}
          />
        }
      >
        <Table<AdminAuditEntry>
          loading={loading}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={pagination}
          scroll={{ x: wc(980) }}
          locale={{ emptyText: <Empty description={t('common.empty')} /> }}
        />
      </DataTableCard>
    </Flex>
  );
}
