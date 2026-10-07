import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal } from '../src/orders/journal.ts';
import { createFixtureReceipt, serializeReceipt } from '../src/receipts/receipt.ts';

// Maintainer-only offline generator. Every chain observation below is invented.
// Never run during deployment or in the public receipt endpoint.
const folder = mkdtempSync(join(tmpdir(), 'remain-demo-'));
let journal: FixtureOrderJournal | undefined;
try {
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70,
    maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const binding = bindFixturePlan(plan, plan.evaluatedAtMs);
  const id = randomUUID(); journal = new FixtureOrderJournal(join(folder, 'journal.sqlite'));
  journal.reserve(id, binding);
  const wallet = '0x1111111111111111111111111111111111111111';
  const stock = '0x2222222222222222222222222222222222222222';
  const venue = '0x3333333333333333333333333333333333333333';
  const cash = '0x55d398326f99059ff775485246999027b3197955';
  const h = (n: string) => `0x${n.repeat(64)}`;
  const cashRaw = '25000000000000000000';
  journal.append(id, 0, { type: 'ATTEMPT_REHEARSAL', eventId: randomUUID(), atMs: binding.createdAtMs });
  journal.append(id, 1, { type: 'OBSERVE', eventId: randomUUID(), atMs: binding.createdAtMs + 1,
    status: 'FILLED', platformOrderId: 'fixture-order', txHash: h('1') });
  journal.append(id, 2, { type: 'RECONCILE', eventId: randomUUID(), atMs: binding.createdAtMs + 2,
    evidence: { mode: 'TEST_FIXTURE', chain: '56', wallet, stockToken: stock, cashToken: cash,
      orderId: 'fixture-order', txHash: h('1'), receiptStatus: 'SUCCESS', blockNumber: '100',
      blockHash: h('2'), parentHash: h('3'), canonicalHash: h('2'), headNumber: '111',
      confirmationsRequired: 12, before: { blockNumber: '99', blockHash: h('3'), stockRaw: '100', cashRaw: '0' },
      after: { blockNumber: '100', blockHash: h('2'), stockRaw: '75', cashRaw }, completeBlockTransfers: true,
      transfers: [{ token: stock, from: wallet, to: venue, amountRaw: '25', txHash: h('1'), logIndex: 0, removed: false },
        { token: cash, from: venue, to: wallet, amountRaw: cashRaw, txHash: h('1'), logIndex: 1, removed: false }] } });
  writeFileSync('web/demo-receipt.json', serializeReceipt(createFixtureReceipt(plan, journal, id, binding.createdAtMs + 3)));
} finally { journal?.close(); rmSync(folder, { recursive: true, force: true }); }
