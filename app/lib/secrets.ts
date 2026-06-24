// Token storage. PROD-style: the OS keychain (macOS Keychain via the `security` CLI), with a 0600 file
// fallback on other platforms. Same store/read interface as before. (Replaces the spike's plain 0600 file.)
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { APP_DIR } from "./config";

const exec = promisify(execFile);
const SERVICE = "adania-client";
const ACCOUNT = "tokens";
const FILE = `${APP_DIR}/tokens.json`;

export async function storeTokens(tokens: unknown): Promise<void> {
  const json = JSON.stringify(tokens);
  if (process.platform === "darwin") {
    try {
      // -U updates if present. (Token is the member's own session on their own machine.)
      await exec("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", json]);
      return;
    } catch {
      /* fall through to file */
    }
  }
  try {
    await mkdir(APP_DIR, { recursive: true });
  } catch {
    /* exists */
  }
  await writeFile(FILE, json, { mode: 0o600 });
}

export async function readTokens(): Promise<any | null> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await exec("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]);
      return JSON.parse(stdout.trim());
    } catch {
      /* not in keychain — try file */
    }
  }
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return null;
  }
}
