import dayjs from 'dayjs';
import { can, canSee } from '../config/permissions';
import type { StaffRole } from '../config/permissions';
import { staffByName } from './staff';
import type { Activity, StockMoveType } from '../domain/types';
import { today } from '../domain/clock';
import type { AuditEntry, Comment, MoveConsequence, PeekModel } from './ops';

/* =================================================================
 * 時間線（side-peek-spec §3）：AuditLog ∪ 移動事件 ∪ Activity ∪ Comment 嘅即時 union。
 * 冇另起歷史表；推導狀態只以「事件 → 後果」出現（後果喺事件發生時已寫入 payload）。
 *
 * 呢個檔案代表後端 `GET /api/timeline/:model/:id`：union、field-class 剝除、
 * 5 分鐘合併、分頁都喺呢層做，前端組件只 render。
 * ===============================================================*/

export type TimelineFilter = 'all' | 'comments' | 'changes' | 'logistics' | 'activities';

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export type TimelineItem =
  | { id: string; kind: 'comment'; at: string; actorId: string; body: string; mentions: string[]; deleted: boolean }
  | { id: string; kind: 'fieldChange'; at: string; actorId: string; changes: FieldChange[] }
  | { id: string; kind: 'stockMove'; at: string; actorId: string; moveId: string; moveType: StockMoveType; inHk: number; total: number; consequence: MoveConsequence['consequence'] }
  | { id: string; kind: 'activity'; at: string; actorId: string; activityKind: Activity['kind']; feedback: Activity['feedback']; dueDate: string; nextDue: string | null; done: boolean }
  | { id: string; kind: 'approval'; at: string; actorId: string; approvalType: string; decision: 'approved' | 'rejected'; detail: string }
  | { id: string; kind: 'attachment'; at: string; actorId: string; fileName: string }
  | { id: string; kind: 'shopifySync'; at: string; actorId: string; detail: string; field?: string; from?: string; to?: string };

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
      Math.abs(dayjs(prev.at).valueOf() - dayjs(it.at).valueOf()) <= MERGE_WINDOW_MS
    ) {
      // 列表係新→舊，所以合併後個「時間」用最新嗰條，變更順序照舊→新排
      out[out.length - 1] = { ...prev, changes: [...it.changes, ...prev.changes] };
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
  const cls = 'fieldClass' in entry.payload ? entry.payload.fieldClass : undefined;
  if (cls && !canSee(role, cls)) return false;
  if (role === 'driver') return false;
  return true;
}

export function timelineFor(src: TimelineSource, model: PeekModel, recordId: string, role: StaffRole): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const e of src.audit) {
    if (e.model !== model || e.recordId !== recordId || !visibleToRole(role, e)) continue;
    const p = e.payload;
    if (p.event === 'fieldChange') items.push({ id: e.id, kind: 'fieldChange', at: e.ts, actorId: e.userId, changes: [{ field: p.field, from: p.from, to: p.to }] });
    else if (p.event === 'approval') items.push({ id: e.id, kind: 'approval', at: e.ts, actorId: e.userId, approvalType: p.approvalType, decision: p.decision, detail: p.detail });
    else if (p.event === 'attachment') items.push({ id: e.id, kind: 'attachment', at: e.ts, actorId: e.userId, fileName: p.fileName });
    else if (p.event === 'shopifySync') items.push({ id: e.id, kind: 'shopifySync', at: e.ts, actorId: e.userId, detail: p.detail, field: p.field, from: p.from, to: p.to });
  }

  for (const c of src.comments) {
    if (c.model !== model || c.recordId !== recordId) continue;
    items.push({ id: c.id, kind: 'comment', at: c.createdAt, actorId: c.authorId, body: c.deletedAt ? '' : c.body, mentions: c.mentions, deleted: !!c.deletedAt });
  }

  if (model === 'order') {
    for (const m of src.moveConsequences) {
      if (m.orderNo !== recordId) continue;
      items.push({ id: `${m.moveId}:${recordId}`, kind: 'stockMove', at: m.ts, actorId: m.actorId, moveId: m.moveId, moveType: src.moveTypes.get(m.moveId) ?? 'purchaseReceipt', inHk: m.inHk, total: m.total, consequence: m.consequence });
    }
    if (role !== 'driver') {
      const byId = new Map(src.activities.map((a) => [a.id, a]));
      for (const a of src.activities) {
        if (a.orderId !== recordId || !a.doneAt) continue;
        const next = a.nextActivityId ? byId.get(a.nextActivityId) : null;
        items.push({ id: a.id, kind: 'activity', at: `${a.doneAt}T09:40:00+08:00`, actorId: staffByName(a.owner).id, activityKind: a.kind, feedback: a.feedback, dueDate: a.dueDate, nextDue: next?.dueDate ?? null, done: true });
      }
    }
  }

  items.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return mergeFieldChanges(items);
}

export function filterTimeline(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  switch (filter) {
    case 'comments':
      return items.filter((i) => i.kind === 'comment');
    case 'changes':
      return items.filter((i) => i.kind === 'fieldChange' || i.kind === 'shopifySync' || i.kind === 'approval' || i.kind === 'attachment');
    case 'logistics':
      return items.filter((i) => i.kind === 'stockMove');
    case 'activities':
      return items.filter((i) => i.kind === 'activity');
    default:
      return items;
  }
}

export type DayLabel = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; date: string };

/** 按日分組，最新喺最頂（§3.2） */
export function groupByDay(items: TimelineItem[]): { key: string; label: DayLabel; items: TimelineItem[] }[] {
  const groups: { key: string; label: DayLabel; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const key = it.at.slice(0, 10);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const d = dayjs(key);
      const label: DayLabel = d.isSame(today(), 'day') ? { kind: 'today' } : d.isSame(today().subtract(1, 'day'), 'day') ? { kind: 'yesterday' } : { kind: 'date', date: key };
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

/** @ 名單：只列有該紀錄 view 權限嘅同事（§3.3） */
export const canViewModel = (role: StaffRole, model: PeekModel) =>
  can(role, model === 'order' ? 'orders' : model === 'purchaseOrder' ? 'purchasing' : model === 'package' ? 'warehouse' : 'products', 'view');
