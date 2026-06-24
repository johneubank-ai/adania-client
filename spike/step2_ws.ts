// STEP 2 — reverse-WS client (runs on STABLE deno; uses a MOCK turn when no token is set).
// Proves the reverse-tunnel mechanics on Deno: dial OUTBOUND, authenticate with a hello frame
// (HMAC-handshake stand-in), receive an event frame, run the turn, return a reply frame keyed by
// requestId, with a heartbeat + exponential-backoff reconnect. Outbound-dial = no inbound tunnel.
//
// Run (in another terminal after `deno task gateway`):  deno task step2
// With a real turn:  CLAUDE_CODE_OAUTH_TOKEN=... CLAUDE_CLI_PATH=<.../claude> deno task step2

import { ensureClaudeCli } from "./lib/extract_cli.ts";
import { query } from "npm:@anthropic-ai/claude-agent-sdk@0.3.183";

const GATEWAY = Deno.env.get("GATEWAY_URL") ?? "ws://localhost:8787";
const HELLO_TOKEN = Deno.env.get("HELLO_TOKEN") ?? "dev-secret";
const OAUTH = Deno.env.get("CLAUDE_CODE_OAUTH_TOKEN");
const cliPath = await ensureClaudeCli();

async function runTurn(messages: { role: string; content: string }[]): Promise<string> {
  if (!OAUTH) return "(mock reply — set CLAUDE_CODE_OAUTH_TOKEN for a real turn)";
  Deno.env.delete("ANTHROPIC_API_KEY");
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  let text = "";
  for await (
    const m of query({
      prompt,
      options: { model: "claude-opus-4-8", maxTurns: 1, permissionMode: "bypassPermissions", allowedTools: [], pathToClaudeCodeExecutable: cliPath },
    }) as AsyncIterable<{ type: string; subtype?: string; result?: string }>
  ) {
    if (m.type === "result" && m.subtype === "success") text = m.result ?? "";
  }
  return text || "(no text)";
}

let backoff = 500;
let pingTimer: number | undefined;

function connect() {
  const ws = new WebSocket(GATEWAY);
  ws.onopen = () => {
    console.log("connected to", GATEWAY);
    backoff = 500;
    ws.send(JSON.stringify({ type: "hello", token: HELLO_TOKEN })); // HMAC-handshake stand-in
    pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
  };
  ws.onmessage = async (e) => {
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(e.data);
    } catch {
      return;
    }
    if (f.type === "event") {
      const payload = f.payload as { messages: { role: string; content: string }[] };
      const reply = await runTurn(payload.messages);
      ws.send(JSON.stringify({ type: "reply", requestId: f.requestId, reply }));
      console.log(`handled ${f.requestId} -> ${reply}`);
    }
  };
  ws.onclose = () => {
    if (pingTimer) clearInterval(pingTimer);
    console.log(`disconnected; reconnecting in ${backoff}ms`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15_000);
  };
  ws.onerror = () => {/* onclose follows */};
}

connect();
