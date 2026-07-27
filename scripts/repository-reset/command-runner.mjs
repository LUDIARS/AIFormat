import { spawnSync } from "node:child_process";

export function runCommand(
  command,
  args,
  {
    cwd = process.cwd(),
    env = process.env,
    timeoutMs = 120_000,
  } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`Cannot start ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    throw new Error(`${command} failed: ${detail}`);
  }
  return result.stdout.trim();
}
