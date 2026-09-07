// The caller owns policy and current identity; never derive them from a receipt.
export function evaluateAcceptance(policy, receipt, current) {
  const reject = (reason) => ({ accepted: false, reason });
  const required = policy?.requiredContracts;
  if (!Array.isArray(required) || required.length === 0
    || Array.from(required).some((entry) => !entry || typeof entry.id !== 'string' || !entry.id.trim()
      || !Array.isArray(entry.scenarios) || entry.scenarios.length === 0
      || Array.from(entry.scenarios).some((name) => typeof name !== 'string' || !name.trim())
      || new Set(entry.scenarios).size !== entry.scenarios.length)
    || new Set(required.map((entry) => entry.id)).size !== required.length) return reject('required-contracts-missing-or-invalid');
  if (typeof current?.runId !== 'string' || !current.runId.trim()
    || typeof current?.revision !== 'string' || !current.revision.trim()) return reject('current-identity-missing');
  if (receipt?.available !== true) return reject('observation-unavailable');
  if (receipt.complete !== true) return reject('run-incomplete');
  if (receipt.runId !== current.runId || receipt.revision !== current.revision) return reject('stale-receipt');
  if (!Array.isArray(receipt.events)) return reject('evidence-missing');
  const active = receipt.events.filter((event) => event?.runId === current.runId && event.revision === current.revision);
  if (active.some((event) => event.state !== 'observed' && event.state !== 'violated')) return reject('invalid-event');
  if (active.some((event) => event.state === 'violated')) return reject('contract-violated');
  for (const entry of required) {
    for (const scenario of entry.scenarios) {
      if (!active.some((event) => event.contractId === entry.id && event.scenario === scenario && event.state === 'observed')) {
        return reject(`uncovered:${entry.id}:${scenario}`);
      }
    }
  }
  return { accepted: true, reason: 'required-scenarios-observed' };
}
