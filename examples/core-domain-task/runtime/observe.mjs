// Synchronous reference adapter, not the Lapilli/Augur runtime API.
// One event per completed call; multiple failed predicates do not inflate calls.
import { performance } from 'node:perf_hooks';

export function observe(fn, contract, context, events) {
  if (typeof fn !== 'function' || !contract || typeof contract.id !== 'string' || !contract.id.trim()
    || typeof contract.post !== 'function' || typeof contract.postThrow !== 'function') {
    throw new TypeError('contract-missing-or-invalid');
  }
  if (['AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction'].includes(fn.constructor.name)) {
    throw new TypeError('async-is-outside-sample-contract');
  }
  if (!context?.runId || !context?.revision || !context?.scenario || !Array.isArray(events)) {
    throw new TypeError('observation-context-missing');
  }
  const identity = Object.freeze({ runId: context.runId, revision: context.revision, scenario: context.scenario, contractId: contract.id });
  const predicates = Object.freeze({ post: contract.post, postThrow: contract.postThrow });
  return function (...args) {
    // This sample deliberately accepts only structured-cloneable, synchronous inputs.
    const before = structuredClone(args);
    let result;
    let thrown;
    let didThrow = false;
    const started = performance.now();
    try { result = fn.apply(this, args); }
    catch (error) { didThrow = true; thrown = error; }
    const durationMs = performance.now() - started;
    if (!didThrow && result && typeof result.then === 'function') {
      throw new TypeError('async-is-outside-sample-contract');
    }
    let state = 'observed';
    let phase = didThrow ? 'postThrow' : 'post';
    try {
      const outcome = didThrow ? predicates.postThrow(thrown, before, args) : predicates.post(result, before, args);
      if (outcome !== true) state = 'violated';
    } catch {
      state = 'violated';
      phase = 'predicate';
    }
    // No arguments, return values, exception messages, or free-form predicate text in evidence.
    events.push(Object.freeze({ ...identity, state, phase, durationMs }));
    if (didThrow) throw thrown;
    return result;
  };
}
