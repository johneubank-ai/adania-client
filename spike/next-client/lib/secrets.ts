// Token storage. SPIKE: a 0600 file under the app dir. PROD: swap for the OS keychain
// (macOS Keychain / Windows Credential Manager / libsecret) — same read/store interface.
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { APP_DIR } from "./config";

const FILE = `${APP_DIR}/tokens.json`;

export async function storeTokens(tokens: unknown): Promise<void> {
  try { await mkdir(APP_DIR, { recursive: true }); } catch { /* exists */ }
  await writeFile(FILE, JSON.stringify(tokens), { mode: 0o600 });
  try { await chmod(FILE, 0o600); } catch { /* windows */ }
}

export async function readTokens(): Promise<any | null> {
  try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return null; }
}
