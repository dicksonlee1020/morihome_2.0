import type { StaffRole } from './types';

/**
 * Which roles may open which screen. SPEC REF §6: "角色六個，預設拒絕" — a
 * screen missing from this map is closed to everyone, and a role missing from
 * a screen's list cannot open it. The server enforces the same table; this copy
 * only decides what the navigation shows.
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

export const PAGE_ROLES: Record<PageKey, StaffRole[]> = {
  followups: ['owner', 'procurement'],
  orders: ['owner', 'procurement', 'finance', 'sales'],
  customers: ['owner', 'sales'],
  products: ['owner', 'procurement', 'merchandising', 'sales'],
  inventory: ['owner', 'procurement', 'merchandising'],
  restock: ['owner', 'procurement', 'merchandising'],
  purchasing: ['owner', 'procurement'],
  waiting: ['owner', 'procurement'],
  // §6: a driver sees only their own deliveries for the day.
  delivery: ['owner', 'procurement', 'driver'],
  settings: ['owner'],
};

export const canOpen = (role: StaffRole, page: PageKey): boolean =>
  PAGE_ROLES[page]?.includes(role) ?? false;

/** The screen a role lands on after signing in: its first permitted one. */
export function landingPage(role: StaffRole): PageKey | null {
  const order = Object.keys(PAGE_ROLES) as PageKey[];
  return order.find((page) => canOpen(role, page)) ?? null;
}
