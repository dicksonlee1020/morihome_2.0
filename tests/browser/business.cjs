const fs = require('fs');
const { chromium } = require('playwright');
const { launchOptions, htmlUrl, resultPath } = require('./support.cjs');
(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(htmlUrl);
  await page.waitForFunction(() => !!window.__qa);
  const results = await page.evaluate(() => {
    const q = window.__qa,
      checks = [];
    const assert = (v, n) => {
        if (!v) throw Error(n);
        checks.push(n);
      },
      copy = (x) => structuredClone(x),
      snapshot = copy(q.get()),
      product = q.products().find((p) => p.packageStems.length >= 2),
      sku = product.sku,
      N = product.packageStems.length;
    function fixture({
      stock = false,
      stage = 'supplierTransit',
      route = 'viaCN',
    } = {}) {
      const order = {
          id: 'O3579',
          orderNo: 'PO3579',
          createdAt: '2026-09-20',
          channel: 'shopify',
          payment: 'deposit',
          assignee: 'Wilson',
          customer: { alias: '測試客戶', phone: '6451 1020', district: '觀塘' },
          lines: [{ id: 'L1', sku, qty: 2, price: product.price }],
          customerRequestedDate: null,
          customerRequestedNote: null,
          delivery: {
            scheduledDate: null,
            timeSlot: null,
            completedDate: null,
          },
        },
        req = {
          id: 'PR-20260922-001',
          sku,
          qty: 2,
          orderNo: stock ? '備貨0922-01' : order.orderNo,
          lineId: stock ? null : 'L1',
          customer: stock ? null : order.customer,
          purpose: stock ? 'restock' : 'customerOrder',
          supplier: product.supplier,
          purchaseOrderId: 'TEST-PB',
          sourcing: 'orderNew',
          createdAt: '2026-09-20',
        },
        po = {
          id: 'TEST-PB',
          batchNo: 'PB-20260922-01',
          supplier: product.supplier,
          supplierOrderNo: 'HB-TEST-01',
          orderedAt: '2026-09-21',
          estimatedReady: '2026-09-22',
          deliveryRoute: route,
          lines: [{ requirementId: req.id, sku, qty: 2, unitCost: 100.25 }],
        },
        packages = [];
      for (let u = 1; u <= 2; u++)
        product.packageStems.forEach((stem, i) =>
          packages.push({
            id: `T-${u}-${i}`,
            sku,
            stem,
            packageCode: `${stem}-T${u}-${i}`,
            unitId: `TU${u}`,
            orderNo: stock ? null : order.orderNo,
            lineId: stock ? null : 'L1',
            allocationRequirementId: stock ? null : req.id,
            allocationPurpose: stock ? 'restock' : 'customerOrder',
            procurementReference: req.orderNo,
            procurementRequirementId: req.id,
            requirementId: req.id,
            purchaseOrderId: po.id,
            location: stage,
            logisticsNo: 'TRACK-122',
            deliveryNoteNo: 'JH-TEST',
            shippedAt: stage === 'supplier' ? null : '2026-09-22',
          }),
        );
      return {
        orders: stock ? [] : [order],
        requirements: [req],
        purchaseOrders: [po],
        packages,
        activities: [],
        moves: [],
        moveConsequences: [],
        audit: [],
        comments: [],
        seq: 2,
      };
    }
    const save = (rows, extra = {}) =>
      q.saveReceipt({
        stage: 'cn',
        date: '2026-09-22',
        owner: 'Alex',
        dueDate: '2026-09-23',
        rows,
        actor: 'u-alex',
        ...extra,
      });
    const reject = (fn, name) => {
      let before = JSON.stringify(q.get()),
        threw = false;
      try {
        fn();
      } catch (e) {
        threw = true;
      }
      assert(threw && before === JSON.stringify(q.get()), name);
    };
    q.reset(fixture({ stock: true }));
    const ids = q.get().packages.map((p) => p.id),
      get = (id) => q.get().packages.find((p) => p.id === id);
    reject(
      () => save([{ id: ids[0], result: 'short' }]),
      'exception requires reason, atomic rejection',
    );
    reject(
      () => save([{ id: ids[0], result: 'wrong', note: '錯件' }]),
      'wrong goods require observed identity',
    );
    reject(
      () =>
        save([
          { id: ids[0], result: 'received' },
          { id: ids[0], result: 'received' },
        ]),
      'duplicate package row rejected',
    );
    reject(
      () =>
        save([{ id: ids[0], result: 'short', note: '少一包' }], {
          dueDate: '2026-09-21',
        }),
      'follow-up date cannot precede receipt',
    );
    save([{ id: ids[0], result: 'received' }]);
    assert(
      get(ids[0]).location === 'cnWarehouse' &&
        get(ids[1]).location === 'supplierTransit',
      'partial receipt updates selected package only',
    );
    assert(q.summary(sku).availableCN === 0, 'incomplete unit not available');
    reject(
      () => save([{ id: ids[0], result: 'received' }]),
      'duplicate receipt cannot create stock',
    );
    save([{ id: ids[1], result: 'short', note: '物流少一包' }]);
    assert(
      get(ids[1]).location === 'supplierTransit',
      'short expected package remains in transit',
    );
    assert(
      q
        .get()
        .activities.some(
          (a) => a.source === 'receiving' && !a.orderId && !a.doneAt,
        ),
      'noncustomer shortage generates canonical task',
    );
    save([
      {
        id: ids[N],
        result: 'wrong',
        note: '型號不符',
        observed: 'WRONG-CHAIR',
      },
    ]);
    assert(
      get(ids[N]).location === 'supplierTransit' &&
        q.get().unexpectedReceipts[0].sku === null &&
        q.get().unexpectedReceipts[0].location === 'cnWarehouse',
      'wrong goods separate from expected SKU',
    );
    save([{ id: ids[N + 1], result: 'damaged', note: '包裝破裂' }]);
    assert(
      get(ids[N + 1]).location === 'cnWarehouse' && get(ids[N + 1]).quarantined,
      'damage physically received and quarantined',
    );
    assert(
      q.summary(sku).availableCN === 0,
      'exceptions cannot inflate availability',
    );
    reject(
      () => q.transfer('備貨0922-01', 'TEST-PB', sku),
      'incomplete/damaged unit blocked from HK truck',
    );
    reject(
      () => q.reallocate(ids.slice(N), { type: 'display', reason: '測試' }),
      'exception unit cannot allocate',
    );
    save([{ id: ids[1], result: 'followup', note: '供應商明天補到' }], {
      owner: 'Ocean',
      dueDate: '2026-09-25',
    });
    assert(
      q.get().activities.find((a) => a.packageId === ids[1]).owner ===
        'Ocean' &&
        !q.get().activities.find((a) => a.packageId === ids[1]).doneAt,
      'follow-up updates source and leaves task open',
    );
    save([{ id: ids[1], result: 'received', note: '物流補到已點清' }]);
    assert(
      q.get().activities.find((a) => a.packageId === ids[1]).doneAt,
      'source resolution completes task without deleting',
    );
    const restUnit1 = ids.slice(2, N).map((id) => ({ id, result: 'received' }));
    if (restUnit1.length) save(restUnit1);
    assert(
      q.summary(sku).availableCN === 1,
      'full clear unit becomes available',
    );
    reject(
      () => save([{ id: ids[N], result: 'received', note: '補到正確貨' }]),
      'wrong goods must record return disposition',
    );
    save([
      {
        id: ids[N],
        result: 'received',
        note: '已退錯件，正確包件補到',
        wrongDisposition: 'returned',
      },
      { id: ids[N + 1], result: 'received', note: '修復後驗收通過' },
      ...ids.slice(N + 2).map((id) => ({ id, result: 'received' })),
    ]);
    assert(
      q.summary(sku).availableCN === 2 &&
        q.get().unexpectedReceipts[0].status === 'returned',
      'resolution restores stock and retains wrong-item disposition',
    );
    assert(
      q
        .get()
        .activities.filter((a) => a.source === 'receiving')
        .every((a) => a.doneAt),
      'all receipt exception tasks completed',
    );
    assert(
      q.live().find((p) => p.sku === sku).stock.availableCN === 2 &&
        q.restock(q.get()).find((p) => p.sku === sku).stock.availableCN === 2,
      'products/restock share resolved inventory',
    );
    assert(
      q
        .get()
        .packages.every(
          (p) => p.procurementReference === '備貨0922-01' && !p.orderNo,
        ),
      'receiving preserves procurement origin and allocation',
    );
    q.transfer('備貨0922-01', 'TEST-PB', sku);
    assert(
      q.summary(sku).availableCN === 0 &&
        q.get().packages.every((p) => p.location === 'transit'),
      'HK transfer removes CN available',
    );
    save(
      ids.map((id) => ({ id, result: 'received' })),
      { stage: 'hk' },
    );
    assert(
      q.summary(sku).availableHK === 2,
      'HK receipt restores HK availability',
    );
    assert(
      q.get().receipts.length > 0 &&
        q.get().packages[0].receiptHistory.length === 2,
      'receipt ID and stage history retained',
    );
    q.reset(fixture());
    save(
      ids.map((id, i) => ({
        id,
        result: i === 0 ? 'damaged' : 'received',
        note: i === 0 ? '破損' : '',
      })),
    );
    assert(
      q.ready('PO3579') === 'inTransit',
      'customer damaged stock not ready',
    );
    reject(
      () => q.transfer('PO3579', 'TEST-PB', sku),
      'allocated damaged unit cannot ship',
    );
    save([{ id: ids[0], result: 'received', note: '檢修完成' }]);
    q.transfer('PO3579', 'TEST-PB', sku);
    save(
      ids.map((id) => ({ id, result: 'received' })),
      { stage: 'hk' },
    );
    assert(
      q.ready('PO3579') === 'readyToSchedule' &&
        q
          .get()
          .activities.some((a) => a.kind === 'scheduleDelivery' && !a.doneAt),
      'HK complete receipt generates schedule task',
    );
    q.reset(fixture({ stage: 'supplier', route: 'directCustomer' }));
    q.ship('PO3579', 'TEST-PB', sku);
    assert(
      q.get().packages.every((p) => p.location === 'customerTransit') &&
        !q.get().orders[0].delivery.completedDate,
      'manual direct shipment is transit, not delivered',
    );
    assert(
      q
        .waiting(q.get())
        .some((g) =>
          g.lines.some((l) =>
            l.packages.some((p) => p.location === 'customerTransit'),
          ),
        ),
      'direct transit remains visible in waiting',
    );
    assert(
      q.booking('PO3579', '2026-09-23', 'afternoon', 'u-alex') === false,
      'in-transit direct shipment cannot warehouse-book',
    );
    reject(
      () => save([{ id: ids[0], result: 'received' }], { stage: 'customer' }),
      'direct receipt requires signer and evidence',
    );
    save([{ id: ids[0], result: 'received' }], {
      stage: 'customer',
      recipient: '陳先生',
      proof: '電話確認 14:30',
    });
    assert(
      !q.get().orders[0].delivery.completedDate &&
        q.ready('PO3579') === 'partiallyDelivered',
      'partial signature remains partial',
    );
    save(
      ids.slice(1).map((id) => ({ id, result: 'received' })),
      {
        stage: 'customer',
        recipient: '陳先生',
        proof: 'WhatsApp 確認包件齊全',
      },
    );
    assert(
      q.ready('PO3579') === 'delivered' &&
        q.get().orders[0].delivery.completedDate === '2026-09-22',
      'complete signature completes delivery',
    );
    assert(
      q
        .get()
        .activities.filter((a) => a.kind === 'confirmArrival')
        .every((a) => a.doneAt),
      'signature completes arrival task',
    );
    q.reset(fixture({ stage: 'supplier', route: 'directCustomer' }));
    const match = q.importMatch([
      {
        supplierOrderNo: 'HB-TEST-01',
        supplierCode: product.supplierCode,
        supplierName: product.supplierName,
        qty: 2,
        shippedAt: '2026-09-22',
        deliveryNoteNo: 'JH-IMP',
        logisticsNo: 'D-123',
      },
    ]);
    assert(match.matched.length === 1, 'shipment import matches fixture');
    q.importApply(match);
    assert(
      q.get().packages.every((p) => p.location === 'customerTransit'),
      'import direct shipment also stays transit',
    );
    reject(() => q.importApply(match), 'stale shipment preview blocked');
    q.reset(snapshot);
    assert(
      q.get().packages.some((p) => p.location === 'supplierTransit') &&
        q.get().packages.some((p) => p.location === 'customerTransit'),
      'usable incoming and direct demo cases',
    );
    return { checks, sku, packageCount: N };
  });
  console.log(JSON.stringify(results, null, 2));
  await page.evaluate(async () => {
    const q = window.__qa,
      r = await q.login('alex@morihome.example', 'morihome2026', false);
    if (!r.ok) throw Error('login');
    q.session(r.session);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__MORI_NAVIGATE__);
  await page.evaluate(() => window.__MORI_NAVIGATE__('waiting'));
  await page
    .getByRole('button', { name: '包件點貨／簽收', exact: true })
    .click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: resultPath('receiving-desktop.png'),
    fullPage: true,
  });

  console.log('ERRORS', errors);
  fs.writeFileSync(
    resultPath('results.json'),
    JSON.stringify({ business: results, errors }, null, 2),
  );
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
