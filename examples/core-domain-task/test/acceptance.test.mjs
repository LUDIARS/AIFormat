import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAcceptance } from '../runtime/acceptance.mjs';

const policy = { requiredContracts: [{ id: 'C-1', scenarios: ['ready', 'missing', 'empty'] }] };
const current = { runId: 'run-2', revision: 'revision-2' };
function goodReceipt() {
  return { ...current, available: true, complete: true, events: policy.requiredContracts[0].scenarios.map((scenario) => ({ ...current, contractId: 'C-1', scenario, state: 'observed' })) };
}

test('every required scenario is needed, not just one successful call', () => {
  assert.equal(evaluateAcceptance(policy, goodReceipt(), current).accepted, true);
  const incomplete = goodReceipt();
  incomplete.events.pop();
  assert.equal(evaluateAcceptance(policy, incomplete, current).accepted, false);
});

test('deleting all contracts or observations never passes', () => {
  assert.equal(evaluateAcceptance({ requiredContracts: [] }, goodReceipt(), current).accepted, false);
  assert.equal(evaluateAcceptance(policy, { ...goodReceipt(), events: [] }, current).accepted, false);
  assert.equal(evaluateAcceptance({ requiredContracts: [null] }, goodReceipt(), current).accepted, false);
  assert.equal(evaluateAcceptance({ requiredContracts: new Array(1) }, goodReceipt(), current).accepted, false);
});

test('old pass events cannot be relabelled using the receipt envelope', () => {
  for (const old of [{ revision: 'revision-1' }, { runId: 'run-1' }]) {
    const receipt = goodReceipt();
    receipt.events = receipt.events.map((event) => ({ ...event, ...old }));
    assert.equal(evaluateAcceptance(policy, receipt, current).accepted, false);
  }
});

test('any current violation fails; historical violations do not poison a new run', () => {
  const receipt = goodReceipt();
  receipt.events.push({ ...receipt.events[0], state: 'violated' });
  assert.equal(evaluateAcceptance(policy, receipt, current).accepted, false);
  receipt.events.at(-1).runId = 'run-1';
  assert.equal(evaluateAcceptance(policy, receipt, current).accepted, true);
});

test('unavailable, incomplete and stale receipts fail closed', () => {
  for (const change of [{ available: false }, { complete: false }, { revision: 'revision-1' }, { runId: 'run-1' }]) {
    assert.equal(evaluateAcceptance(policy, { ...goodReceipt(), ...change }, current).accepted, false);
  }
});
