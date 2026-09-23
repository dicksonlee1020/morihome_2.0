import { can } from '../config/permissions';
import type { Module, StaffRole } from '../config/permissions';

/**
 * Screens → registry modules (docs/design/rbac-spec.md §9.3). The navigation
 * shows a screen when the role may `view` its module; the server enforces the
 * same registry on every route, so this is display logic only.
 */
export type PageKey =
  | 'followups'
  | 'orders'
  | 'customers'
  | 'products'
  | 'inventory'
  | 'restock'
  | 'purchasing'
  | 'waiting'
  | 'delivery'
  | 'settings';

export const PAGE_MODULE: Record<PageKey, Module> = {
  followups: 'followups',
  orders: 'orders',
  customers: 'customers',
  products: 'products',
  inventory: 'warehouse',
  restock: 'restock',
  purchasing: 'purchasing',
  waiting: 'purchasing',
  delivery: 'delivery',
  settings: 'settings',
};

export const canOpen = (role: StaffRole, page: PageKey): boolean =>
  can(role, PAGE_MODULE[page], 'view');

/** The screen a role lands on after signing in: its first permitted one. */
export function landingPage(role: StaffRole): PageKey | null {
  const order = Object.keys(PAGE_MODULE) as PageKey[];
  return order.find((page) => canOpen(role, page)) ?? null;
}
