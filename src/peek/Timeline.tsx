import { useMemo, useState } from 'react';
import { Avatar, Button, Flex, Mentions, Segmented, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';
import {
  CheckOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  MessageOutlined,
  PaperClipOutlined,
  PhoneOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { addComment, useOps } from '../data/ops';
import type { PeekModel } from '../data/ops';
import { STAFF, staffById } from '../data/staff';
import { canViewModel, filterTimeline, groupByDay, timelineFor } from '../data/timeline';
import type { TimelineFilter, TimelineItem } from '../data/timeline';
import { colors } from '../theme';
import { fmtDate, fmtWhen } from '../utils/date';
import { useT } from '../i18n';
import type { MessageKey, Translate } from '../i18n';
import { useAuth } from '../auth';

const { Text } = Typography;

const PAGE = 20;

/**
 * side-peek-spec §3：時間線 + 留言 composer。
 * 資料由 data/timeline.ts（代表後端 union API）嚟，呢度只 render。
 */
export function Timeline({ model, recordId }: { model: PeekModel; recordId: string }) {
  const t = useT();
  const { user } = useAuth();
  const ops = useOps();
  const role = user?.role ?? 'sales';
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [draft, setDraft] = useState('');

  const moveTypes = useMemo(() => new Map(ops.moves.map((m) => [m.id, m.type])), [ops.moves]);
  const items = useMemo(
    () => timelineFor({ audit: ops.audit, comments: ops.comments, activities: ops.activities, moveConsequences: ops.moveConsequences, moveTypes }, model, recordId, role),
    [ops, moveTypes, model, recordId, role]
  );
  const visible = filterTimeline(items, filter);
  const groups = groupByDay(visible.slice(0, limit));

  const mentionable = STAFF.filter((s) => s.role !== 'system' && s.id !== user?.id && canViewModel(s.role, model));

  const submit = () => {
    const body = draft.trim();
    if (!body || !user) return;
    const mentions = mentionable.filter((s) => body.includes(`@${s.name}`)).map((s) => s.id);
    addComment(model, recordId, user.id, body, mentions);
    setDraft('');
  };

  const filterOptions: { value: TimelineFilter; label: string }[] = [
    { value: 'all', label: t('peek.timeline.filter.all') },
    { value: 'comments', label: t('peek.timeline.filter.comments') },
    { value: 'changes', label: t('peek.timeline.filter.changes') },
    { value: 'logistics', label: t('peek.timeline.filter.logistics') },
    { value: 'activities', label: t('peek.timeline.filter.activities') },
  ];

  return (
    <Flex vertical gap={12}>
      {/* Composer（§3.3）：喺時間線頂；@ 只列有 view 權限嘅同事 */}
      <Flex vertical gap={6}>
        <Mentions
          value={draft}
          onChange={setDraft}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder={t('peek.timeline.composer')}
          options={mentionable.map((s) => ({ value: s.name, label: `${s.name} · ${t(`role.${s.role}` as MessageKey)}` }))}
        />
        <Flex align="center" justify="space-between" gap={8} wrap>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('peek.timeline.customerHint')}</Text>
          <Flex gap={8}>
            <Tooltip title={t('peek.timeline.attach')}>
              <Button size="small" icon={<PaperClipOutlined />} aria-label={t('peek.timeline.attach')} />
            </Tooltip>
            <Button size="small" type="primary" disabled={!draft.trim()} onClick={submit}>
              {t('peek.timeline.send')}
            </Button>
          </Flex>
        </Flex>
      </Flex>

      <Segmented size="small" value={filter} onChange={(v) => { setFilter(v as TimelineFilter); setLimit(PAGE); }} options={filterOptions} />

      {groups.length === 0 && <Text type="secondary">{t('peek.timeline.empty')}</Text>}
      {groups.map((g) => (
        <Flex key={g.key} vertical gap={8}>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
            {g.label.kind === 'today' ? t('peek.timeline.today') : g.label.kind === 'yesterday' ? t('peek.timeline.yesterday') : fmtDate(g.label.date, 'day')}
          </Text>
          {g.items.map((it) => (
            <TimelineRow key={it.id} item={it} t={t} />
          ))}
        </Flex>
      ))}
      {visible.length > limit && (
        <Button type="text" size="small" onClick={() => setLimit((n) => n + PAGE)}>
          {t('peek.timeline.loadMore', { n: visible.length - limit })}
        </Button>
      )}
    </Flex>
  );
}

const ICONS: Record<TimelineItem['kind'], ReactNode> = {
  comment: <MessageOutlined />,
  fieldChange: <EditOutlined />,
  stockMove: <InboxOutlined />,
  activity: <PhoneOutlined />,
  approval: <CheckOutlined />,
  attachment: <PaperClipOutlined />,
  shopifySync: <SyncOutlined />,
};

const fieldLabel = (t: Translate, field: string) => t(`peek.field.${field}` as MessageKey);
const fieldValue = (t: Translate, field: string, v: string) => {
  if (!v) return t('peek.timeline.blank');
  if (field === 'channel') return t(`orders.channel.${v}` as MessageKey);
  if (field === 'payment') return t(`orders.paymentStatus.${v}` as MessageKey);
  if (field === 'customerRequestedDate' || field === 'scheduledDate') return fmtDate(v.slice(0, 10)) + v.slice(10);
  return v;
};

function SystemLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Flex gap={8} align="flex-start" style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5 }}>
      <span style={{ color: colors.textMuted, marginTop: 2 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </Flex>
  );
}

