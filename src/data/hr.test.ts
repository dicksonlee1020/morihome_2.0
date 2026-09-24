import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAdmin, getAdmin, updateRule } from './admin';
import { _resetHr, annualLeaveBalance, cancelLeave, commissionFor, confirmPayroll, decideLeave, getHr, leaveDays, payrollLine, refreshPayrollDraft, requestLeave, setShift, weekStart } from './hr';
import { _resetOps, getOps } from './ops';
import { listAccounts } from '../auth/mockAuthService';
import type { StaffUser } from '../auth/types';

const user = (id: string): StaffUser => listAccounts().find((u) => u.id === id)!;
const shift = (employeeId: string, date: string) => getHr().shifts.find((s) => s.employeeId === employeeId && s.date === date)!;

beforeEach(() => {
  _resetOps();
  _resetAdmin();
  _resetHr();
});

describe('helpers', () => {
  it('leave days skip Sundays; weeks start on Monday', () => {
    expect(leaveDays('2026-09-26', '2026-09-28')).toBe(2); // Sat, Sun, Mon
    expect(weekStart('2026-09-22')).toBe('2026-09-21');
    expect(weekStart('2026-09-21')).toBe('2026-09-21');
  });

  it('payroll line applies the MPF cap and skips part-timers', () => {
    const e = getHr().employees.find((x) => x.id === 'E01')!;
    const l = payrollLine(e, 0);
    expect(l.mpfEmployee).toBe(1500);
    expect(l.net).toBe(e.baseSalary - 1500);
    const p = getHr().employees.find((x) => x.employmentType === 'partTime')!;
    expect(payrollLine(p, 0).mpfEmployee).toBe(0);
  });

  it('commission is derived from completed orders of the month, never stored', () => {
    const rows = commissionFor('2026-09', getHr().employees, getOps().orders);
    expect(rows.map((r) => r.employeeId).sort()).toEqual(['E05', 'E06']);
    const completed = getOps().orders.filter((o) => o.delivery.completedDate?.startsWith('2026-09'));
    expect(rows.reduce((s, r) => s + r.orders, 0)).toBe(completed.length);
    for (const r of rows) expect(r.commission).toBe(Math.round(r.salesAmount * r.rate));
  });
});

describe('leave (ApprovalRule leave → Jenny)', () => {
  it('a request waits for the rule approver, and approval writes the roster and the audit', () => {
    const res = requestLeave({ employeeId: 'E05', type: 'annual', from: '2026-10-05', to: '2026-10-06', reason: '' }, user('u-wilson'));
    expect(res.ok && res.value.status).toBe('pending');
    const id = res.ok ? res.value.id : '';
    expect(decideLeave(id, 'approved', user('u-ocean'))).toEqual({ ok: false, error: 'notApprover' });
    expect(decideLeave(id, 'approved', user('u-wilson'))).toEqual({ ok: false, error: 'notApprover' });
    expect(decideLeave(id, 'approved', user('u-jenny'), 'ok').ok).toBe(true);
    expect(shift('E05', '2026-10-05').slot).toBe('leave');
    expect(getAdmin().audit.at(-1)).toMatchObject({ userId: 'u-jenny', event: 'approval', targetId: id, after: 'approved' });
    expect(decideLeave(id, 'rejected', user('u-jenny'))).toEqual({ ok: false, error: 'alreadyDecided' });
  });

  it('overlapping requests are refused; the requester can cancel while pending', () => {
    expect(requestLeave({ employeeId: 'E05', type: 'sick', from: '2026-09-28', to: '2026-09-28', reason: '' }, user('u-wilson'))).toEqual({ ok: false, error: 'overlap' });
    expect(cancelLeave('LV-01', user('u-steve'))).toEqual({ ok: false, error: 'forbidden' });
    expect(cancelLeave('LV-01', user('u-wilson')).ok).toBe(true);
  });

  it('with the rule switched off leave is approved on submission', () => {
    updateRule('AR-05', { active: false }, user('u-ocean'));
    const res = requestLeave({ employeeId: 'E07', type: 'annual', from: '2026-10-12', to: '2026-10-12', reason: '' }, user('u-hang'));
    expect(res.ok && res.value.status).toBe('approved');
  });

  it('annual balance = quota − approved annual days this year', () => {
    const e = getHr().employees.find((x) => x.id === 'E04')!;
    expect(annualLeaveBalance(e, getHr().leaves)).toBe(e.annualQuota - 5);
  });
});

describe('roster and payroll', () => {
  it('only hr.edit roles change shifts', () => {
    expect(setShift('E05', '2026-09-23', 'off', null, user('u-wilson'))).toEqual({ ok: false, error: 'forbidden' });
    expect(setShift('E05', '2026-09-23', 'am', 'warehouse', user('u-alex')).ok).toBe(true);
    expect(shift('E05', '2026-09-23')).toMatchObject({ slot: 'am', place: 'warehouse' });
  });

  it('finance drafts, the payroll approver confirms, confirmed runs lock', () => {
    expect(refreshPayrollDraft('2026-09', user('u-alex'))).toEqual({ ok: false, error: 'forbidden' });
    expect(refreshPayrollDraft('2026-09', user('u-manman')).ok).toBe(true);
    expect(confirmPayroll('2026-09', user('u-manman'))).toEqual({ ok: false, error: 'notApprover' });
    expect(confirmPayroll('2026-09', user('u-jenny')).ok).toBe(true);
    expect(refreshPayrollDraft('2026-09', user('u-manman'))).toEqual({ ok: false, error: 'alreadyDecided' });
    expect(getAdmin().audit.at(-1)).toMatchObject({ event: 'approval', targetModel: 'payrollRun', targetId: '2026-09' });
  });
});
