// Explicit invocation only: no server, subprocess, git mutation, or file writes.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { completeTask } from './domain/complete-task.mjs';
import contract from './contracts/complete-task.contract.mjs';
import { observe } from './runtime/observe.mjs';
import { evaluateAcceptance } from './runtime/acceptance.mjs';
import { sampleRevision } from './runtime/revision.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const policy = JSON.parse(readFileSync(new URL('policy.json', import.meta.url), 'utf8'));
const revision = sampleRevision(root);
const runId = randomUUID();
const events = [];
const scenarios = [
  ['ready', [{ id: 'A-1', met: true }]],
  ['missing', [{ id: 'A-1', met: true }, { id: 'A-2', met: false }]],
  ['empty', []],
];
const outcomes = scenarios.map(([scenario, criteria]) => {
  const wrapped = observe(completeTask, contract, { runId, revision, scenario }, events);
  return { scenario, result: wrapped({ id: 'TASK-1', status: 'open', criteria }) };
});
const current = { runId, revision: sampleRevision(root) };
const receipt = { runId, revision, available: true, complete: true, events };
const verdict = evaluateAcceptance(policy, receipt, current);
// stdout is this CLI's explicit JSON data interface, not application logging.
process.stdout.write(`${JSON.stringify({ scope: 'sample-only', uxReview: 'draft-not-approved', outcomes, receipt, verdict }, null, 2)}\n`);
process.exitCode = verdict.accepted ? 0 : 1;
