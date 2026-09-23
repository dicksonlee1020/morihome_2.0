import type { StaffRole } from '../config/permissions';

/**
 * 同事名錄（時間線 actor、@mention 名單）。同 mockAuthService 嘅帳號一致；
 * 接後台時由 User 表嚟。`u-system` 係 Shopify 同步 / 推導引擎。
 */
export interface StaffRef {
  id: string;
  name: string;
  role: StaffRole | 'system';
}

export const STAFF: StaffRef[] = [
  { id: 'u-ocean', name: 'Ocean', role: 'owner' },
  { id: 'u-jenny', name: 'Jenny', role: 'owner' },
  { id: 'u-alex', name: 'Alex', role: 'ops' },
  { id: 'u-manman', name: '雯雯', role: 'finance' },
  { id: 'u-wilson', name: 'Wilson', role: 'sales' },
  { id: 'u-steve', name: 'Steve', role: 'sales' },
  { id: 'u-hang', name: '阿桁', role: 'driver' },
  { id: 'u-yumi', name: 'Yumi', role: 'content' },
  { id: 'u-kengi', name: 'Kengi', role: 'sysadmin' },
  { id: 'u-system', name: 'Shopify', role: 'system' },
];

const byId = new Map(STAFF.map((s) => [s.id, s]));
const byName = new Map(STAFF.map((s) => [s.name, s]));

export const staffById = (id: string): StaffRef => byId.get(id) ?? { id, name: id, role: 'system' };
export const staffByName = (name: string): StaffRef => byName.get(name) ?? { id: name, name, role: 'system' };
