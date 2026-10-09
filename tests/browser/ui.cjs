const fs = require('fs'),
  path = require('path');
const { chromium } = require('playwright');
const { launchOptions, htmlUrl, resultPath } = require('./support.cjs');
let debugPage;
(async () => {
  const browser = await chromium.launch(launchOptions),
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [],
    checks = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('RUNTIME', e.message);
  });
  debugPage = page;
  page.setDefaultTimeout(8000);
  const assert = (value, name) => {
    if (!value) throw Error(name);
    checks.push(name);
  };
  const fonts = process.env.MORI_FONT_DIR || '';
  let css = '';
  if (fs.existsSync(fonts)) {
    for (const weight of [400, 500, 600, 700]) {
      let f = path.join(fonts, weight + '.css');
      if (fs.existsSync(f))
        css += fs
          .readFileSync(f, 'utf8')
          .replace(
            /url\(\.\/files\/([^)]*)\)/g,
            (_, name) =>
              `url(data:font/woff2;base64,${fs.readFileSync(path.join(fonts, 'files', name)).toString('base64')})`,
          );
    }
  }
  async function font() {
    if (css) {
      await page.addStyleTag({ content: css });
      await page.evaluate(() => document.fonts.ready);
    }
  }
  await page.goto(htmlUrl);
  await page.waitForFunction(() => !!window.__qa);
  await page.evaluate(async () => {
    const r = await window.__qa.login(
      'alex@morihome.example',
      'morihome2026',
      false,
    );
    window.__qa.session(r.session);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__MORI_NAVIGATE__);
  await font();
  const seeded = await page.evaluate(() => structuredClone(window.__qa.get()));
  await page.evaluate(() => window.__MORI_NAVIGATE__('waiting'));
  await page
    .getByRole('button', { name: '包件點貨／簽收', exact: true })
    .click();
  const id = await page.evaluate(
    () =>
      window.__qa.get().packages.find((p) => p.location === 'supplierTransit')
        .id,
  );
  async function choice(id, label) {
    await page
      .getByRole('combobox', { name: `本次結果 ${id}`, exact: true })
      .click();
    await page
      .locator(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option',
      )
      .filter({ hasText: label })
      .click();
  }
  await choice(id, '短少／未收到');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  assert(
    (await page.getByRole('dialog').innerText()).includes('必須填寫原因'),
    'UI blocks exception without reason',
  );
  await page
    .getByRole('textbox', { name: `處理記錄 ${id}`, exact: true })
    .fill('物流核對少一包');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  await page.waitForTimeout(180);
  assert(
    await page.evaluate(
      (id) =>
        window.__qa
          .get()
          .activities.some((a) => a.packageId === id && !a.doneAt),
      id,
    ),
    'UI creates source exception and task',
  );
  await page
    .getByRole('button', { name: /^關\s*閉$/ })
    .last()
    .click();
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__MORI_NAVIGATE__('followups'));
  await page
    .getByPlaceholder('搜尋訂單編號、客戶、電話、SKU 或貨品', { exact: true })
    .fill(id);
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: '處理收貨異常', exact: true }).click();
  await page.waitForTimeout(100);
  assert(
    (await page.getByRole('dialog').innerText()).includes('物流核對少一包'),
    'workbench contextual action opens source package',
  );
  await choice(id, '補收／驗收通過');
  await page
    .getByRole('textbox', { name: `處理記錄 ${id}`, exact: true })
    .fill('物流補到，包件核對無誤');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  assert(
    await page.evaluate(
      (id) =>
        !!window.__qa.get().activities.find((a) => a.packageId === id).doneAt,
      id,
    ),
    'UI resolution completes task',
  );
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出核對清單 CSV', exact: true }).click(),
  ]);
  const downloaded = await download[0].path();
  assert(
    fs.readFileSync(downloaded, 'utf8').includes('物流補到'),
    'CSV export includes resolved audit',
  );
  await page
    .getByRole('button', { name: /^關\s*閉$/ })
    .last()
    .click();
  await page.waitForTimeout(200);
  await page.evaluate((s) => window.__qa.reset(s), seeded);
  await page
    .getByRole('button', { name: '包件點貨／簽收', exact: true })
    .click();
  await choice(id, '錯件');
  await page
    .getByRole('textbox', { name: `處理記錄 ${id}`, exact: true })
    .fill('供應商寄錯型號');
  await page
    .getByRole('textbox', { name: `實收錯件編碼／描述 ${id}`, exact: true })
    .fill('CHAIR-WRONG-01');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  await page.waitForTimeout(200);
  await choice(id, '補收／驗收通過');
  await page
    .getByRole('textbox', { name: `處理記錄 ${id}`, exact: true })
    .fill('錯件退回，正確貨品補收');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  assert(
    (await page.getByRole('dialog').innerText()).includes('請先確認錯件已退回'),
    'UI blocks unresolved wrong-item disposition',
  );
  await page
    .getByRole('checkbox', { name: '錯件已退回，退回及補收資料已記錄' })
    .check();
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  assert(
    await page.evaluate(
      () => window.__qa.get().unexpectedReceipts[0].status === 'returned',
    ),
    'UI wrong-item resolution keeps returned record',
  );
  await page.screenshot({
    path: resultPath('receiving-desktop.png'),
    fullPage: false,
  });
  await page
    .getByRole('button', { name: /^關\s*閉$/ })
    .last()
    .click();
  await page.waitForTimeout(200);
  // Regression: v11 partial confirmation and v12 display/restock allocation use the same canonical stock.
  const reg = await page.evaluate(() => {
    const q = window.__qa,
      p = q.products().find((p) => p.sourcingType === 'stocked'),
      before = q.summary(p.sku).availableCN,
      r = q.manual({ sku: p.sku, qty: 3, purpose: 'restock' }),
      pb = q.batch(p.supplier, [r.id]),
      saved = q.confirm(pb.id, {
        supplierOrderNo: 'HB-REG-V13',
        deliveryRoute: 'viaCN',
        lineConfirmations: [
          { requirementId: r.id, confirmedQty: 1, unitCost: 123.45 },
        ],
      });
    let good =
      saved.confirmationState === 'partial' &&
      saved.lines[0].unitCost === 123.45 &&
      q
        .get()
        .requirements.find(
          (x) => x.id === saved.lines[0].remainingRequirementId,
        ).qty === 2;
    q.ship(r.orderNo, pb.id, p.sku);
    const ids = q
      .get()
      .packages.filter((x) => x.purchaseOrderId === pb.id)
      .map((x) => x.id);
    q.saveReceipt({
      stage: 'cn',
      date: '2026-09-22',
      rows: ids.map((id) => ({ id, result: 'received' })),
      actor: 'u-alex',
    });
    good &&= q.summary(p.sku).availableCN === before + 1;
    q.reallocate(ids, { type: 'display', reason: '陳列用途回歸測試' });
    good &&= q.summary(p.sku).availableCN === before;
    q.reallocate(ids, { type: 'restock', reason: '歸還備貨' });
    good &&= q.summary(p.sku).availableCN === before + 1;
    return good;
  });
  assert(reg, 'supplier partial confirmation + allocation regression');
  // Use each responsive route under owner visibility, then exercise mobile receiving as ops.
  await page.evaluate(async () => {
    const r = await window.__qa.login(
      'ocean@morihome.example',
      'morihome2026',
      false,
    );
    window.__qa.session(r.session);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__MORI_NAVIGATE__);
  await font();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      'followups',
      'orders',
      'customers',
      'purchasing',
      'waiting',
      'inventory',
      'restock',
      'products',
      'delivery',
      'hr',
      'settings',
    ]) {
      await page.evaluate((r) => window.__MORI_NAVIGATE__(r), route);
      await page.waitForTimeout(60);
      const box = await page.evaluate(() => ({
        w: innerWidth,
        scroll: document.documentElement.scrollWidth,
        failed: document.body.innerText.includes('Failed to load'),
      }));
      assert(
        !box.failed && box.scroll <= box.w + 1,
        `${width}px ${route} route renders without document overflow`,
      );
    }
  }
  await page.evaluate(async () => {
    const r = await window.__qa.login(
      'alex@morihome.example',
      'morihome2026',
      false,
    );
    window.__qa.session(r.session);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__MORI_NAVIGATE__);
  await font();
  await page.evaluate(() => window.__MORI_NAVIGATE__('waiting'));
  await page
    .getByRole('button', { name: '包件點貨／簽收', exact: true })
    .click();
  await choice(id, '破損（隔離）');
  await page
    .getByRole('textbox', { name: `處理記錄 ${id}`, exact: true })
    .fill('到貨外箱破損，等供應商回覆');
  await page.getByRole('button', { name: '儲存點貨結果', exact: true }).click();
  assert(
    await page.evaluate(
      (id) => window.__qa.get().packages.find((p) => p.id === id).quarantined,
      id,
    ),
    'mobile damage receipt quarantines package',
  );
  await page.screenshot({
    path: resultPath('receiving-mobile.png'),
    fullPage: false,
  });
  const dims = await page.getByRole('dialog').boundingBox();
  assert(
    dims.x >= 0 && dims.x + dims.width <= 391,
    'mobile dialog fits viewport',
  );
  await page
    .getByRole('button', { name: /^關\s*閉$/ })
    .last()
    .click();
  await page.waitForTimeout(200);
  await page
    .getByRole('button', { name: '包件點貨／簽收', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').first().click();
  await page
    .locator(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option',
    )
    .filter({ hasText: '直送客戶簽收' })
    .click();
  const directId = await page.evaluate(
    () =>
      window.__qa.get().packages.find((p) => p.location === 'customerTransit')
        .id,
  );
  await choice(directId, '已簽收');
  await page.getByRole('button', { name: '儲存簽收結果', exact: true }).click();
  assert(
    (await dialog.innerText()).includes('請填寫簽收人'),
    'mobile signature validation',
  );
  await dialog
    .getByText('簽收人（必填）', { exact: true })
    .locator('..')
    .getByRole('textbox')
    .fill('測試收貨人');
  await dialog
    .getByText('簽收憑據／確認方式（必填）', { exact: true })
    .locator('..')
    .getByRole('textbox')
    .fill('電話核對全部包件編號');
  await page.getByRole('button', { name: '儲存簽收結果', exact: true }).click();
  assert(
    await page.evaluate(
      (id) =>
        window.__qa.get().packages.find((p) => p.id === id).location ===
        'customer',
      directId,
    ),
    'mobile direct signature writes real receipt',
  );
  await page.screenshot({
    path: resultPath('signature-mobile.png'),
    fullPage: false,
  });
  assert(errors.length === 0, 'no browser runtime errors');
  fs.writeFileSync(
    resultPath('ui-results.json'),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2));
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  if (debugPage) {
    console.log(
      'FAILED BODY',
      (await debugPage.locator('body').innerText()).slice(-4500),
    );
    await debugPage.screenshot({
      path: resultPath('ui-failure.png'),
      fullPage: false,
    });
  }
  process.exit(1);
});