function TimelineRow({ item, t }: { item: TimelineItem; t: Translate }) {
  const [open, setOpen] = useState(false);
  const actor = staffById(item.actorId).name;
  const when = <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', marginInlineStart: 8 }}>{fmtWhen(item.at)}</Text>;

  switch (item.kind) {
    case 'comment': {
      // 留言用卡片、顯示頭像；@名 highlight（§3.2）
      const parts = item.body.split(/(@[A-Za-z一-龥]+)/g);
      return (
        <Flex gap={10} align="flex-start">
          <Avatar size={28} style={{ background: colors.wood, flexShrink: 0 }}>{actor.slice(0, 1).toUpperCase()}</Avatar>
          <Flex vertical gap={2} style={{ flexGrow: 1, minWidth: 0, background: colors.bgHover, borderRadius: 6, padding: '8px 12px' }}>
            <Flex justify="space-between" align="baseline">
              <Text style={{ fontWeight: 500 }}>{actor}</Text>
              {when}
            </Flex>
            {item.deleted ? (
              <Text type="secondary" italic>{t('peek.timeline.deleted')}</Text>
            ) : (
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {parts.map((p, i) => (p.startsWith('@') ? <Text key={i} style={{ color: colors.primary, fontWeight: 500 }}>{p}</Text> : p))}
              </Text>
            )}
          </Flex>
        </Flex>
      );
    }
    case 'fieldChange':
      if (item.changes.length === 1) {
        const c = item.changes[0];
        return (
          <SystemLine icon={ICONS.fieldChange}>
            {t('peek.timeline.fieldChange', { actor, field: fieldLabel(t, c.field), from: fieldValue(t, c.field, c.from), to: fieldValue(t, c.field, c.to) })}
            {when}
          </SystemLine>
        );
      }
      return (
        <SystemLine icon={ICONS.fieldChange}>
          <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 13 }} onClick={() => setOpen((v) => !v)}>
            {t('peek.timeline.fieldChangeGroup', { actor, n: item.changes.length })} <DownOutlined style={{ fontSize: 10, transform: open ? 'rotate(180deg)' : undefined }} />
          </Button>
          {when}
          {open && (
            <ul style={{ margin: '4px 0 0', paddingInlineStart: 16 }}>
              {item.changes.map((c, i) => (
                <li key={i}>{t('peek.timeline.fieldChangeLine', { field: fieldLabel(t, c.field), from: fieldValue(t, c.field, c.from), to: fieldValue(t, c.field, c.to) })}</li>
              ))}
            </ul>
          )}
        </SystemLine>
      );
    case 'stockMove': {
      const consequence =
        item.consequence === 'readyToSchedule' ? t('peek.timeline.consequence.readyToSchedule', { inHk: item.inHk, total: item.total })
        : item.consequence === 'delivered' ? t('peek.timeline.consequence.delivered')
        : item.consequence === 'partial' ? t('peek.timeline.consequence.partial', { n: item.inHk, total: item.total })
        : item.consequence === 'transit' ? t('peek.timeline.consequence.transit')
        : item.consequence === 'shipped' ? t('peek.timeline.consequence.shipped')
        : item.moveType === 'arrivalQc' ? t('peek.timeline.consequence.inHk', { inHk: item.inHk, total: item.total }) : '';
      return (
        <SystemLine icon={ICONS.stockMove}>
          {t('peek.timeline.stockMove', { actor, type: t(`peek.moveType.${item.moveType}` as MessageKey), move: item.moveId })}
          {consequence && <Text style={{ fontSize: 13, color: colors.text }}> · {consequence}</Text>}
          {when}
        </SystemLine>
      );
    }
    case 'activity': {
      const text =
        item.feedback === 'unreachable' ? t('peek.timeline.activity.unreachable', { actor, date: fmtDate(item.nextDue) })
        : item.feedback === 'customerPostponed' ? t('peek.timeline.activity.postponed', { actor, date: fmtDate(item.nextDue) })
        : item.feedback === 'scheduled' ? t('peek.timeline.activity.scheduled', { actor })
        : t('peek.timeline.activity.done', { actor, kind: t(`followups.kind.${item.activityKind}` as MessageKey) });
      return <SystemLine icon={ICONS.activity}>{text}{when}</SystemLine>;
    }
    case 'approval':
      return (
        <SystemLine icon={ICONS.approval}>
          {t(item.decision === 'approved' ? 'peek.timeline.approved' : 'peek.timeline.rejected', { actor, type: t(`peek.approval.${item.approvalType}` as MessageKey), detail: item.detail })}
          {when}
        </SystemLine>
      );
    case 'attachment':
      return <SystemLine icon={ICONS.attachment}>{t('peek.timeline.attachment', { actor, file: item.fileName })}{when}</SystemLine>;
    case 'shopifySync':
      return (
        <SystemLine icon={ICONS.shopifySync}>
          {item.field
            ? t('peek.timeline.shopifyChange', { field: fieldLabel(t, item.field), from: fieldValue(t, item.field, item.from ?? ''), to: fieldValue(t, item.field, item.to ?? '') })
            : t('peek.timeline.shopifyCreated', { detail: item.detail })}
          {when}
        </SystemLine>
      );
  }
}
