import { useSyncExternalStore } from 'react';
import dayjs from 'dayjs';
import { DEMO_TODAY } from '../domain/clock';
import { can } from '../config/permissions';
import type { StaffUser } from '../auth/types';
import { canApprove, logApproval, needsApproval, nowIso } from './admin';
import { getOps } from './ops';
import type { SalesOrder } from './ops';

/**
 * 人事（員工／排班／請假／薪資／佣金）mock store。
 *
 * Spec v0.2 §1 將 HR 凍結喺 Phase 1；Dickson 2026-09-24 決定唔分 phase 一齊起。
 * 冇 spec 章節可引，以下全部係 ASSUMPTION（backlog A-06…A-09），接後台前要 Ocean 拍板：
 *   - 請假由 ApprovalRule('leave') 決定邊個批（seed：Jenny）；批准後排班格自動變「請假」
 *   - 假期日數唔計星期日（門市六天制）
 *   - 佣金係推導：當月「已完成」訂單（completedDate 落喺該月）× 該同事佣金率，唔存 DB
 *   - 薪資月結由 finance 起草，ApprovalRule('payroll') 審批人確認先鎖
 *   - 薪金／佣金率／假期餘額屬 FIELD_CLASS HR；自己嗰行永遠見到（SCOPE hr.self）
 */

/* ------------------------------------------------------------- types */

export type Department = 'management' | 'operations' | 'finance' | 'sales' | 'logistics' | 'content' | 'it';
export const DEPARTMENTS: Department[] = ['management', 'operations', 'finance', 'sales', 'logistics', 'content', 'it'];

export interface Employee {
  id: string;
  userId: string;
  name: string;
  dept: Department;
  employmentType: 'fullTime' | 'partTime';
  joinedAt: string;
  /** 年假配額（日） */
  annualQuota: number;
  /** HR class */
  baseSalary: number;
  /** HR class；只有銷售有 */
  commissionRate: number | null;
  /** HR class；固定津貼（交通等） */
  allowance: number;
}

export type ShiftSlot = 'full' | 'am' | 'pm' | 'off' | 'leave';
export type ShiftPlace = 'shop' | 'office' | 'warehouse' | 'delivery';
export const SHIFT_SLOTS: ShiftSlot[] = ['full', 'am', 'pm', 'off', 'leave'];
export const SHIFT_PLACES: ShiftPlace[] = ['shop', 'office', 'warehouse', 'delivery'];

export interface Shift {
  employeeId: string;
  date: string;
  slot: ShiftSlot;
  place: ShiftPlace | null;
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'compensatory';
export const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'compensatory', 'unpaid'];
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
}

export interface PayrollLine {
  employeeId: string;
  base: number;
  commission: number;
  allowance: number;
  mpfEmployee: number;
  mpfEmployer: number;
  net: number;
}

export interface PayrollRun {
  /** YYYY-MM */
  month: string;
  status: 'draft' | 'confirmed';
  preparedBy: string;
  preparedAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  lines: PayrollLine[];
}

interface HrState {
  employees: Employee[];
  shifts: Shift[];
  leaves: LeaveRequest[];
  payroll: PayrollRun[];
  seq: number;
}

export type HrError = 'forbidden' | 'notFound' | 'notApprover' | 'alreadyDecided' | 'overlap';
export type HrResult<T = void> = { ok: true; value: T } | { ok: false; error: HrError };

/* --------------------------------------------------------- pure helpers */

const MPF_RATE = 0.05;
const MPF_CAP = 1500;

/** 假期日數：from..to 唔計星期日（ASSUMPTION：門市六天制） */
export function leaveDays(from: string, to: string): number {
  let d = dayjs(from);
  const end = dayjs(to);
  let n = 0;
  while (!d.isAfter(end, 'day')) {
    if (d.day() !== 0) n += 1;
    d = d.add(1, 'day');
  }
  return n;
}

const orderAmount = (o: SalesOrder) => o.lines.reduce((s, l) => s + l.qty * l.price, 0);

export interface CommissionRow {
  employeeId: string;
  month: string;
  orders: number;
  salesAmount: number;
  rate: number;
  commission: number;
}

