/**
 * UI strings. Components must never hardcode Chinese (CLAUDE.md, language rules).
 * zh-Hant is the base locale; zh-Hans must stay key-for-key identical.
 * Data (customer names, product names, districts) is never translated.
 */

export const messages = {
  'zh-Hant': {
    'nav.orders': '訂單',
    'nav.followups': '我的跟進',
    'nav.customers': '客戶',
    'nav.products': '產品',
    'nav.inventory': '庫存',
    'nav.purchasing': '採購',
    'nav.delivery': '送貨',
    'nav.settings': '設定',
    'nav.notBuilt': '{name}畫面未砌',

    'app.brandSub': 'ERP',
    'app.density.comfy': '舒適',
    'app.density.dense': '密集',
    'app.density.hint': '密集模式：同一套顏色組件，收窄間距同字級',
    'app.locale.label': '語言',

    'followups.title': '我的跟進',
    'followups.subtitle': '{owner} · 截至 {date}',
    'followups.bucket.overdue': '逾期',
    'followups.bucket.today': '今日',
    'followups.bucket.week': '本週',
    'followups.bucket.later': '之後',
    'followups.bucket.done': '已完成',
    'followups.bucket.all': '全部',
    'followups.search': '搵訂單號、客戶或地區',
    'followups.owner.all': '所有同事',
    'followups.count': '篩選後 {n} 項',
    'followups.empty': '冇跟進項目',

    'followups.col.due': '到期',
    'followups.col.kind': '跟進事項',
    'followups.col.order': '訂單',
    'followups.col.customer': '客戶',
    'followups.col.progress': '貨品進度',
    'followups.col.requested': '客戶要求',
    'followups.col.scheduled': '已約',
    'followups.col.owner': '負責',
    'followups.col.actions': '',

    'followups.kind.scheduleDelivery': '約送貨',
    'followups.kind.confirmArrival': '確認到貨',
    'followups.kind.chaseSupplier': '追供應商',
    'followups.kind.chasePayment': '追尾數',

    'followups.state.overdue': '逾期',
    'followups.state.today': '今日',
    'followups.state.planned': '計劃中',
    'followups.state.done': '已完成',

    'followups.line.notProcured': '未採購',
    'followups.line.inTransit': '在途',
    'followups.line.readyToSchedule': '可安排送貨',
    'followups.line.partiallyDelivered': '部分送達',
    'followups.line.delivered': '已送達',

    'followups.slot.morning': '上午',
    'followups.slot.afternoon': '下午',
    'followups.slot.evening': '晚上',
    'followups.slot.flexible': '彈性',

    'followups.notScheduled': '未約',
    'followups.inHkDays': '在港 {n} 日',
    'followups.escalated': '在港 {n} 日未約',
    'followups.escalatedHint': '可安排送貨但未約，已過 {threshold} 日門檻，要通知老闆',
    'followups.attempts': '已試 {n} 次',

    'followups.action.schedule': '已約',
    'followups.action.unreachable': '打唔通',
    'followups.action.postponed': '客延後',
    'followups.action.confirm': '確認',
    'followups.action.cancel': '取消',

    'followups.schedule.title': '約送貨',
    'followups.schedule.date': '送貨日期',
    'followups.schedule.slot': '時段',
    'followups.schedule.requestedHint': '客戶要求：{text}',
    'followups.schedule.done': '{order} 已約 {date} {slot}',

    'followups.postpone.title': '客延後',
    'followups.postpone.nextDue': '下次跟進',
    'followups.postpone.note': '備註',
    'followups.postpone.notePlaceholder': '客講幾時方便、要留意啲乜',
    'followups.postpone.done': '{order} 下次跟進改為 {date}',

    'followups.unreachable.done': '{order} 打唔通，已排 {date} 再跟',

    'followups.bulk.selected': '已揀 {n} 項',
    'followups.bulk.postpone': '批量順延一日',
    'followups.bulk.clear': '清除',
    'followups.bulk.done': '{n} 項跟進已順延一日',
  },

  'zh-Hans': {
    'nav.orders': '订单',
    'nav.followups': '我的跟进',
    'nav.customers': '客户',
    'nav.products': '产品',
    'nav.inventory': '库存',
    'nav.purchasing': '采购',
    'nav.delivery': '送货',
    'nav.settings': '设定',
    'nav.notBuilt': '{name}画面未建',

    'app.brandSub': 'ERP',
    'app.density.comfy': '舒适',
    'app.density.dense': '密集',
    'app.density.hint': '密集模式：同一套颜色组件，收窄间距与字级',
    'app.locale.label': '语言',

    'followups.title': '我的跟进',
    'followups.subtitle': '{owner} · 截至 {date}',
    'followups.bucket.overdue': '逾期',
    'followups.bucket.today': '今日',
    'followups.bucket.week': '本周',
    'followups.bucket.later': '之后',
    'followups.bucket.done': '已完成',
    'followups.bucket.all': '全部',
    'followups.search': '搜订单号、客户或地区',
    'followups.owner.all': '所有同事',
    'followups.count': '筛选后 {n} 项',
    'followups.empty': '没有跟进项目',

    'followups.col.due': '到期',
    'followups.col.kind': '跟进事项',
    'followups.col.order': '订单',
    'followups.col.customer': '客户',
    'followups.col.progress': '货品进度',
    'followups.col.requested': '客户要求',
    'followups.col.scheduled': '已约',
    'followups.col.owner': '负责',
    'followups.col.actions': '',

    'followups.kind.scheduleDelivery': '约送货',
    'followups.kind.confirmArrival': '确认到货',
    'followups.kind.chaseSupplier': '催供应商',
    'followups.kind.chasePayment': '催尾数',

    'followups.state.overdue': '逾期',
    'followups.state.today': '今日',
    'followups.state.planned': '计划中',
    'followups.state.done': '已完成',

    'followups.line.notProcured': '未采购',
    'followups.line.inTransit': '在途',
    'followups.line.readyToSchedule': '可安排送货',
    'followups.line.partiallyDelivered': '部分送达',
    'followups.line.delivered': '已送达',

    'followups.slot.morning': '上午',
    'followups.slot.afternoon': '下午',
    'followups.slot.evening': '晚上',
    'followups.slot.flexible': '弹性',

    'followups.notScheduled': '未约',
    'followups.inHkDays': '在港 {n} 天',
    'followups.escalated': '在港 {n} 天未约',
    'followups.escalatedHint': '可安排送货但未约，已过 {threshold} 天门槛，要通知老板',
    'followups.attempts': '已试 {n} 次',

    'followups.action.schedule': '已约',
    'followups.action.unreachable': '打不通',
    'followups.action.postponed': '客延后',
    'followups.action.confirm': '确认',
    'followups.action.cancel': '取消',

    'followups.schedule.title': '约送货',
    'followups.schedule.date': '送货日期',
    'followups.schedule.slot': '时段',
    'followups.schedule.requestedHint': '客户要求：{text}',
    'followups.schedule.done': '{order} 已约 {date} {slot}',

    'followups.postpone.title': '客延后',
    'followups.postpone.nextDue': '下次跟进',
    'followups.postpone.note': '备注',
    'followups.postpone.notePlaceholder': '客说何时方便、要留意什么',
    'followups.postpone.done': '{order} 下次跟进改为 {date}',

    'followups.unreachable.done': '{order} 打不通，已排 {date} 再跟',

    'followups.bulk.selected': '已选 {n} 项',
    'followups.bulk.postpone': '批量顺延一天',
    'followups.bulk.clear': '清除',
    'followups.bulk.done': '{n} 项跟进已顺延一天',
  },
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof (typeof messages)['zh-Hant'];

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-Hant', label: '繁體' },
  { value: 'zh-Hans', label: '简体' },
];
