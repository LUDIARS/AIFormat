import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleRevision } from '../runtime/revision.mjs';

test('changing UX, predicate, implementation or policy invalidates the revision', () => {
  const root = mkdtempSync(join(tmpdir(), 'aiformat-ux-revision-'));
  try {
    for (const name of ['ux.md', 'predicate.mjs', 'implementation.mjs', 'policy.json']) writeFileSync(join(root, name), 'original', 'utf8');
    const original = sampleRevision(root);
    assert.equal(sampleRevision(root), original);
    for (const name of ['ux.md', 'predicate.mjs', 'implementation.mjs', 'policy.json']) {
      writeFileSync(join(root, name), 'changed', 'utf8');
      assert.notEqual(sampleRevision(root), original);
      writeFileSync(join(root, name), 'original', 'utf8');
      assert.equal(sampleRevision(root), original);
    }
  } finally {
    // root is the unique directory returned by mkdtempSync above, never user input.
    rmSync(root, { recursive: true });
  }
});
