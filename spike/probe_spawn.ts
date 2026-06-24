// PROBE (no OAuth token needed) — runs on STABLE deno.
// Proves the load-bearing HALF of Step 1: that Deno can spawn the Claude Code CLI native binary
// via node:child_process. If this exits 0, Deno's subprocess + native-binary execution works;
// the only remaining Step-1 unknown is the SDK <-> CLI handshake (proved by step1_spawn.ts).
//
// Run:  CLAUDE_CLI_PATH=<path-to-node_modules/.../claude> deno task probe
//   or: (after copying the binary to ./vendor/claude)               deno task probe

import { spawn } from "node:child_process";
import { ensureClaudeCli } from "./lib/extract_cli.ts";

const cli = await ensureClaudeCli();
console.log("Resolved CLI path:", cli);

const child = spawn(cli, ["--version"], { stdio: "inherit" });
const code: number = await new Promise((resolve) => {
  child.on("exit", (c) => resolve(c ?? -1));
  child.on("error", (e) => {
    console.error("spawn error:", e.message);
    resolve(-1);
  });
});

console.log(code === 0 ? "PROBE OK — Deno spawned the CLI binary." : `PROBE FAIL (exit ${code})`);
Deno.exit(code === 0 ? 0 : 1);