/** 佣金推導：當月已完成（completedDate）嘅訂單，按負責同事計 */
export function commissionFor(month: string, employees: Employee[], orders: SalesOrder[] = getOps().orders): CommissionRow[] {
  return employees
    .filter((e) => e.commissionRate !== null)
    .map((e) => {
      const mine = orders.filter((o) => o.assignee === e.name && o.delivery.completedDate?.slice(0, 7) === month);
      const salesAmount = mine.reduce((s, o) => s + orderAmount(o), 0);
      const rate = e.commissionRate ?? 0;
      return { employeeId: e.id, month, orders: mine.length, salesAmount, rate, commission: Math.round(salesAmount * rate) };
    });
}

export function payrollLine(e: Employee, commission: number): PayrollLine {
  const relevant = e.baseSalary;
  const mpfEmployee = e.employmentType === 'partTime' ? 0 : Math.min(Math.round(relevant * MPF_RATE), MPF_CAP);
  return {
    employeeId: e.id,
    base: e.baseSalary,
    commission,
    allowance: e.allowance,
    mpfEmployee,
    mpfEmployer: mpfEmployee,
    net: e.baseSalary + commission + e.allowance - mpfEmployee,
  };
}

/** 年假餘額：配額 − 今年已批年假 */
export function annualLeaveBalance(e: Employee, leaves: LeaveRequest[], year = DEMO_TODAY.slice(0, 4)): number {
  const used = leaves
    .filter((l) => l.employeeId === e.id && l.type === 'annual' && l.status === 'approved' && l.from.startsWith(year))
    .reduce((s, l) => s + l.days, 0);
  return e.annualQuota - used;
}

/** 由今日起計嘅一星期（星期一開始） */
export const weekStart = (date: string) => {
  const d = dayjs(date);
  return d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD');
};
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => dayjs(start).add(i, 'day').format('YYYY-MM-DD'));

/* ------------------------------------------------------------ fixtures */

// Pay figures are round demo numbers, not anyone's real salary.
const EMPLOYEES: Employee[] = [
  { id: 'E01', userId: 'u-ocean', name: 'Ocean', dept: 'management', employmentType: 'fullTime', joinedAt: '2016-03-01', annualQuota: 14, baseSalary: 45000, commissionRate: null, allowance: 0 },
  { id: 'E02', userId: 'u-jenny', name: 'Jenny', dept: 'management', employmentType: 'fullTime', joinedAt: '2016-03-01', annualQuota: 14, baseSalary: 45000, commissionRate: null, allowance: 0 },
  { id: 'E03', userId: 'u-alex', name: 'Alex', dept: 'operations', employmentType: 'fullTime', joinedAt: '2019-06-17', annualQuota: 12, baseSalary: 26000, commissionRate: null, allowance: 800 },
  { id: 'E04', userId: 'u-manman', name: '雯雯', dept: 'finance', employmentType: 'fullTime', joinedAt: '2021-02-01', annualQuota: 10, baseSalary: 22000, commissionRate: null, allowance: 0 },
  { id: 'E05', userId: 'u-wilson', name: 'Wilson', dept: 'sales', employmentType: 'fullTime', joinedAt: '2020-09-14', annualQuota: 10, baseSalary: 16000, commissionRate: 0.02, allowance: 0 },
  { id: 'E06', userId: 'u-steve', name: 'Steve', dept: 'sales', employmentType: 'fullTime', joinedAt: '2026-09-02', annualQuota: 7, baseSalary: 15000, commissionRate: 0.02, allowance: 0 },
  { id: 'E07', userId: 'u-hang', name: '阿桁', dept: 'logistics', employmentType: 'fullTime', joinedAt: '2018-11-05', annualQuota: 12, baseSalary: 21000, commissionRate: null, allowance: 1500 },
  { id: 'E08', userId: 'u-yumi', name: 'Yumi', dept: 'content', employmentType: 'fullTime', joinedAt: '2023-04-03', annualQuota: 10, baseSalary: 19000, commissionRate: null, allowance: 0 },
  { id: 'E09', userId: 'u-kengi', name: 'Kengi', dept: 'it', employmentType: 'partTime', joinedAt: '2024-01-08', annualQuota: 0, baseSalary: 9000, commissionRate: null, allowance: 0 },
];

