import {
  ArrowLeftOutlined,
  CloseOutlined,
  DownOutlined,
  ExpandOutlined,
  LeftOutlined,
  MoreOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Flex,
  Input,
  Popover,
  Segmented,
  Select,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { useAuth as MoriUseAuth } from '../auth/hooks';
import { Pill } from '../components/Pill';
import { can } from '../config/permissions';
import {
  moriCompleteOtherTask,
  moriRescheduleActivity,
  moriUpdateActivity,
  moriWorkbenchRows,
  opsState,
  useOps,
} from '../data/ops';
import { today } from '../domain/clock';
import type { MessageKey, Translate } from '../i18n';
import { useT } from '../i18n';
import {
  moriScheduleWithUndo,
  ProgressCell,
  RowActions,
} from '../pages/MyFollowupsPage';
import { colors, useIsMobile } from '../theme';
import { fmtDate } from '../utils/date';
import { TONES } from '../utils/tones';
import type { PeekCtx, SummaryField } from './configs';
import { PEEK_CONFIGS } from './configs';
import { PEEK_MAX, PEEK_MIN, usePeek, usePeekWidth } from './hooks';
import { Timeline } from './Timeline';
const { Text, Title } = Typography;

/**
 * <RecordPeek /> — side-peek-spec §2 五層：Header / 待辦條 / 摘要 / 內容 tab / 時間線。
 * 一個組件，每個 model 一份 config（./configs）。掛喺 App 一次；邊個 model 由 usePeek() 決定。
 */
export function RecordPeek() {
  const {
    target,
    stack,
    back,
    close,
    next,
    prev,
    hasNext,
    hasPrev,
    onOpenFull,
  } = usePeek();
  const t = useT();
  const { message } = App.useApp();
  const { user } = useAuth();
  const ops = useOps();
  const isMobile = useIsMobile();
  const [width, setWidth] = usePeekWidth();
  const dragging = useRef<{
    startX: number;
    startW: number;
  } | null>(null);

  // 拖左邊改闊度（§1：440–720）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(dragging.current.startW + (dragging.current.startX - e.clientX));
    };
    const onUp = () => (dragging.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setWidth]);
  const role = user?.role ?? 'sales';
  const config = target
    ? PEEK_CONFIGS[target.model as keyof typeof PEEK_CONFIGS]
    : null;
  const record = target && config ? config.load(ops, target.id) : null;
  const ctx: PeekCtx = {
    t,
    role,
    user,
    ops,
    message,
  };
  const openFull = () => message.info(t('peek.fullPageNotBuilt'));
  useEffect(() => {
    onOpenFull.current = openFull;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);
  const open = !!target;
  const body =
    !config || !record ? (
      <Text type="secondary">{t('peek.notFound')}</Text>
    ) : (
      <PeekBody
        model={target!.model}
        record={record}
        config={config}
        ctx={ctx}
        onOpenFull={openFull}
      />
    );
  const header = config && record && (
    <Flex
      align="center"
      gap={8}
      style={{
        minWidth: 0,
      }}
    >
      {isMobile ? (
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={stack.length ? back : close}
          aria-label={t('peek.back')}
        />
      ) : stack.length > 0 ? (
        <Button type="text" size="small" icon={<LeftOutlined />} onClick={back}>
          {stack[stack.length - 1].title}
        </Button>
      ) : null}
      <span
        style={{
          flexGrow: 1,
        }}
      />
      {!isMobile && (
        <>
          <Tooltip title={t('peek.prevRow')}>
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={!hasPrev}
              onClick={prev}
              aria-label={t('peek.prevRow')}
            />
          </Tooltip>
          <Tooltip title={t('peek.nextRow')}>
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={!hasNext}
              onClick={next}
              aria-label={t('peek.nextRow')}
            />
          </Tooltip>
          <Tooltip title={t('peek.openFull')}>
            <Button
              type="text"
              size="small"
              icon={<ExpandOutlined />}
              onClick={openFull}
              aria-label={t('peek.openFull')}
            />
          </Tooltip>
          <Tooltip title={t('peek.close')}>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={close}
              aria-label={t('peek.close')}
            />
          </Tooltip>
        </>
      )}
    </Flex>
  );
  return (
    <Drawer
      open={open}
      onClose={close}
      placement="right"
      size={isMobile ? '100%' : width}
      mask={false}
      closable={false}
      destroyOnHidden
      title={header}
      styles={{
        header: {
          padding: '8px 12px',
          borderBottom: `1px solid ${colors.border}`,
        },
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        },
        wrapper: {
          boxShadow: '-4px 0 12px -4px rgba(26,26,26,0.2)',
        },
      }}
    >
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={PEEK_MIN}
          aria-valuemax={PEEK_MAX}
          aria-valuenow={width}
          onMouseDown={(e) => {
            dragging.current = {
              startX: e.clientX,
              startW: width,
            };
            e.preventDefault();
          }}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 2,
          }}
        />
      )}
      {body}
    </Drawer>
  );
}
function PeekBody({ model, record, config, ctx, onOpenFull }: any) {
  let { t: a } = ctx;
  let cfg = config;
  let status = cfg.status(record, ctx);
  let actions = cfg.actions(record, ctx);
  let menu = cfg.menu(record, ctx);
  let tabs = cfg.tabs(record, ctx);
  let open = cfg.activities(record, ctx).filter((e: any) => !e.doneAt);
  let f = useIsMobile();
  let [p, m] = React.useState<any>(`items`);
  let h = cfg.summary(record, ctx);
  let g = model === `order` ? h.filter((e: any) => e.key !== `note`) : h;
  let _ = actions.find((e: any) => e.primary);
  let v = actions.filter((e: any) => !e.primary).slice(0, 3);
  let b = null;
  if (model === `order`) {
    let n = status.labelKey.split(`.`).pop();
    let i = record.lines.reduce((e: any, t: any) => e + t.qty, 0);
    let o = can(ctx.role, `purchasing`, `view`);
    let c = can(ctx.role, `warehouse`, `view`);
    if (n === `notProcured`) {
      b = {
        tone: `warning`,
        title: a(`peek.next.notProcured.title`, {
          n: i,
        }),
        desc: a(
          o ? `peek.next.notProcured.desc` : `peek.next.notProcured.waiting`,
        ),
        primary: o
          ? {
              label: a(`peek.next.action.purchase`),
              onClick: () => {
                var e;
                if (!((e = window.__MORI_NAVIGATE__) == null)) {
                  e.call(window, `purchasing`);
                }
              },
            }
          : null,
        secondary: {
          label: a(`peek.next.action.items`),
          onClick: () => m(`items`),
        },
      };
    } else {
      if (n === `preparing`) {
        b = {
          tone: `brand`,
          title: a(`peek.next.preparing.title`),
          desc: a(`peek.next.preparing.desc`),
          primary: c
            ? {
                label: a(`peek.next.action.waiting`),
                onClick: () => {
                  var e;
                  if (!((e = window.__MORI_NAVIGATE__) == null)) {
                    e.call(window, `waiting`);
                  }
                },
              }
            : null,
          secondary: {
            label: a(`peek.next.action.items`),
            onClick: () => m(`items`),
          },
        };
      } else {
        if (n === `toSchedule`) {
          b = {
            tone: `warning`,
            title: a(`peek.next.toSchedule.title`),
            desc: a(`peek.next.toSchedule.desc`),
            primary: _,
            secondary: {
              label: a(`peek.next.action.delivery`),
              onClick: () => m(`delivery`),
            },
          };
        } else {
          if (n === `scheduled`) {
            b = {
              tone: `brand`,
              title: a(`peek.next.scheduled.title`),
              desc: a(`peek.next.scheduled.desc`),
              primary: {
                label: a(`peek.next.action.delivery`),
                onClick: () => m(`delivery`),
              },
            };
          } else {
            if (n === `partiallyDelivered`) {
              b = {
                tone: `muted`,
                title: a(`peek.next.partiallyDelivered.title`),
                desc: a(`peek.next.partiallyDelivered.desc`),
                primary: {
                  label: a(`peek.next.action.delivery`),
                  onClick: () => m(`delivery`),
                },
              };
            } else {
              if (n === `completed`) {
                b = {
                  tone: `success`,
                  title: a(`peek.next.completed.title`),
                  desc: a(`peek.next.completed.desc`),
                  secondary: {
                    label: a(`peek.next.action.items`),
                    onClick: () => m(`items`),
                  },
                };
              }
            }
          }
        }
      }
    }
  }
  let x = (e: any) =>
    e && e.content ? (
      <Popover trigger={`click`} placement={`bottomLeft`} content={e.content}>
        <Button type={`primary`} icon={e.icon}>
          {e.label}
        </Button>
      </Popover>
    ) : (
      <Button
        type={`primary`}
        icon={e == null ? undefined : e.icon}
        onClick={e == null ? undefined : e.onClick}
      >
        {e == null ? undefined : e.label}
      </Button>
    );
  let S = b ? (TONES[b.tone as keyof typeof TONES] ?? TONES.brand) : null;
  return (
    <Flex
      vertical={true}
      style={{
        height: `100%`,
        minHeight: 0,
      }}
    >
      <Flex
        vertical={true}
        gap={10}
        style={{
          padding: `12px 16px`,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <Flex align={`center`} gap={10} wrap={true}>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 20,
            }}
          >
            {cfg.title(record)}
          </Title>
          <Pill tone={status.tone} dot={true}>
            {a(status.labelKey)}
          </Pill>
        </Flex>
        <Flex gap={8} wrap={true} align={`center`}>
          {v.map((e: any) =>
            e.content ? (
              <Popover
                trigger={`click`}
                placement={`bottomLeft`}
                content={e.content}
                key={e.key}
              >
                <Button type={`default`} icon={e.icon}>
                  {e.label}
                </Button>
              </Popover>
            ) : (
              <Button
                type={`default`}
                icon={e.icon}
                onClick={e.onClick}
                key={e.key}
              >
                {e.label}
              </Button>
            ),
          )}
          {menu.length > 0 && (
            <Dropdown
              trigger={[`click`]}
              menu={{
                items: menu.map((e: any) => ({
                  key: e.key,
                  label: e.label,
                  onClick: e.onClick,
                })),
              }}
            >
              <Button icon={<MoreOutlined />} aria-label={a(`peek.more`)} />
            </Dropdown>
          )}
          {
            <span
              style={{
                flexGrow: 1,
              }}
            />
          }
          <Button
            type={`text`}
            size={`small`}
            icon={<ExpandOutlined />}
            onClick={onOpenFull}
          >
            {a(`peek.openFull`)}
          </Button>
        </Flex>
      </Flex>
      {open.length > 0 && (
        <Flex
          vertical={true}
          gap={6}
          style={{
            padding: `10px 16px`,
            background: colors.warningBg,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {open.map((e: any) => (
            <ActivityBar activity={e} t={a} key={e.id} />
          ))}
        </Flex>
      )}
      {
        <div
          style={{
            overflow: `auto`,
            flexGrow: 1,
            minHeight: 0,
          }}
        >
          {b && (
            <div
              style={{
                padding: `12px 16px 0`,
              }}
            >
              <div
                style={{
                  padding: f ? `14px` : `14px 16px`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  background: S == null ? undefined : S.bg,
                }}
              >
                <Flex
                  vertical={f}
                  align={f ? `stretch` : `center`}
                  justify={`space-between`}
                  gap={12}
                >
                  <Flex
                    vertical={true}
                    gap={3}
                    style={{
                      minWidth: 0,
                      flexGrow: 1,
                    }}
                  >
                    <Text
                      type={`secondary`}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {a(`peek.next.label`)}
                    </Text>
                    <Text
                      style={{
                        fontWeight: 600,
                        fontSize: 16,
                        color: colors.text,
                      }}
                    >
                      {b.title}
                    </Text>
                    <Text
                      type={`secondary`}
                      style={{
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {b.desc}
                    </Text>
                  </Flex>
                  <Flex
                    gap={8}
                    wrap={true}
                    style={{
                      flexShrink: 0,
                    }}
                  >
                    {b.primary &&
                      (b.primary.content ? (
                        x(b.primary)
                      ) : (
                        <Button
                          type={`primary`}
                          icon={b.primary.icon}
                          onClick={b.primary.onClick}
                        >
                          {b.primary.label}
                        </Button>
                      ))}
                    {b.secondary && (
                      <Button onClick={b.secondary.onClick}>
                        {b.secondary.label}
                      </Button>
                    )}
                  </Flex>
                </Flex>
              </div>
            </div>
          )}
          <div
            style={{
              padding: b ? (f ? `20px 16px 0` : `24px 16px 0`) : `12px 16px 0`,
            }}
          >
            <Card
              size={`small`}
              title={model === `order` ? a(`peek.section.summary`) : undefined}
              styles={{
                body: {
                  padding: `12px 14px`,
                },
                header: {
                  minHeight: model === `order` ? 38 : undefined,
                  paddingInline: 14,
                },
              }}
            >
              {
                <div
                  style={{
                    display: `grid`,
                    gridTemplateColumns: `repeat(2, minmax(0, 1fr))`,
                    gap: `10px 16px`,
                  }}
                >
                  {g.map((e: any) => (
                    <SummaryCell field={e} key={e.key} />
                  ))}
                </div>
              }
            </Card>
          </div>
          <div
            style={{
              paddingTop: f ? 20 : 24,
            }}
          >
            <Tabs
              size={`small`}
              activeKey={p}
              onChange={m}
              items={tabs.map((e: any) => ({
                key: e.key,
                label: e.label,
                children: (
                  <div
                    style={{
                      padding: `0 16px 12px`,
                    }}
                  >
                    {e.content}
                  </div>
                ),
              }))}
              tabBarStyle={{
                padding: `0 16px`,
                margin: 0,
              }}
            />
          </div>
          <Divider
            style={{
              margin: 0,
            }}
          />
          <div
            style={{
              padding: f ? `20px 16px 20px` : `24px 16px 24px`,
            }}
          >
            <Text
              style={{
                display: `block`,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              {a(`peek.section.activity`)}
            </Text>
            <Timeline model={model} recordId={cfg.recordId(record)} />
          </div>
        </div>
      }
    </Flex>
  );
}
function SummaryCell({ field }: { field: SummaryField }) {
  const [editing, setEditing] = useState(false);
  const e = field.editable;
  const value = (
    <Text
      style={{
        fontWeight: 500,
        wordBreak: 'break-word',
      }}
    >
      {field.value}
    </Text>
  );
  return (
    <Flex
      vertical
      gap={2}
      style={{
        minWidth: 0,
      }}
    >
      <Text
        type="secondary"
        style={{
          fontSize: 12,
        }}
      >
        {field.label}
      </Text>
      {!e ? (
        value
      ) : editing ? (
        e.type === 'date' ? (
          <DatePicker
            autoFocus
            size="small"
            open
            value={e.value ? dayjs(e.value) : null}
            onChange={(d) => {
              e.onChange(d ? d.format('YYYY-MM-DD') : '');
              setEditing(false);
            }}
            onOpenChange={(o) => !o && setEditing(false)}
          />
        ) : e.type === 'select' ? (
          <Select
            autoFocus
            size="small"
            open
            value={e.value}
            options={e.options}
            onChange={(v) => {
              e.onChange(v);
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <Input
            autoFocus
            size="small"
            defaultValue={e.value}
            onPressEnter={(ev) => {
              e.onChange((ev.target as HTMLInputElement).value);
              setEditing(false);
            }}
            onBlur={(ev) => {
              e.onChange(ev.target.value);
              setEditing(false);
            }}
          />
        )
      ) : (
        <Text
          style={{
            fontWeight: 500,
            cursor: 'text',
            borderBottom: `1px dashed ${colors.borderStrong}`,
            wordBreak: 'break-word',
          }}
          onClick={() => setEditing(true)}
          title={field.editHint}
        >
          {field.value}
        </Text>
      )}
    </Flex>
  );
}

/** 待辦條一行：完成 / 打唔通（自動排明日）/ 改期（原地揀日期） */

function ActivityBar({ activity, t }: any) {
  const isMobile = useIsMobile();
  const { message } = App.useApp();
  const { close } = usePeek();
  const { user } = MoriUseAuth();
  const row = moriWorkbenchRows(opsState).find(
    (r: any) => r.activity.id === activity.id,
  );
  if (!row) return null;
  return (
    <Flex vertical={true} gap={8}>
      <Flex gap={8} wrap={true}>
        <Text strong={true}>{t(`followups.kind.${activity.kind}`)}</Text>
        <ProgressCell row={row} t={t} />
        <Text>{fmtDate(activity.dueDate)}</Text>
      </Flex>
      <RowActions
        row={row}
        t={t}
        isMobile={isMobile}
        onSchedule={(r: any, d: any, s: any) =>
          moriScheduleWithUndo(r, d, s, user?.id || `u-system`, message, t)
        }
        onUnreachable={(r: any) =>
          moriRescheduleActivity(
            r.activity.id,
            today().add(1, `day`).format(`YYYY-MM-DD`),
            ``,
            `unreachable`,
          )
        }
        onPostpone={(r: any, d: any, n: any) =>
          moriRescheduleActivity(
            r.activity.id,
            d.format(`YYYY-MM-DD`),
            n,
            [`scheduleDelivery`, `chasePayment`].includes(r.activity.kind)
              ? `customerPostponed`
              : `followLater`,
          )
        }
        onComplete={(r: any) => {
          if (r.activity.kind === `other`) {
            const previous = moriCompleteOtherTask(r.activity.id);
            if (previous) {
              message.success({
                content: (
                  <Flex>
                    {t(`followups.action.complete`)}
                    <Button
                      type={`link`}
                      onClick={() => {
                        moriUpdateActivity(previous.id, previous);
                        message.destroy();
                      }}
                    >
                      {t(`followups.action.undo`)}
                    </Button>
                  </Flex>
                ),
                duration: 8,
              });
            }
          } else if (r.activity.kind === `chasePayment`) {
            message.info(t(`followups.payment.reviewHint`));
          } else {
            close();
            window.__MORI_NAVIGATE__?.(
              r.activity.source === `allocation`
                ? `inventory`
                : [`chaseSupplier`, `procurementException`].includes(
                      r.activity.kind,
                    )
                  ? `purchasing`
                  : `waiting`,
            );
          }
        }}
      />
    </Flex>
  );
} /** 「已約」原地揀日期時段（唔跳頁） */
export function SchedulePopoverContent({
  onSubmit,
  t,
}: {
  onSubmit: (
    date: string,
    slot: 'morning' | 'afternoon' | 'evening' | 'flexible',
  ) => void;
  t: Translate;
}) {
  const [date, setDate] = useState<Dayjs | null>(today().add(2, 'day'));
  const [slot, setSlot] = useState<
    'morning' | 'afternoon' | 'evening' | 'flexible'
  >('afternoon');
  return (
    <Flex
      vertical
      gap={8}
      style={{
        width: 280,
      }}
    >
      <DatePicker value={date} onChange={setDate} minDate={today()} />
      <Segmented
        value={slot}
        onChange={(v) => setSlot(v as typeof slot)}
        options={(['morning', 'afternoon', 'evening', 'flexible'] as const).map(
          (s) => ({
            value: s,
            label: t(`followups.slot.${s}` as MessageKey),
          }),
        )}
      />
      <Button
        type="primary"
        disabled={!date}
        onClick={() => date && onSubmit(date.format('YYYY-MM-DD'), slot)}
      >
        {t('followups.action.schedule')}
      </Button>
    </Flex>
  );
}
