import dayjs from 'dayjs';
import { DEMO_TODAY } from '../domain/clock';
import type {
  Activity,
  ActivityKind,
  DeliveryOrder,
  LocationKey,
  PackageUnit,
  SalesOrder,
  TimeSlot,
} from '../domain/types';

/**
 * Fixtures for the follow-up screen.
 *
 * CLAUDE.md, data rules: no real customer data. Customers are a pseudonym plus
 * a district — no full names, no phone numbers, no addresses.
 *
 * TODO(prototype): reconcile the row shape against
 * docs/prototype/morihome-erp-prototype.html once it lands in the repo.
 */

export interface FollowupRow {
  activity: Activity;
  order: SalesOrder;
  units: PackageUnit[];
  delivery: DeliveryOrder;
  /** Item names on the order, shown as-is; data is never translated. */
  items: string[];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]) =>
  arr[Math.floor(rng() * arr.length)];

const ALIASES = [
  '陳女士', '李先生', '黃太', '張小姐', '何先生', '林太',
  '吳女士', '鄭先生', '梁太', '周小姐', '徐先生', '馬女士',
];

const DISTRICTS = [
  '將軍澳', '沙田', '荃灣', '元朗', '太古', '何文田',
  '大埔', '屯門', '西貢', '紅磡', '鰂魚涌', '天水圍',
];

const ITEMS = [
  '橡木三座位梳化', '胡桃木餐檯 160cm', '布藝餐椅', '橡木床架 Queen',
  '乳膠床褥 Queen', '松木五層書架', '橡木雙門衣櫃', '雲石茶几',
  '藤織扶手椅', '訂造地櫃 240cm', '亞麻被套組', '黃銅座地燈',
];

export const OWNERS = ['Alex', 'Ocean'] as const;

const KINDS: ActivityKind[] = [
  'scheduleDelivery',
  'scheduleDelivery',
  'scheduleDelivery',
  'confirmArrival',
  'chaseSupplier',
  'chasePayment',
];

const SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening', 'flexible'];

const REQUEST_NOTES = [
  '星期六日先收',
  '夜晚七點後',
  '要走樓梯上三樓',
  '大廈唔夠位上電梯',
  '',
  '',
  '',
];

const ROW_COUNT = 124; // proves the "100+ rows without lag" acceptance rule

function buildRows(): FollowupRow[] {
  const rng = mulberry32(20260922);
  const today = dayjs(DEMO_TODAY);
  const rows: FollowupRow[] = [];

  for (let i = 0; i < ROW_COUNT; i++) {
    const orderId = `o-${i}`;
    const orderNo = `MH-${24100 - i}`;
    const alias = pick(rng, ALIASES);
    const district = pick(rng, DISTRICTS);

    // Where the boxes are. Most follow-ups exist because stock landed in HK
    // and nobody has booked the customer yet.
    const roll = rng();
    let locations: LocationKey[];
    if (roll < 0.58) locations = ['hkWarehouse', 'hkWarehouse'];
    else if (roll < 0.66) locations = ['hkWarehouse', 'showroom'];
    else if (roll < 0.86) locations = ['hkWarehouse', 'transit'];
    else if (roll < 0.94) locations = ['cnWarehouse', 'cnWarehouse'];
    else locations = ['customer', 'hkWarehouse'];

    // Anything already in HK has been waiting somewhere between a day and two
    // months; the long tail is what escalation is supposed to catch.
    const waited = Math.floor(1 + rng() * 60);
    const units: PackageUnit[] = locations.map((location, idx) => ({
      id: `${orderId}-p${idx}`,
      packageCode: `${orderNo}-${idx + 1}`,
      orderLineId: `${orderId}-l0`,
      location,
      arrivedAt:
        location === 'hkWarehouse' || location === 'showroom'
          ? today.subtract(waited, 'day').format('YYYY-MM-DD')
          : null,
    }));

    // A fifth of the rows already have a date; they stay on the list because
    // the activity is not closed until the delivery is confirmed.
    const booked = rng() < 0.2;
    const delivery: DeliveryOrder = {
      id: `d-${i}`,
      orderId,
      scheduledDate: booked
        ? today.add(Math.floor(rng() * 12) + 1, 'day').format('YYYY-MM-DD')
        : null,
      timeSlot: booked ? pick(rng, SLOTS) : null,
      completedDate: null,
    };

    // Due dates spread across overdue / today / this week / later.
    const dueRoll = rng();
    const offset =
      dueRoll < 0.28
        ? -Math.floor(1 + rng() * 9)
        : dueRoll < 0.46
          ? 0
          : dueRoll < 0.78
            ? Math.floor(1 + rng() * 6)
            : Math.floor(7 + rng() * 20);

    const requested = rng() < 0.55;
    const seqNo = rng() < 0.22 ? 2 + Math.floor(rng() * 2) : 1;

    rows.push({
      activity: {
        id: `a-${i}`,
        kind: pick(rng, KINDS),
        orderId,
        dueDate: today.add(offset, 'day').format('YYYY-MM-DD'),
        owner: pick(rng, OWNERS),
        // Earlier attempts in the chain came from an unreachable call.
        feedback: seqNo > 1 ? 'unreachable' : null,
        note: '',
        doneAt: null,
        nextActivityId: null,
        seq: seqNo,
      },
      order: {
        id: orderId,
        orderNo,
        customer: { id: `c-${i}`, alias, district },
        customerRequestedDate: requested
          ? today.add(Math.floor(rng() * 16) + 2, 'day').format('YYYY-MM-DD')
          : null,
        customerRequestedNote: pick(rng, REQUEST_NOTES),
      },
      units,
      delivery,
      items: [pick(rng, ITEMS)],
    });
  }

  return rows;
}

export const followupRows = buildRows();
