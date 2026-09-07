// Independent oracle: never call completeTask from its own contract.
import { isDeepStrictEqual } from 'node:util';

// INV-1: a task is well formed only with a non-empty id, 'open' status and an
// array of criteria carrying unique ids and boolean met flags.
function isWellFormedTask(task) {
  return Boolean(task) && typeof task.id === 'string' && task.id.trim() !== ''
    && task.status === 'open' && Array.isArray(task.criteria)
    && Array.from(task.criteria).every((item) => Boolean(item)
      && typeof item.id === 'string' && item.id.trim() !== '' && typeof item.met === 'boolean')
    && new Set(task.criteria.map((item) => item.id)).size === task.criteria.length;
}

export default {
  id: 'C-1',
  post(result, before, after) {
    const [original] = before;
    if (!isDeepStrictEqual(before, after)) return 'input-mutated';
    // A malformed task must be rejected by throwing, never answered with a result.
    if (!isWellFormedTask(original)) return 'invalid-task-must-throw';
    if (!result || typeof result !== 'object') return 'result-not-an-object';
    if (result.id !== original.id) return 'task-identity-changed';
    const unmet = [];
    let expectedStatus = 'completed';
    let expectedReason = 'ready';
    if (original.criteria.length === 0) {
      expectedStatus = 'open';
      expectedReason = 'missing-criteria';
    }
    for (const item of original.criteria) {
      if (!item.met) {
        unmet.push(item.id);
        expectedStatus = 'open';
        expectedReason = 'unmet-criteria';
      }
    }
    return (result.status === expectedStatus && result.reason === expectedReason && isDeepStrictEqual(result.unmet, unmet))
      || 'completion-does-not-match-criteria';
  },
  // Throwing is contracted only for malformed input (INV-1); a well formed task
  // must produce a business result instead.
  postThrow(error, before, after) {
    const [original] = before;
    if (!isDeepStrictEqual(before, after)) return 'input-mutated';
    if (isWellFormedTask(original)) return 'unexpected-throw-for-valid-task';
    return error instanceof TypeError || 'invalid-task-must-throw-type-error';
  },
};
