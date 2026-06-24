// The background node, started idempotently from /api/state. Owns: the OAuth loopback callback listener,
// the /api/bots fetch (orgs + assigned Desktop-app bots + relay URLs), and the reverse SSE relay loop
// (dial OUT to the deployed relay, receive turns, run them locally via the Agent SDK, POST replies back).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { ADANIA_API, CALLBACK_PORT } from "./config";
import { exchangeCode, emailFromIdToken, verifyIdToken } from "./oauth";
import { readTokens, storeTokens } from "./secrets";
import { patchState, readState } from "./store";

// --- run a turn locally via the Agent SDK (CLI self-resolves from the embedded node_modules) ---
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

// --- fetch the member's orgs + assigned Desktop-app bots + relay URLs, then hold the SSE relay ---
let relayRunning = false;
async function bootSession(idToken: string): Promise<void> {
  let data: { orgs?: unknown[]; bots?: unknown[]; relay?: { events: string; reply: string } };
  try {
    const r = await fetch(`${ADANIA_API}/api/bots`, { headers: { authorization: `Bearer ${idToken}` } });
    if (!r.ok) {
      await patchState({ socket: `bots fetch ${r.status}` });
      return;
    }
    data = await r.json();
  } catch (e) {
    await patchState({ socket: `bots fetch error: ${(e as Error).message}` });
    return;
  }
  await patchState({
    orgsJson: JSON.stringify(data.orgs ?? []),
    botsJson: JSON.stringify(data.bots ?? []),
    relayEvents: data.relay?.events ?? "",
    relayReply: data.relay?.reply ?? "",
  });
  if (data.relay?.events && data.relay?.reply && !relayRunning) {
    relayRunning = true;
    void relayLoop(idToken, data.relay.events, data.relay.reply);
  }
}

// Reverse connection: dial the SSE endpoint with the Bearer token (fetch streaming — EventSource can't set
// auth headers), parse `event: turn` frames, run each locally, POST the reply, reconnect with backoff.
async function relayLoop(token: string, eventsUrl: string, replyUrl: string): Promise<void> {
  let backoff = 1000;
  for (;;) {
    try {
      const res = await fetch(eventsUrl, { headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" } });
      if (!res.ok || !res.body) {
        await patchState({ socket: `relay ${res.status}` });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15000);
        continue;
      }
      await patchState({ socket: "connected" });
      backoff = 1000;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx = buf.indexOf("\n\n");
        while (idx !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          await handleFrame(frame, token, replyUrl);
          idx = buf.indexOf("\n\n");
        }
      }
    } catch (e) {
      await patchState({ socket: `reconnecting (${(e as Error).message})` });
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 15000);
  }
}

async function handleFrame(frame: string, token: string, replyUrl: string): Promise<void> {
  const lines = frame.split("\n");
  const isTurn = lines.some((l) => l.startsWith("event: turn"));
  const dataLine = lines.find((l) => l.startsWith("data:"));
  if (!isTurn || !dataLine) return; // heartbeat / comment
  let turn: { id: string; payload: { messages?: { role: string; content: string }[] } };
  try {
    turn = JSON.parse(dataLine.slice(5).trim());
  } catch {
    return;
  }
  const reply = await runTurn(turn.payload?.messages ?? []);
  const s = await readState();
  await patchState({ turns: s.turns + 1, lastEvent: turn.id, lastReply: reply });
  try {
    await fetch(replyUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ turnId: turn.id, reply }),
    });
  } catch {
    /* the turn will time out + become a missed event on the server; portal Retry covers it */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- OAuth loopback callback (the desktop completes sign-in here) ---
async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end();
    return;
  }
  const code = url.searchParams.get("code");
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><meta charset=utf-8><body style='font:16px system-ui;padding:2rem'><h2>Signed in ✓</h2><p>You can return to Adania Client.</p>");
  if (!code) return;
  try {
    const { pkceVerifier } = await readState();
    const tok = await exchangeCode(code, pkceVerifier);
    await verifyIdToken(tok.id_token ?? ""); // JWKS RS256 verification (throws if invalid)
    await storeTokens(tok); // OS keychain
    await patchState({ login: "signed in", email: emailFromIdToken(tok.id_token ?? ""), pkceVerifier: "" });
    await bootSession(tok.id_token);
  } catch (e) {
    await patchState({ login: "sign-in failed: " + ((e as Error).message ?? String(e)) });
  }
}

let attempted = false;
export function startAgentNode(): void {
  if (attempted) return;
  attempted = true;
  const srv = createServer(handleCallback);
  srv.on("error", () => {
    /* EADDRINUSE → another realm owns the node */
  });
  srv.on("listening", async () => {
    // Resume on app restart: if a token is already stored, boot the session immediately.
    const tok = await readTokens();
    if (tok?.id_token) {
      try {
        await verifyIdToken(tok.id_token);
        await patchState({ login: "signed in", email: emailFromIdToken(tok.id_token) });
        await bootSession(tok.id_token);
      } catch {
        /* expired/invalid stored token — user signs in again */
      }
    }
  });
  srv.listen(CALLBACK_PORT, "127.0.0.1");
}

// Launch the system browser for the Sign-in Server Action.
export function openBrowser(url: string): void {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}
