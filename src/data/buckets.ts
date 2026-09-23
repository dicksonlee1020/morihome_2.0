import type { OrderBucket } from '../domain/derive';
import type { MessageKey } from '../i18n';
import type { Tone } from '../utils/tones';

/**
 * CLAUDE.md DoD：訂單列表「狀態」欄 = 推導 bucket，同「我的跟進」用同一套。
 * status → colour 係單一 mapping，全 app 引用（UI 規範）。
 */
export const BUCKET_META: Record<OrderBucket, { labelKey: MessageKey; tone: Tone }> = {
  notProcured: { labelKey: 'orders.bucket.notProcured', tone: 'warning' },
  preparing: { labelKey: 'orders.bucket.preparing', tone: 'brand' },
  toSchedule: { labelKey: 'orders.bucket.toSchedule', tone: 'warning' },
  scheduled: { labelKey: 'orders.bucket.scheduled', tone: 'brand' },
  partiallyDelivered: { labelKey: 'orders.bucket.partiallyDelivered', tone: 'muted' },
  completed: { labelKey: 'orders.bucket.completed', tone: 'success' },
};
