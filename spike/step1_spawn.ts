// STEP 1 — THE GO/NO-GO (needs CLAUDE_CODE_OAUTH_TOKEN).
// Proves the full chain: Deno imports the Agent SDK (npm: / node-compat), query() spawns the
// EXTRACTED CLI, and a REAL Claude turn comes back. Mirrors adania-web lib/runtime/claude-agent-sdk.ts
// (maxTurns:1, allowedTools:[], permissionMode:"bypassPermissions"), adding pathToClaudeCodeExecutable.
//
// Run:  CLAUDE_CODE_OAUTH_TOKEN=... CLAUDE_CLI_PATH=<.../claude> deno task step1

import { query } from "npm:@anthropic-ai/claude-agent-sdk@0.3.183";
import { ensureClaudeCli } from "./lib/extract_cli.ts";

const cliPath = await ensureClaudeCli();
if (!Deno.env.get("CLAUDE_CODE_OAUTH_TOKEN")) {
  console.warn("No CLAUDE_CODE_OAUTH_TOKEN set — relying on the spawned CLI's ambient Claude Code login (if any).");
}
// A Claude Code OAuth token authenticates ONLY the Agent SDK path; an ANTHROPIC_API_KEY would win
// auth precedence, so clear it (matches the real runner's ensureOauthEnv).
Deno.env.delete("ANTHROPIC_API_KEY");

const prompt = Deno.args[0] ?? "Reply with exactly: deno-spike-ok";
let text = "";
for await (
  const m of query({
    prompt,
    options: {
      model: "claude-opus-4-8",
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowedTools: [],
      pathToClaudeCodeExecutable: cliPath,
    },
  }) as AsyncIterable<{ type: string; subtype?: string; result?: string }>
) {
  if (m.type === "result" && m.subtype === "success") text = m.result ?? "";
}
console.log("REPLY:", text || "(no text produced)");
Deno.exit(text ? 0 : 1);
