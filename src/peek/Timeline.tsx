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
import {
  Avatar,
  Button,
  Flex,
  Mentions,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import type { ReactNode } from 'react';
import * as React from 'react';
import { useAuth as MoriUseAuth } from '../auth/hooks';
import { addComment, useOps } from '../data/ops';
import { STAFF, staffById } from '../data/staff';
import type { TimelineItem } from '../data/timeline';
import {
  canViewModel,
  filterTimeline,
  groupByDay,
  timelineFor,
} from '../data/timeline';
import type { MessageKey, Translate } from '../i18n';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
import { fmtDate, fmtWhen } from '../utils/date';
const { Text } = Typography;
const PAGE = 20;

/**
 * side-peek-spec §3：時間線 + 留言 composer。
 * 資料由 data/timeline.ts（代表後端 union API）嚟，呢度只 render。
 */
export function Timeline({ model, recordId }: any) {
  let n = MoriUseT();
  let { user } = MoriUseAuth();
  let ops = useOps();
  let role = (user == null ? undefined : user.role) ?? `sales`;
  let [filter, setFilter] = React.useState<any>(`all`);
  let [limit, setLimit] = React.useState<any>(PAGE);
  let [draft, setDraft] = React.useState<any>(``);
  let moveTypes = React.useMemo(
    () => new Map(ops.moves.map((e: any) => [e.id, e.type])),
    [ops.moves],
  );
  let visible = filterTimeline(
    React.useMemo(
      () =>
        timelineFor(
          {
            audit: ops.audit,
            comments: ops.comments,
            activities: ops.activities,
            moveConsequences: ops.moveConsequences,
            moveTypes,
          },
          model,
          recordId,
          role,
        ),
      [ops, moveTypes, model, recordId, role],
    ),
    filter,
  );
  let groups = groupByDay(visible.slice(0, limit));
  let mentionable = STAFF.filter(
    (t: any) =>
      t.role !== `system` &&
      t.id !== (user == null ? undefined : user.id) &&
      canViewModel(t.role, model),
  );
  let submit = () => {
    let n = draft.trim();
    if (!n || !user) return;
    let i = mentionable
      .filter((e: any) => n.includes(`@${e.name}`))
      .map((e: any) => e.id);
    addComment(model, recordId, user.id, n, i);
    setDraft(``);
  };
  let filterOptions: any[] = [
    {
      value: `all`,
      label: n(`peek.timeline.filter.all`),
    },
    {
      value: `comments`,
      label: n(`peek.timeline.filter.comments`),
    },
    {
      value: `changes`,
      label: n(`peek.timeline.filter.changes`),
    },
    {
      value: `logistics`,
      label: n(`peek.timeline.filter.logistics`),
    },
    {
      value: `activities`,
      label: n(`peek.timeline.filter.activities`),
    },
  ];
  return (
    <Flex vertical={true} gap={16}>
      <Flex vertical={true} gap={6}>
        <Mentions
          value={draft}
          onChange={setDraft}
          autoSize={{
            minRows: 2,
            maxRows: 5,
          }}
          placeholder={n(`peek.timeline.composer`)}
          options={mentionable.map((e: any) => ({
            value: e.name,
            label: `${e.name} · ${n(`role.${e.role}` as Parameters<typeof n>[0])}`,
          }))}
        />
        <Flex align={`center`} justify={`space-between`} gap={8} wrap={true}>
          <Text
            type={`secondary`}
            style={{
              fontSize: 13,
            }}
          >
            {n(`peek.timeline.customerHint`)}
          </Text>
          <Flex gap={8}>
            <Tooltip title={n(`peek.timeline.attach`)}>
              <Button
                size={`small`}
                icon={<PaperClipOutlined />}
                aria-label={n(`peek.timeline.attach`)}
              />
            </Tooltip>
            <Button
              size={`small`}
              type={`primary`}
              disabled={!draft.trim()}
              onClick={submit}
            >
              {n(`peek.timeline.send`)}
            </Button>
          </Flex>
        </Flex>
      </Flex>
      {
        <div
          style={{
            overflowX: `auto`,
            WebkitOverflowScrolling: `touch`,
            padding: `0 4px`,
            margin: `0 -4px`,
          }}
        >
          <Tabs
            size={`small`}
            activeKey={filter}
            onChange={(e: any) => {
              setFilter(e);
              setLimit(PAGE);
            }}
            items={filterOptions.map((e: any) => ({
              key: e.value,
              label: e.label,
              children: null,
            }))}
            tabBarStyle={{
              margin: 0,
              minWidth: `max-content`,
            }}
          />
        </div>
      }
      {groups.length === 0 && (
        <Text type={`secondary`}>{n(`peek.timeline.empty`)}</Text>
      )}
      {groups.map((e: any) => (
        <Flex vertical={true} gap={8} key={e.key}>
          <Text
            type={`secondary`}
            style={{
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {e.label.kind === `today`
              ? n(`peek.timeline.today`)
              : e.label.kind === `yesterday`
                ? n(`peek.timeline.yesterday`)
                : fmtDate(e.label.date, `day`)}
          </Text>
          {e.items.map((e: any) => (
            <TimelineRow item={e} t={n} key={e.id} />
          ))}
        </Flex>
      ))}
      {visible.length > limit && (
        <Button
          type={`text`}
          size={`small`}
          onClick={() => setLimit((e: any) => e + PAGE)}
        >
          {n(`peek.timeline.loadMore`, {
            n: visible.length - limit,
          })}
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
const fieldLabel = (t: Translate, field: string) =>
  t(`peek.field.${field}` as MessageKey);
const fieldValue = (t: Translate, field: string, v: string) => {
  if (!v) return t('peek.timeline.blank');
  if (field === 'channel') return t(`orders.channel.${v}` as MessageKey);
  if (field === 'payment') return t(`orders.paymentStatus.${v}` as MessageKey);
  if (field === 'customerRequestedDate' || field === 'scheduledDate')
    return fmtDate(v.slice(0, 10)) + v.slice(10);
  return v;
};
function SystemLine({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex
      gap={8}
      align="flex-start"
      style={{
        fontSize: 13,
        color: colors.textSecondary,
        lineHeight: 1.5,
      }}
    >
      <span
        style={{
          color: colors.textMuted,
          marginTop: 2,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          minWidth: 0,
        }}
      >
        {children}
      </span>
    </Flex>
  );
}
function TimelineRow({ item, t }: any) {
  let [open, setOpen] = React.useState<any>(false);
  let actor = staffById(item.actorId).name;
  let when = (
    <Text
      type={`secondary`}
      style={{
        fontSize: 12,
        whiteSpace: `nowrap`,
        marginInlineStart: 8,
      }}
    >
      {fmtWhen(item.at)}
    </Text>
  );
  switch (item.kind) {
    case `comment`: {
      let n = item.body.split(/(@[A-Za-z一-龥]+)/g);
      return (
        <Flex gap={10} align={`flex-start`}>
          <Avatar
            size={28}
            style={{
              background: colors.wood,
              flexShrink: 0,
            }}
          >
            {actor.slice(0, 1).toUpperCase()}
          </Avatar>
          <Flex
            vertical={true}
            gap={2}
            style={{
              flexGrow: 1,
              minWidth: 0,
              background: colors.bgHover,
              borderRadius: 6,
              padding: `8px 12px`,
            }}
          >
            <Flex justify={`space-between`} align={`baseline`}>
              <Text
                style={{
                  fontWeight: 500,
                }}
              >
                {actor}
              </Text>
              {when}
            </Flex>
            {item.deleted ? (
              <Text type={`secondary`} italic={true}>
                {t(`peek.timeline.deleted`)}
              </Text>
            ) : (
              <Text
                style={{
                  whiteSpace: `pre-wrap`,
                }}
              >
                {n.map((e: any, t: any) =>
                  e.startsWith(`@`) ? (
                    <Text
                      style={{
                        color: colors.primary,
                        fontWeight: 500,
                      }}
                      key={t}
                    >
                      {e}
                    </Text>
                  ) : (
                    e
                  ),
                )}
              </Text>
            )}
          </Flex>
        </Flex>
      );
    }
    case `fieldChange`:
      if (item.changes.length === 1) {
        let n = item.changes[0];
        return (
          <SystemLine icon={ICONS.fieldChange}>
            {t(`peek.timeline.fieldChange`, {
              actor,
              field: fieldLabel(t, n.field),
              from: fieldValue(t, n.field, n.from),
              to: fieldValue(t, n.field, n.to),
            })}
            {when}
          </SystemLine>
        );
      }
      return (
        <SystemLine icon={ICONS.fieldChange}>
          <Button
            type={`link`}
            size={`small`}
            style={{
              padding: 0,
              height: `auto`,
              fontSize: 13,
            }}
            onClick={() => setOpen((e: any) => !e)}
          >
            {t(`peek.timeline.fieldChangeGroup`, {
              actor,
              n: item.changes.length,
            })}
            {` `}
            <DownOutlined
              style={{
                fontSize: 10,
                transform: open ? `rotate(180deg)` : undefined,
              }}
            />
          </Button>
          {when}
          {open && (
            <ul
              style={{
                margin: `4px 0 0`,
                paddingInlineStart: 16,
              }}
            >
              {item.changes.map((e: any, n: any) => (
                <li key={n}>
                  {t(`peek.timeline.fieldChangeLine`, {
                    field: fieldLabel(t, e.field),
                    from: fieldValue(t, e.field, e.from),
                    to: fieldValue(t, e.field, e.to),
                  })}
                </li>
              ))}
            </ul>
          )}
        </SystemLine>
      );
    case `stockMove`: {
      let n =
        item.consequence === `readyToSchedule`
          ? t(`peek.timeline.consequence.readyToSchedule`, {
              inHk: item.inHk,
              total: item.total,
            })
          : item.consequence === `delivered`
            ? t(`peek.timeline.consequence.delivered`)
            : item.consequence === `partial`
              ? t(`peek.timeline.consequence.partial`, {
                  n: item.inHk,
                  total: item.total,
                })
              : item.consequence === `transit`
                ? t(`peek.timeline.consequence.transit`)
                : item.consequence === `shipped`
                  ? t(
                      item.moveType === `purchaseReceipt`
                        ? `peek.timeline.consequence.receivedCN`
                        : `peek.timeline.consequence.shipped`,
                    )
                  : item.moveType === `arrivalQc`
                    ? t(`peek.timeline.consequence.inHk`, {
                        inHk: item.inHk,
                        total: item.total,
                      })
                    : ``;
      return (
        <SystemLine icon={ICONS.stockMove}>
          {t(`peek.timeline.stockMove`, {
            actor,
            type: t(`peek.moveType.${item.moveType}`),
            move: item.moveId,
          })}
          {n && (
            <Text
              style={{
                fontSize: 13,
                color: colors.text,
              }}
            >
              {` · `}
              {n}
            </Text>
          )}
          {when}
        </SystemLine>
      );
    }
    case `activity`: {
      let n =
        item.feedback === `unreachable`
          ? t(`peek.timeline.activity.unreachable`, {
              actor,
              date: fmtDate(item.nextDue),
            })
          : item.feedback === `customerPostponed`
            ? t(`peek.timeline.activity.postponed`, {
                actor,
                date: fmtDate(item.nextDue),
              })
            : item.feedback === `scheduled`
              ? t(`peek.timeline.activity.scheduled`, {
                  actor,
                })
              : item.feedback === `followLater`
                ? t(`peek.timeline.activity.followLater`, {
                    actor,
                    date: fmtDate(item.nextDue),
                  })
                : t(`peek.timeline.activity.done`, {
                    actor,
                    kind: t(`followups.kind.${item.activityKind}`),
                  });
      return (
        <SystemLine icon={ICONS.activity}>
          {n}
          {item.note ? ` · ${item.note}` : null}
          {when}
        </SystemLine>
      );
    }
    case `approval`:
      return (
        <SystemLine icon={ICONS.approval}>
          {t(
            item.decision === `approved`
              ? `peek.timeline.approved`
              : `peek.timeline.rejected`,
            {
              actor,
              type: t(`peek.approval.${item.approvalType}`),
              detail: item.detail,
            },
          )}
          {when}
        </SystemLine>
      );
    case `attachment`:
      return (
        <SystemLine icon={ICONS.attachment}>
          {t(`peek.timeline.attachment`, {
            actor,
            file: item.fileName,
          })}
          {when}
        </SystemLine>
      );
    case `shopifySync`:
      return (
        <SystemLine icon={ICONS.shopifySync}>
          {item.field
            ? t(`peek.timeline.shopifyChange`, {
                field: fieldLabel(t, item.field),
                from: fieldValue(t, item.field, item.from ?? ``),
                to: fieldValue(t, item.field, item.to ?? ``),
              })
            : t(`peek.timeline.shopifyCreated`, {
                detail: item.detail,
              })}
          {when}
        </SystemLine>
      );
  }
}