/** 每人每星期嘅基本模式：星期一=1 … 星期日=0 */
const PATTERN: Record<string, { off: number[]; place: ShiftPlace; half?: Record<number, 'am' | 'pm'> }> = {
  E01: { off: [0], place: 'shop' },
  E02: { off: [0, 6], place: 'office' },
  E03: { off: [0, 3], place: 'warehouse' },
  E04: { off: [0, 6], place: 'office' },
  E05: { off: [2], place: 'shop' },
  E06: { off: [4], place: 'shop' },
  E07: { off: [0], place: 'delivery' },
  E08: { off: [0, 6], place: 'office', half: { 5: 'am' } },
  E09: { off: [0, 1, 3, 5, 6], place: 'office', half: { 2: 'pm', 4: 'pm' } },
};

const daysAgo = (n: number) => dayjs(DEMO_TODAY).subtract(n, 'day').format('YYYY-MM-DD');
const daysAhead = (n: number) => dayjs(DEMO_TODAY).add(n, 'day').format('YYYY-MM-DD');
const at = (day: string, hm: string) => `${day}T${hm}:00+08:00`;

function buildShifts(leaves: LeaveRequest[]): Shift[] {
  const start = dayjs(weekStart(DEMO_TODAY)).subtract(7, 'day');
  const shifts: Shift[] = [];
  for (let i = 0; i < 21; i += 1) {
    const d = start.add(i, 'day');
    const date = d.format('YYYY-MM-DD');
    for (const e of EMPLOYEES) {
      const p = PATTERN[e.id];
      const onLeave = leaves.some((l) => l.employeeId === e.id && l.status === 'approved' && date >= l.from && date <= l.to);
      if (onLeave) shifts.push({ employeeId: e.id, date, slot: 'leave', place: null });
      else if (p.off.includes(d.day())) shifts.push({ employeeId: e.id, date, slot: 'off', place: null });
      else shifts.push({ employeeId: e.id, date, slot: p.half?.[d.day()] ?? 'full', place: p.place });
    }
  }
  return shifts;
}

function buildFixtures(): HrState {
  const lv = (id: string, employeeId: string, type: LeaveType, from: string, to: string, reason: string, status: LeaveStatus, createdAt: string, decidedBy: string | null = null, decidedAt: string | null = null, decisionNote = ''): LeaveRequest =>
    ({ id, employeeId, type, from, to, days: leaveDays(from, to), reason, status, createdAt, decidedBy, decidedAt, decisionNote });

  const leaves: LeaveRequest[] = [
    lv('LV-01', 'E05', 'annual', daysAhead(6), daysAhead(7), '家庭旅行', 'pending', at(daysAgo(1), '18:10')),
    lv('LV-02', 'E07', 'sick', daysAgo(7), daysAgo(7), '發燒，有醫生紙', 'approved', at(daysAgo(7), '07:30'), 'u-jenny', at(daysAgo(7), '08:05')),
    lv('LV-03', 'E06', 'annual', daysAhead(9), daysAhead(10), '', 'approved', at(daysAgo(3), '12:00'), 'u-jenny', at(daysAgo(2), '10:15')),
    lv('LV-04', 'E03', 'annual', daysAhead(2), daysAhead(2), '睇醫生', 'pending', at(daysAgo(0), '08:50')),
    lv('LV-05', 'E08', 'compensatory', daysAgo(3), daysAgo(3), '上星期六加班', 'approved', at(daysAgo(5), '16:40'), 'u-jenny', at(daysAgo(5), '17:00')),
    lv('LV-06', 'E04', 'annual', '2026-08-10', '2026-08-14', '回鄉', 'approved', at('2026-07-20', '10:00'), 'u-jenny', at('2026-07-20', '11:30')),
    lv('LV-07', 'E05', 'unpaid', '2026-08-03', '2026-08-03', '', 'rejected', at('2026-07-30', '19:20'), 'u-jenny', at('2026-07-31', '09:00'), '當日門市只有一人'),
    lv('LV-08', 'E02', 'annual', daysAhead(16), daysAhead(20), '', 'pending', at(daysAgo(1), '15:00')),
    lv('LV-09', 'E01', 'annual', '2026-08-24', '2026-08-25', '', 'approved', at('2026-08-10', '09:00'), 'u-jenny', at('2026-08-10', '09:20')),
    lv('LV-10', 'E07', 'annual', daysAhead(13), daysAhead(13), '', 'cancelled', at(daysAgo(4), '20:00')),
  ];

  const orders = getOps().orders;
  const run = (month: string, status: PayrollRun['status'], preparedAt: string, confirmedAt: string | null): PayrollRun => {
    const comm = new Map(commissionFor(month, EMPLOYEES, orders).map((c) => [c.employeeId, c.commission]));
    return {
      month,
      status,
      preparedBy: 'u-manman',
      preparedAt,
      confirmedBy: confirmedAt ? 'u-jenny' : null,
      confirmedAt,
      lines: EMPLOYEES.map((e) => payrollLine(e, comm.get(e.id) ?? 0)),
    };
  };
  const payroll: PayrollRun[] = [
    run('2026-07', 'confirmed', at('2026-07-28', '15:00'), at('2026-07-29', '10:10')),
    run('2026-08', 'confirmed', at('2026-08-27', '16:20'), at('2026-08-28', '09:45')),
    run('2026-09', 'draft', at(daysAgo(1), '17:30'), null),
  ];

  return { employees: EMPLOYEES.map((e) => ({ ...e })), shifts: buildShifts(leaves), leaves, payroll, seq: 11 };
}

