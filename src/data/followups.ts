import type {
  Activity,
  DeliveryOrder,
  PackageUnit,
  SalesOrder,
} from '../domain/types';
import { commit, moriWorkbenchRows, opsState } from './ops';

/** Workbench rows derive from the canonical operations store (v13). */
export interface FollowupRow {
  activity: Activity;
  order: SalesOrder;
  units: PackageUnit[];
  delivery: DeliveryOrder;
  /** Item names on the order, shown as-is; data is never translated. */
  items: string[];
}
export const OWNERS = ['Alex', 'Ocean'] as const;
function buildRows() {
  commit(opsState);
  return moriWorkbenchRows(opsState);
}

// v10: canonical activities store; business records remain separate from task state.
export const followupRows = buildRows();
