import dayjs from 'dayjs';
import type { StaffRole } from '../config/permissions';
import { can, canSee } from '../config/permissions';
import { today } from '../domain/clock';
import type { Activity, StockMoveType } from '../domain/types';
import type { AuditEntry, Comment, MoveConsequence, PeekModel } from './ops';
import { staffByName } from './staff';

/* =================================================================
 * 時間線（side-peek-spec §3）：AuditLog ∪ 移動事件 ∪ Activity ∪ Comment 嘅即時 union。
 * 冇另起歷史表；推導狀態只以「事件 → 後果」出現（後果喺事件發生時已寫入 payload）。
 *
 * 呢個檔案代表後端 `GET /api/timeline/:model/:id`：union、field-class 剝除、
 * 5 分鐘合併、分頁都喺呢層做，前端組件只 render。
 * ===============================================================*/

export type TimelineFilter =
  'all' | 'comments' | 'changes' | 'logistics' | 'activities';
export interface FieldChange {
  field: string;
  from: string;
  to: string;
}
export type TimelineItem =
  | {
      id: string;
      kind: 'comment';
      at: string;
      actorId: string;
      body: string;
      mentions: string[];
      deleted: boolean;
    }
  | {
      id: string;
      kind: 'fieldChange';
      at: string;
      actorId: string;
      changes: FieldChange[];
    }
  | {
      id: string;
      kind: 'stockMove';
      at: string;
      actorId: string;
      moveId: string;
      moveType: StockMoveType;
      inHk: number;
      total: number;
      consequence: MoveConsequence['consequence'];
    }
  | {
      id: string;
      kind: 'activity';
      at: string;
      actorId: string;
      activityKind: Activity['kind'];
      feedback: Activity['feedback'];
      dueDate: string;
      nextDue: string | null;
      done: boolean;
    }
  | {
      id: string;
      kind: 'approval';
      at: string;
      actorId: string;
      approvalType: string;
      decision: 'approved' | 'rejected';
      detail: string;
    }
  | {
      id: string;
      kind: 'attachment';
      at: string;
      actorId: string;
      fileName: string;
    }
  | {
      id: string;
      kind: 'shopifySync';
      at: string;
      actorId: string;
      detail: string;
      field?: string;
      from?: string;
      to?: string;
    };
export interface TimelineSource {
  audit: AuditEntry[];
  comments: Comment[];
  activities: Activity[];
  moveConsequences: MoveConsequence[];
  moveTypes: Map<string, StockMoveType>;
}
const MERGE_WINDOW_MS = 5 * 60_000;

/** 同一人 5 分鐘內連續欄位變更合併做一條（§3.2） */
export function mergeFieldChanges(items: TimelineItem[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (
      it.kind === 'fieldChange' &&
      prev?.kind === 'fieldChange' &&
      prev.actorId === it.actorId &&
      Math.abs(dayjs(prev.at).valueOf() - dayjs(it.at).valueOf()) <=
        MERGE_WINDOW_MS
    ) {
      // 列表係新→舊，所以合併後個「時間」用最新嗰條，變更順序照舊→新排
      out[out.length - 1] = {
        ...prev,
        changes: [...it.changes, ...prev.changes],
      };
      continue;
    }
    out.push(it);
  }
  return out;
}

/**
 * §4 權限：含 COST / FINANCE_DETAIL 嘅事件對冇權限嘅角色整條唔出現；
 * driver 只見物流事件同留言。
 */
