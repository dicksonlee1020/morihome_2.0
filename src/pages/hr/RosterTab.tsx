import { useMemo, useState } from 'react';
import { Button, Card, Flex, Select, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { can } from '../../config/permissions';
import { DEMO_TODAY } from '../../domain/clock';
import { seesAllStaff, setShift, SHIFT_PLACES, SHIFT_SLOTS, useHr, weekDays, weekStart } from '../../data/hr';
import type { Employee, Shift, ShiftPlace, ShiftSlot } from '../../data/hr';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Pill } from '../../components/Pill';
import { DataTableCard } from '../../components/DataTableCard';
import { fmtDate } from '../../utils/date';
import { useDensity } from '../../utils/useDensity';
import { colors, useIsMobile } from '../../theme';
import type { Tone } from '../../utils/tones';

const { Text } = Typography;

const SLOT_TONE: Record<ShiftSlot, Tone> = { full: 'brand', am: 'brand', pm: 'brand', off: 'muted', leave: 'warning' };

/**
 * 排班：一星期一版，row = 同事、column = 日。有 hr.edit 嘅人直接喺格入面改
 * （inline edit，唔跳頁）；其他人只見自己嗰行（SCOPE hr.self）。
 */
export function RosterTab() {
  const t = useT();
  const { user } = useAuth();
  const { wc } = useDensity();
  const isMobile = useIsMobile();
  const hr = useHr();
  const me = user as StaffUser;
  const all = seesAllStaff(me.role);
  const editable = can(me.role, 'hr', 'edit');
  const [start, setStart] = useState(weekStart(DEMO_TODAY));
  const days = weekDays(start);

  const employees = useMemo(() => hr.employees.filter((e) => all || e.userId === me.id), [hr.employees, all, me.id]);
  const byKey = useMemo(() => new Map(hr.shifts.map((s) => [`${s.employeeId}|${s.date}`, s])), [hr.shifts]);
  const shiftOf = (e: Employee, date: string): Shift => byKey.get(`${e.id}|${date}`) ?? { employeeId: e.id, date, slot: 'off', place: null };
  const onDutyToday = hr.employees.filter((e) => !['off', 'leave'].includes(shiftOf(e, DEMO_TODAY).slot)).length;

  const slotLabel = (s: ShiftSlot) => t(`hr.slot.${s}` as MessageKey);
  const placeLabel = (p: ShiftPlace) => t(`hr.place.${p}` as MessageKey);

  const cell = (e: Employee, date: string) => {
    const s = shiftOf(e, date);
    const working = s.slot !== 'off' && s.slot !== 'leave';
    if (!editable) {
      return (
        <Flex vertical gap={2} align="flex-start">
          <Pill tone={SLOT_TONE[s.slot]} dot={working}>{slotLabel(s.slot)}</Pill>
          {working && s.place && <Text type="secondary" style={{ fontSize: 12 }}>{placeLabel(s.place)}</Text>}
        </Flex>
      );
    }
    return (
      <Flex vertical gap={4}>
        <Select
          size="small"
          value={s.slot}
          variant="borderless"
          style={{ width: 92, color: s.slot === 'leave' ? colors.warningText : s.slot === 'off' ? colors.textMuted : colors.primary }}
          options={SHIFT_SLOTS.map((v) => ({ value: v, label: slotLabel(v) }))}
          onChange={(v) => setShift(e.id, date, v, s.place ?? 'shop', me)}
        />
        {working && (
          <Select
            size="small"
            value={s.place ?? 'shop'}
            variant="borderless"
            style={{ width: 92 }}
            options={SHIFT_PLACES.map((v) => ({ value: v, label: placeLabel(v) }))}
            onChange={(v) => setShift(e.id, date, s.slot, v, me)}
          />
        )}
      </Flex>
    );
  };

  const columns: TableColumnsType<Employee> = [
    { title: t('hr.roster.col.name'), key: 'name', fixed: 'left', width: wc(110), render: (_, e) => <Text style={{ fontWeight: 500 }}>{e.name}</Text> },
    ...days.map((date) => ({
      key: date,
      width: wc(112),
      title: (
        <Flex vertical gap={0} align="center">
          <Text style={{ fontWeight: date === DEMO_TODAY ? 600 : 500, color: date === DEMO_TODAY ? colors.primary : undefined }}>{t(`hr.dow.${dayjs(date).day()}` as MessageKey)}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(date)}</Text>
        </Flex>
      ),
      onCell: () => (date === DEMO_TODAY ? { style: { background: colors.primarySubtle } } : {}),
      render: (_: unknown, e: Employee) => cell(e, date),
    })),
  ];

  const nav = (
    <Flex align="center" gap={8}>
      <Button size="small" icon={<LeftOutlined />} aria-label={t('hr.roster.prev')} onClick={() => setStart(dayjs(start).subtract(7, 'day').format('YYYY-MM-DD'))} />
      <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(days[0])} – {fmtDate(days[6])}</Text>
      <Button size="small" icon={<RightOutlined />} aria-label={t('hr.roster.next')} onClick={() => setStart(dayjs(start).add(7, 'day').format('YYYY-MM-DD'))} />
      {start !== weekStart(DEMO_TODAY) && <Button size="small" type="link" onClick={() => setStart(weekStart(DEMO_TODAY))}>{t('hr.roster.thisWeek')}</Button>}
    </Flex>
  );

  return (
    <DataTableCard
      filters={nav}
      count={`${t('hr.roster.onDuty', { n: onDutyToday })}${editable ? ` · ${t('hr.roster.editHint')}` : all ? '' : ` · ${t('hr.selfOnly')}`}`}
      mobile={
        <Flex vertical gap={8}>
          {days.map((date) => (
            <Card key={date} size="small" styles={{ body: { padding: '10px 14px' } }} style={date === DEMO_TODAY ? { borderColor: colors.primary } : undefined}>
              <Flex vertical gap={6}>
                <Flex gap={8} align="baseline">
                  <Text style={{ fontWeight: 600 }}>{t(`hr.dow.${dayjs(date).day()}` as MessageKey)}</Text>
                  <Text type="secondary">{fmtDate(date)}</Text>
                  {date === DEMO_TODAY && <Pill tone="brand">{t('hr.roster.today')}</Pill>}
                </Flex>
                {employees.map((e) => (
                  <Flex key={e.id} justify="space-between" align="center" gap={8} style={{ minHeight: 40 }}>
                    <Text>{e.name}</Text>
                    {cell(e, date)}
                  </Flex>
                ))}
              </Flex>
            </Card>
          ))}
        </Flex>
      }
    >
      <Table<Employee>
        rowKey="id"
        columns={columns}
        dataSource={employees}
        pagination={false}
        size={isMobile ? 'small' : undefined}
        scroll={{ x: wc(110 + 112 * 7) }}
      />
    </DataTableCard>
  );
}
