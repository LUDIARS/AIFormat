import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTask } from '../domain/complete-task.mjs';
import contract from '../contracts/complete-task.contract.mjs';
import { observe } from '../runtime/observe.mjs';

const context = { runId: 'test-run', revision: 'test-revision', scenario: 'missing' };

test('all satisfied criteria complete without altering the input', () => {
  const task = { id: 'T', status: 'open', criteria: [{ id: 'a', met: true }] };
  const before = structuredClone(task);
  const events = [];
  const result = observe(completeTask, contract, { ...context, scenario: 'ready' }, events)(task);
  assert.deepEqual(result, { id: 'T', status: 'completed', reason: 'ready', unmet: [] });
  assert.deepEqual(task, before);
  assert.equal(events[0].state, 'observed');
});

test('unmet criteria stay open and identify the next required work without mutation', () => {
  const task = { id: 'T', status: 'open', criteria: [{ id: 'a', met: true }, { id: 'b', met: false }] };
  const before = structuredClone(task);
  const events = [];
  const result = observe(completeTask, contract, context, events)(task);
  assert.deepEqual(result, { id: 'T', status: 'open', reason: 'unmet-criteria', unmet: ['b'] });
  assert.deepEqual(task, before);
  assert.equal(events[0].state, 'observed');
});

test('empty criteria cannot vacuously complete a task', () => {
  const events = [];
  const result = observe(completeTask, contract, { ...context, scenario: 'empty' }, events)({ id: 'T', status: 'open', criteria: [] });
  assert.equal(result.status, 'open');
  assert.equal(result.reason, 'missing-criteria');
  assert.equal(events[0].state, 'observed');
});

test('a deliberately wrong implementation is detected while its return remains observable', () => {
  const wrong = () => ({ id: 'T', status: 'completed', reason: 'ready', unmet: [] });
  const events = [];
  const result = observe(wrong, contract, context, events)({ id: 'T', status: 'open', criteria: [{ id: 'a', met: false }] });
  assert.equal(result.status, 'completed');
  assert.equal(events[0].state, 'violated');
});

test('a snapshot catches mutation even if the final result looks correct', () => {
  const wrong = (task) => {
    task.criteria[0].met = true;
    return { id: task.id, status: 'completed', reason: 'ready', unmet: [] };
  };
  const events = [];
  observe(wrong, contract, context, events)({ id: 'T', status: 'open', criteria: [{ id: 'a', met: false }] });
  assert.equal(events[0].state, 'violated');
});

test('original exceptions propagate and predicate exceptions never count as success', () => {
  const original = new Error('private-task-data');
  const events = [];
  const wrapped = observe(() => { throw original; }, { id: 'C-1', post: () => true, postThrow: () => { throw new Error('private-predicate-data'); } }, context, events);
  assert.throws(() => wrapped(), (error) => error === original);
  assert.equal(events[0].phase, 'predicate');
  assert.equal(events[0].state, 'violated');
  assert.equal(JSON.stringify(events).includes('private-'), false);
});

test('a missing predicate is refused before calling the implementation', () => {
  let called = false;
  assert.throws(() => observe(() => { called = true; }, {}, context, []), /contract-missing/);
  assert.equal(called, false);
});

test('duplicate criteria are invalid and do not change the input', () => {
  const task = { id: 'T', status: 'open', criteria: [{ id: 'a', met: true }, { id: 'a', met: false }] };
  const before = structuredClone(task);
  assert.throws(() => completeTask(task), /invalid-task/);
  assert.deepEqual(task, before);
});

test('a hole in the criteria array is invalid rather than satisfied', () => {
  assert.throws(() => completeTask({ id: 'T', status: 'open', criteria: new Array(1) }), /invalid-task/);
});

test('rejecting malformed input under observation is contracted, not a violation', () => {
  const events = [];
  const wrapped = observe(completeTask, contract, { ...context, scenario: 'invalid' }, events);
  assert.throws(() => wrapped({ id: 'T', status: 'open', criteria: [{ id: 'a', met: 'yes' }] }), /invalid-task/);
  assert.equal(events[0].phase, 'postThrow');
  assert.equal(events[0].state, 'observed');
});

test('answering malformed input with a result instead of throwing is a violation', () => {
  const lenient = () => ({ id: 'T', status: 'completed', reason: 'ready', unmet: [] });
  const events = [];
  observe(lenient, contract, { ...context, scenario: 'invalid' }, events)({ id: 'T', status: 'open', criteria: [{ id: 'a', met: 'yes' }] });
  assert.equal(events[0].state, 'violated');
});
