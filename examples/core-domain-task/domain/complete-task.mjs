// Pure domain operation. Observation and acceptance policy live outside this module.
/** @param {{id: string, status: 'open', criteria: {id: string, met: boolean}[]}} task */
export function completeTask(task) {
  if (!task || typeof task.id !== 'string' || !task.id.trim() || task.status !== 'open'
    || !Array.isArray(task.criteria)
    || Array.from(task.criteria).some((item) => !item || typeof item.id !== 'string' || !item.id.trim() || typeof item.met !== 'boolean')
    || new Set(task.criteria.map((item) => item.id)).size !== task.criteria.length) {
    throw new TypeError('invalid-task');
  }
  if (task.criteria.length === 0) {
    return { id: task.id, status: 'open', reason: 'missing-criteria', unmet: [] };
  }
  const unmet = task.criteria.filter((item) => !item.met).map((item) => item.id);
  return { id: task.id, status: unmet.length === 0 ? 'completed' : 'open', reason: unmet.length === 0 ? 'ready' : 'unmet-criteria', unmet };
}