/* --------------------------------------------------------------- store */

let state: HrState = buildFixtures();
const listeners = new Set<() => void>();

function commit(next: HrState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useHr(): HrState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

export const getHr = () => state;
export function _resetHr() {
  commit(buildFixtures());
}

export const employeeOfUser = (userId: string, s: HrState = state) => s.employees.find((e) => e.userId === userId) ?? null;
export const employeeById = (id: string, s: HrState = state) => s.employees.find((e) => e.id === id) ?? null;

/** SCOPE hr.self：有 hr.edit 或 payroll.view 就全公司，否則只係自己 */
export const seesAllStaff = (role: StaffUser['role']) => can(role, 'hr', 'edit') || can(role, 'payroll', 'view');

/* ------------------------------------------------------------- actions */

export function setShift(employeeId: string, date: string, slot: ShiftSlot, place: ShiftPlace | null, actor: StaffUser): HrResult {
  if (!can(actor.role, 'hr', 'edit')) return { ok: false, error: 'forbidden' };
  const next: Shift = { employeeId, date, slot, place: slot === 'off' || slot === 'leave' ? null : place };
  const others = state.shifts.filter((s) => !(s.employeeId === employeeId && s.date === date));
  commit({ ...state, shifts: [...others, next] });
  return { ok: true, value: undefined };
}

export function requestLeave(input: { employeeId: string; type: LeaveType; from: string; to: string; reason: string }, actor: StaffUser): HrResult<LeaveRequest> {
  const emp = employeeById(input.employeeId);
  if (!emp) return { ok: false, error: 'notFound' };
  if (emp.userId !== actor.id && !can(actor.role, 'hr', 'edit')) return { ok: false, error: 'forbidden' };
  const overlap = state.leaves.some((l) => l.employeeId === input.employeeId && l.status !== 'rejected' && l.status !== 'cancelled' && input.from <= l.to && input.to >= l.from);
  if (overlap) return { ok: false, error: 'overlap' };
  const req: LeaveRequest = {
    id: `LV-${String(state.seq).padStart(2, '0')}`,
    employeeId: input.employeeId,
    type: input.type,
    from: input.from,
    to: input.to,
    days: leaveDays(input.from, input.to),
    reason: input.reason.trim(),
    // 冇規則（或規則停用）就即批 —— 規則決定要唔要人批（§9.6）
    status: needsApproval('leave') ? 'pending' : 'approved',
    createdAt: nowIso(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
  };
  let shifts = state.shifts;
  if (req.status === 'approved') shifts = markLeave(shifts, req);
  commit({ ...state, leaves: [...state.leaves, req], shifts, seq: state.seq + 1 });
  return { ok: true, value: req };
}

/** 批准後排班格變「請假」；超出已生成星期嘅日子就補一格 */
function markLeave(shifts: Shift[], req: LeaveRequest): Shift[] {
  const next = shifts.map((s) => (s.employeeId === req.employeeId && s.date >= req.from && s.date <= req.to && s.slot !== 'off' ? { ...s, slot: 'leave' as const, place: null } : s));
  let d = dayjs(req.from);
  while (!d.isAfter(dayjs(req.to), 'day')) {
    const date = d.format('YYYY-MM-DD');
    if (d.day() !== 0 && !next.some((s) => s.employeeId === req.employeeId && s.date === date)) next.push({ employeeId: req.employeeId, date, slot: 'leave', place: null });
    d = d.add(1, 'day');
  }
  return next;
}

export function decideLeave(id: string, decision: 'approved' | 'rejected', actor: StaffUser, note = ''): HrResult {
  const req = state.leaves.find((l) => l.id === id);
  if (!req) return { ok: false, error: 'notFound' };
  if (req.status !== 'pending') return { ok: false, error: 'alreadyDecided' };
  const requester = employeeById(req.employeeId)?.userId ?? '';
  if (!canApprove('leave', actor, requester)) return { ok: false, error: 'notApprover' };
  const decided = { ...req, status: decision, decidedBy: actor.id, decidedAt: nowIso(), decisionNote: note.trim() };
  commit({
    ...state,
    leaves: state.leaves.map((l) => (l.id === id ? decided : l)),
    shifts: decision === 'approved' ? markLeave(state.shifts, decided) : state.shifts,
  });
  logApproval(actor.id, 'leaveRequest', id, 'pending', decision, note.trim() || null);
  return { ok: true, value: undefined };
}

export function cancelLeave(id: string, actor: StaffUser): HrResult {
  const req = state.leaves.find((l) => l.id === id);
  if (!req) return { ok: false, error: 'notFound' };
  const emp = employeeById(req.employeeId);
  if (emp?.userId !== actor.id && !can(actor.role, 'hr', 'edit')) return { ok: false, error: 'forbidden' };
  if (req.status !== 'pending') return { ok: false, error: 'alreadyDecided' };
  commit({ ...state, leaves: state.leaves.map((l) => (l.id === id ? { ...l, status: 'cancelled' } : l)) });
  return { ok: true, value: undefined };
}

/** 薪資月結：draft 重算（佣金係推導，每次重算）；confirm 要 ApprovalRule('payroll') 嘅審批人 */
export function refreshPayrollDraft(month: string, actor: StaffUser): HrResult {
  if (!can(actor.role, 'payroll', 'edit')) return { ok: false, error: 'forbidden' };
  const comm = new Map(commissionFor(month, state.employees).map((c) => [c.employeeId, c.commission]));
  const lines = state.employees.map((e) => payrollLine(e, comm.get(e.id) ?? 0));
  const existing = state.payroll.find((p) => p.month === month);
  if (existing && existing.status === 'confirmed') return { ok: false, error: 'alreadyDecided' };
  const run: PayrollRun = { month, status: 'draft', preparedBy: actor.id, preparedAt: nowIso(), confirmedBy: null, confirmedAt: null, lines };
  commit({ ...state, payroll: [...state.payroll.filter((p) => p.month !== month), run].sort((a, b) => a.month.localeCompare(b.month)) });
  return { ok: true, value: undefined };
}

export function confirmPayroll(month: string, actor: StaffUser): HrResult {
  const run = state.payroll.find((p) => p.month === month);
  if (!run) return { ok: false, error: 'notFound' };
  if (run.status === 'confirmed') return { ok: false, error: 'alreadyDecided' };
  if (!canApprove('payroll', actor, run.preparedBy)) return { ok: false, error: 'notApprover' };
  commit({ ...state, payroll: state.payroll.map((p) => (p.month === month ? { ...p, status: 'confirmed', confirmedBy: actor.id, confirmedAt: nowIso() } : p)) });
  logApproval(actor.id, 'payrollRun', month, 'draft', 'confirmed');
  return { ok: true, value: undefined };
}

export function updateEmployee(id: string, patch: Partial<Pick<Employee, 'dept' | 'employmentType' | 'annualQuota' | 'baseSalary' | 'commissionRate' | 'allowance'>>, actor: StaffUser): HrResult {
  if (!can(actor.role, 'payroll', 'edit')) return { ok: false, error: 'forbidden' };
  if (!employeeById(id)) return { ok: false, error: 'notFound' };
  commit({ ...state, employees: state.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return { ok: true, value: undefined };
}