export function visibleToRole(role: StaffRole, entry: AuditEntry): boolean {
  const cls =
    'fieldClass' in entry.payload ? entry.payload.fieldClass : undefined;
  if (cls && !canSee(role, cls)) return false;
  if (role === 'driver') return false;
  return true;
}
export function timelineFor(src: any, model: any, recordId: any, role: any) {
  let items: any[] = [];
  for (let a of src.audit) {
    if (a.model !== model || a.recordId !== recordId || !visibleToRole(role, a))
      continue;
    let e = a.payload;
    if (e.event === `fieldChange`) {
      items.push({
        id: a.id,
        kind: `fieldChange`,
        at: a.ts,
        actorId: a.userId,
        changes: [
          {
            field: e.field,
            from: e.from,
            to: e.to,
          },
        ],
      });
    } else {
      if (e.event === `approval`) {
        items.push({
          id: a.id,
          kind: `approval`,
          at: a.ts,
          actorId: a.userId,
          approvalType: e.approvalType,
          decision: e.decision,
          detail: e.detail,
        });
      } else {
        if (e.event === `attachment`) {
          items.push({
            id: a.id,
            kind: `attachment`,
            at: a.ts,
            actorId: a.userId,
            fileName: e.fileName,
          });
        } else {
          if (e.event === `shopifySync`) {
            items.push({
              id: a.id,
              kind: `shopifySync`,
              at: a.ts,
              actorId: a.userId,
              detail: e.detail,
              field: e.field,
              from: e.from,
              to: e.to,
            });
          }
        }
      }
    }
  }
  for (let r of src.comments)
    if (r.model === model && r.recordId === recordId) {
      items.push({
        id: r.id,
        kind: `comment`,
        at: r.createdAt,
        actorId: r.authorId,
        body: r.deletedAt ? `` : r.body,
        mentions: r.mentions,
        deleted: !!r.deletedAt,
      });
    }
  if (model === `order`) {
    for (let t of src.moveConsequences)
      if (t.orderNo === recordId) {
        items.push({
          id: `${t.moveId}:${recordId}`,
          kind: `stockMove`,
          at: t.ts,
          actorId: t.actorId,
          moveId: t.moveId,
          moveType: src.moveTypes.get(t.moveId) ?? `purchaseReceipt`,
          inHk: t.inHk,
          total: t.total,
          consequence: t.consequence,
        });
      }
    if (role !== `driver`) {
      let t = new Map<any, any>(src.activities.map((e: any) => [e.id, e]));
      for (let r of src.activities) {
        if (r.orderId !== recordId) continue;
        for (const [index, event] of (r.history || []).entries()) {
          items.push({
            id: r.id + `-history-` + index,
            kind: `activity`,
            at: event.at,
            actorId: staffByName(r.owner).id,
            activityKind: r.kind,
            feedback: event.feedback,
            dueDate: event.fromDueDate,
            nextDue: event.toDueDate,
            note: event.note,
            done: false,
          });
        }
        if (!r.doneAt) continue;
        let e = r.nextActivityId ? t.get(r.nextActivityId) : null;
        items.push({
          id: r.id,
          kind: `activity`,
          at: `${r.doneAt}T09:40:00+08:00`,
          actorId: staffByName(r.owner).id,
          activityKind: r.kind,
          feedback: r.feedback,
          dueDate: r.dueDate,
          nextDue: (e == null ? undefined : e.dueDate) ?? null,
          done: true,
        });
      }
    }
  }
  items.sort(
    (e: any, t: any) => t.at.localeCompare(e.at) || t.id.localeCompare(e.id),
  );
  return mergeFieldChanges(items);
}
export function filterTimeline(
  items: TimelineItem[],
  filter: TimelineFilter,
): TimelineItem[] {
  switch (filter) {
    case 'comments':
      return items.filter((i) => i.kind === 'comment');
    case 'changes':
      return items.filter(
        (i) =>
          i.kind === 'fieldChange' ||
          i.kind === 'shopifySync' ||
          i.kind === 'approval' ||
          i.kind === 'attachment',
      );
    case 'logistics':
      return items.filter((i) => i.kind === 'stockMove');
    case 'activities':
      return items.filter((i) => i.kind === 'activity');
    default:
      return items;
  }
}
export type DayLabel =
  | {
      kind: 'today';
    }
  | {
      kind: 'yesterday';
    }
  | {
      kind: 'date';
      date: string;
    };

/** 按日分組，最新喺最頂（§3.2） */
export function groupByDay(items: TimelineItem[]): {
  key: string;
  label: DayLabel;
  items: TimelineItem[];
}[] {
  const groups: {
    key: string;
    label: DayLabel;
    items: TimelineItem[];
  }[] = [];
  for (const it of items) {
    const key = it.at.slice(0, 10);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const d = dayjs(key);
      const label: DayLabel = d.isSame(today(), 'day')
        ? {
            kind: 'today',
          }
        : d.isSame(today().subtract(1, 'day'), 'day')
          ? {
              kind: 'yesterday',
            }
          : {
              kind: 'date',
              date: key,
            };
      g = {
        key,
        label,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

/** @ 名單：只列有該紀錄 view 權限嘅同事（§3.3） */
export const canViewModel = (role: StaffRole, model: PeekModel) =>
  can(
    role,
    model === 'order'
      ? 'orders'
      : model === 'purchaseOrder'
        ? 'purchasing'
        : model === 'package'
          ? 'warehouse'
          : 'products',
    'view',
  );
