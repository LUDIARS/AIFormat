import { spawnSync } from "node:child_process";

function runGit(gitDirectory, args, input = undefined, encoding = "utf8") {
  const result = spawnSync("git", [`--git-dir=${gitDirectory}`, ...args], {
    encoding,
    input,
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `git ${args[0]} failed.`);
  }
  return result.stdout;
}

function replacementPatterns(keywords) {
  return [...keywords]
    .sort((left, right) => right.value.length - left.value.length)
    .map((keyword) => ({
      replacement: `<${keyword.id}>`,
      pattern: new RegExp(
        keyword.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "giu",
      ),
    }));
}

function scrubTextBuffer(buffer, patterns) {
  if (buffer.includes(0)) return buffer;
  const original = buffer.toString("utf8");
  let scrubbed = original;
  for (const { pattern, replacement } of patterns) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed === original ? buffer : Buffer.from(scrubbed, "utf8");
}

function stripSignatureHeaders(lines) {
  const result = [];
  let skipping = false;
  for (const line of lines) {
    if (/^(gpgsig|mergetag) /.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && line.startsWith(" ")) continue;
    skipping = false;
    result.push(line);
  }
  return result;
}

export function rewriteHistoryRef({
  gitDirectory,
  sourceRef,
  targetRef,
  keywords,
}) {
  const patterns = replacementPatterns(keywords);
  const blobMap = new Map();
  const treeMap = new Map();
  const commitMap = new Map();

  function rewriteBlob(oid) {
    if (blobMap.has(oid)) return blobMap.get(oid);
    const content = runGit(gitDirectory, ["cat-file", "blob", oid], undefined, null);
    const scrubbed = scrubTextBuffer(content, patterns);
    const rewritten = scrubbed === content
      ? oid
      : runGit(gitDirectory, ["hash-object", "-w", "--stdin"], scrubbed).trim();
    blobMap.set(oid, rewritten);
    return rewritten;
  }

  function rewriteTree(oid) {
    if (treeMap.has(oid)) return treeMap.get(oid);
    const output = runGit(gitDirectory, ["ls-tree", "-z", oid], undefined, null);
    const records = output.toString("utf8").split("\0").filter(Boolean);
    const rewrittenRecords = [];
    let changed = false;

    for (const record of records) {
      const tab = record.indexOf("\t");
      const metadata = record.slice(0, tab);
      const path = record.slice(tab + 1);
      const [mode, type, childOid] = metadata.split(" ");
      const rewrittenChild = type === "tree"
        ? rewriteTree(childOid)
        : type === "blob"
          ? rewriteBlob(childOid)
          : childOid;
      if (rewrittenChild !== childOid) changed = true;
      rewrittenRecords.push(`${mode} ${type} ${rewrittenChild}\t${path}\0`);
    }

    const rewritten = changed
      ? runGit(
        gitDirectory,
        ["mktree", "-z"],
        Buffer.from(rewrittenRecords.join(""), "utf8"),
      ).trim()
      : oid;
    treeMap.set(oid, rewritten);
    return rewritten;
  }

  function rewriteCommit(oid) {
    const raw = runGit(gitDirectory, ["cat-file", "commit", oid], undefined, null);
    const separator = raw.indexOf(Buffer.from("\n\n"));
    const headers = stripSignatureHeaders(
      raw.subarray(0, separator).toString("utf8").split("\n"),
    );
    const message = scrubTextBuffer(raw.subarray(separator + 2), patterns);
    const rewrittenHeaders = headers.map((line) => {
      if (line.startsWith("tree ")) {
        return `tree ${rewriteTree(line.slice(5))}`;
      }
      if (line.startsWith("parent ")) {
        const parent = line.slice(7);
        const rewrittenParent = commitMap.get(parent);
        if (!rewrittenParent) {
          throw new Error("Commit parent was not rewritten before its child.");
        }
        return `parent ${rewrittenParent}`;
      }
      return line;
    });
    const rewrittenRaw = Buffer.concat([
      Buffer.from(`${rewrittenHeaders.join("\n")}\n\n`, "utf8"),
      message,
    ]);
    const rewritten = runGit(
      gitDirectory,
      ["hash-object", "-t", "commit", "-w", "--stdin"],
      rewrittenRaw,
    ).trim();
    commitMap.set(oid, rewritten);
    return rewritten;
  }

  const commits = runGit(gitDirectory, [
    "rev-list",
    "--reverse",
    "--topo-order",
    sourceRef,
  ]).trim().split(/\r?\n/).filter(Boolean);
  for (const commit of commits) rewriteCommit(commit);

  const rewrittenTip = commitMap.get(commits.at(-1));
  runGit(gitDirectory, ["update-ref", targetRef, rewrittenTip]);
  return {
    sourceTip: commits.at(-1),
    rewrittenTip,
    commitCount: commits.length,
    rewrittenBlobCount: [...blobMap]
      .filter(([before, after]) => before !== after)
      .length,
  };
}
