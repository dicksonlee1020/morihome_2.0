// Loaded only by the test-browser build. Production bundles exclude this module.
import * as ops from '../../src/data/ops';
import { products } from '../../src/data/catalog';
import { lineStatus } from '../../src/domain/derive';
import { signInWithPassword } from '../../src/auth/mockAuthService';
import { writeStoredSession } from '../../src/auth/AuthProvider';
import { can } from '../../src/config/permissions';
import { moriReviewConfirmationFile } from '../../src/utils/purchaseSheet';
const q = {
  get: ops.getOps,
  reset: (s: ops.OpsState) => ops.commit(structuredClone(s)),
  products: () => products,
  product: ops.productOf,
  manual: ops.moriCreateManualRequirement,
  batch: ops.createPurchaseOrder,
  confirm: ops.confirmOrdered,
  review: moriReviewConfirmationFile,
  stock: ops.moriAvailableStock,
  summary: ops.moriStockSummary,
  live: ops.moriLiveProducts,
  restock: ops.moriRestockProducts,
  units: ops.moriUnitGroups,
  available: ops.moriAvailableUnits,
  reallocate: ops.moriReallocatePackages,
  source: ops.moriSetFulfilment,
  replenish: ops.moriSetReplenish,
  ship: ops.moriManualShip,
  transfer: ops.moriTransferHK,
  status: ops.requirementStatus,
  bucket: lineStatus,
  waiting: ops.waitingGroups,
  rows: () => ops.moriWorkbenchRows(ops.getOps()),
  saveReceipt: ops.moriSaveReceipt,
  receiptRows: ops.moriReceivingRows,
  receiptSearch: ops.moriReceivingSearch,
  receivingOpen: ops.moriOpenReceivingTask,
  importMatch: ops.matchShipment,
  importApply: ops.applyShipment,
  ready: (order: string) =>
    lineStatus(ops.packagesOfOrder(ops.getOps(), order)),
  login: signInWithPassword,
  session: writeStoredSession,
  permission: can,
  booking: ops.scheduleOrder,
};
Object.assign(window, { __qa: q });
