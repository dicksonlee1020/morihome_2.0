import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

/**
 * Single clock for the app so fixtures and derived dates stay consistent.
 *
 * TODO: the fixed date keeps the demo data stable; swap for dayjs() once the
 * screens read from the API.
 */
export const DEMO_TODAY = '2026-09-22';

export const today = (): Dayjs => dayjs(DEMO_TODAY).startOf('day');

export const daysSince = (date: string | null): number | null =>
  date == null ? null : today().diff(dayjs(date).startOf('day'), 'day');
