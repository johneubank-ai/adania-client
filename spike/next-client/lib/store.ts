// File-backed store = the single source of truth across ALL Next server realms (route handlers,
// Server Actions, instrumentation, RSC) — module/globalThis singletons are NOT shared across them
// under deno desktop, but the filesystem is. node: APIs so `next build` (node) type-checks and deno runs it.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { APP_DIR } from "./config";

const FILE = `${APP_DIR}/state.json`;

export type AppState = {
  runtime: string; login: string; email: string;
  socket: string; turns: number; lastEvent: string; lastReply: string;
  pkceVerifier: string;
};

const DEFAULT: AppState = {
  runtime: "next.js + deno desktop",
  login: "signed out", email: "—",
  socket: "connecting…", turns: 0, lastEvent: "—", lastReply: "—",
  pkceVerifier: "",
};

export async function readState(): Promise<AppState> {
  try { return { ...DEFAULT, ...JSON.parse(await readFile(FILE, "utf8")) }; }
  catch { return { ...DEFAULT }; }
}

export async function patchState(patch: Partial<AppState>): Promise<AppState> {
  try { await mkdir(APP_DIR, { recursive: true }); } catch { /* exists */ }
  const next = { ...(await readState()), ...patch };
  await writeFile(FILE, JSON.stringify(next));
  return next;
}
