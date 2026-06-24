// The single background owner. Started idempotently from the /api/state route. Uses the loopback
// listen on CALLBACK_PORT as a cross-realm/process MUTEX: whichever realm binds it owns the WS too,
// so we never get duplicate connections. All shared state goes through the file-backed store.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { CALLBACK_PORT, GATEWAY_URL, HELLO_TOKEN } from "./config";
import { patchState, readState } from "./store";
import { exchangeCode, emailFromIdToken } from "./oauth";
import { storeTokens } from "./secrets";

async function runTurn(messages: { role: string; content: string }[]): Promise<string> {
  try {
    delete process.env.ANTHROPIC_API_KEY; // a Claude Code OAuth token must win auth precedence
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    let text = "";
    for await (
      const m of query({
        prompt,
        options: { model: "claude-opus-4-8", maxTurns: 1, permissionMode: "bypassPermissions", allowedTools: [] },
      }) as AsyncIterable<{ type: string; subtype?: string; result?: string }>
    ) {
      if (m.type === "result" && m.subtype === "success") text = m.result ?? "";
    }
    return text || "(no text)";
  } catch (e) {
    return "⚠️ " + ((e as Error)?.message ?? String(e));
  }
}

function connectWS() {
  let backoff = 500;
  const connect = () => {
    const ws = new WebSocket(GATEWAY_URL);
    ws.onopen = () => {
      patchState({ socket: "connected" });
      backoff = 500;
      ws.send(JSON.stringify({ type: "hello", token: HELLO_TOKEN }));
      setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
    };
    ws.onmessage = async (e: MessageEvent) => {
      let f: any;
      try { f = JSON.parse(e.data); } catch { return; }
      if (f.type === "event") {
        const reply = await runTurn(f.payload?.messages ?? []);
        const s = await readState();
        await patchState({ turns: s.turns + 1, lastEvent: f.requestId ?? "event", lastReply: reply });
        ws.send(JSON.stringify({ type: "reply", requestId: f.requestId, reply }));
      }
    };
    ws.onclose = () => { patchState({ socket: "reconnecting…" }); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15_000); };
    ws.onerror = () => {};
  };
  connect();
}

async function handleCallback(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
  if (url.pathname !== "/callback") { res.writeHead(404); res.end(); return; }
  const code = url.searchParams.get("code");
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><meta charset=utf-8><body style='font:16px system-ui;padding:2rem'><h2>Signed in ✓</h2><p>You can return to Adania Client.</p>");
  if (!code) return;
  try {
    const { pkceVerifier } = await readState();
    const tok = await exchangeCode(code, pkceVerifier);
    await storeTokens(tok);
    const email = emailFromIdToken(tok.id_token ?? "");
    await patchState({ login: "signed in", email, pkceVerifier: "" });
  } catch (e) {
    await patchState({ login: "sign-in failed: " + ((e as Error).message ?? String(e)) });
  }
}

let attempted = false;
export function startAgentNode() {
  if (attempted) return; // per-realm guard; the port bind below is the real cross-realm mutex
  attempted = true;
  const srv = createServer(handleCallback);
  srv.on("error", () => { /* EADDRINUSE → another realm already owns the node; do nothing */ });
  srv.on("listening", () => { connectWS(); }); // only the realm that wins the port runs the WS
  srv.listen(CALLBACK_PORT, "127.0.0.1");
}

// Helper used by the Sign-in Server Action to launch the system browser.
export function openBrowser(url: string) {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}
