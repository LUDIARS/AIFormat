// Fingerprint this complete sample, including its policy, predicates and UX.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Content hash of the whole sample, used as the revision in observation evidence.
 * @implements spec/feature/task-completion.md 版は UX・契約・コード・ポリシーを含むサンプル全体の内容ハッシュ
 */
export function sampleRevision(root) {
  const files = [];
  function walk(relative) {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('sample-symlink-not-supported');
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error('sample-nonregular-file');
    }
  }
  walk('');
  const hash = createHash('sha256');
  for (const path of files.sort()) {
    const content = readFileSync(join(root, path));
    hash.update(`${Buffer.byteLength(path)}:${path}:${content.length}:`);
    hash.update(content);
  }
  return hash.digest('hex');
}
