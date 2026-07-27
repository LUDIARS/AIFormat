import { resolve } from "node:path";

export function resolveWorkspaceRoot(explicitPath) {
  const configuredPath = explicitPath || process.env.LUDIARS_BASE;
  if (!configuredPath?.trim()) {
    throw new Error(
      "Workspace root is required. Pass it as an argument or set LUDIARS_BASE.",
    );
  }
  return resolve(configuredPath.trim());
}
