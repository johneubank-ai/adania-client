// INTEGRATED spike — the first artifact shaped like the real product:
//   - serves a status UI (Deno.serve)
//   - runs the reverse-WS client + agent runner in the BACKGROUND
//   - tray icon + hide-on-close so the socket stays alive when the window is closed (load-bearing)
//   - guarded Deno.autoUpdate()
// Desktop APIs are feature-detected (canary 2.8.3 vs 2.9-docs) so it also runs headless under `deno run`.
//
// Build:  deno desktop --output bin/AdaniaClient.app --include vendor/claude \
//           --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net app.ts
// Dev:    deno run -A app.ts        (headless: server + WS, no window)

import { ensureClaudeCli } from "./lib/extract_cli.ts";
import { query } from "npm:@anthropic-ai/claude-agent-sdk@0.3.183";

const PORT = Number(Deno.env.get("UI_PORT") ?? "8912");
const GATEWAY = Deno.env.get("GATEWAY_URL") ?? "ws://localhost:8799";
const HELLO_TOKEN = Deno.env.get("HELLO_TOKEN") ?? "dev-secret";
const OAUTH = Deno.env.get("CLAUDE_CODE_OAUTH_TOKEN");
const cliPath = await ensureClaudeCli();

const state = {
  runtime: (globalThis as any).Deno?.BrowserWindow ? "deno desktop" : "headless (deno run)",
  cli: cliPath,
  auth: OAUTH ? "env token" : "ambient Claude Code keychain",
  socket: "connecting…",
  turns: 0,
  lastEvent: "—",
  lastReply: "—",
};

async function runTurn(messages: { role: string; content: string }[]): Promise<string> {
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
function connect() {
  const ws = new WebSocket(GATEWAY);
  ws.onopen = () => {
    state.socket = "connected";
    backoff = 500;
    ws.send(JSON.stringify({ type: "hello", token: HELLO_TOKEN }));
    setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
  };
  ws.onmessage = async (e) => {
    let f: any;
    try { f = JSON.parse(e.data); } catch { return; }
    if (f.type === "event") {
      state.lastEvent = f.requestId ?? "event";
      const reply = await runTurn(f.payload?.messages ?? []);
      state.turns++;
      state.lastReply = reply;
      ws.send(JSON.stringify({ type: "reply", requestId: f.requestId, reply }));
    }
  };
  ws.onclose = () => { state.socket = "reconnecting…"; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15_000); };
  ws.onerror = () => {};
}
connect();

const HTML = `<!doctype html><meta charset=utf-8><title>Adania Client</title>
<body style="font:15px/1.5 system-ui;margin:0;background:#0b1020;color:#e7ecff">
<div style="max-width:680px;margin:0 auto;padding:28px">
  <h1 style="margin:.2em 0">Adania Client <span style="font-size:.5em;color:#7f8db0;vertical-align:middle">spike · integrated</span></h1>
  <p style="color:#9fb0d8;margin-top:0">Login UI + background agent runner + reverse-WS, in one Deno Desktop app.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tbody id=t></tbody>
  </table>
</div>
<script>
const rows = [["Runtime","runtime"],["Socket","socket"],["Turns handled","turns"],["Last event","lastEvent"],["Last reply","lastReply"],["Auth","auth"],["CLI path","cli"]];
async function tick(){
  const s = await (await fetch("/state")).json();
  document.getElementById("t").innerHTML = rows.map(([label,k])=>{
    const v = String(s[k]); const ok = k==="socket" && v==="connected";
    return "<tr><td style='padding:7px 10px;border-bottom:1px solid #1d2742;color:#9fb0d8;white-space:nowrap'>"+label+
      "</td><td style='padding:7px 10px;border-bottom:1px solid #1d2742;font-family:ui-monospace,monospace;"+
      (ok?'color:#4ade80':'')+"'>"+v+"</td></tr>";
  }).join("");
}
setInterval(tick,1000); tick();
</script>`;

Deno.serve({ port: PORT, onListen: () => console.log(`UI on http://127.0.0.1:${PORT}`) }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/state") return Response.json(state);
  return new Response(HTML, { headers: { "content-type": "text/html" } });
});

// ---- Desktop shell (feature-detected; absent under plain `deno run`) ----
const D = Deno as any;
if (D.BrowserWindow) {
  const win = new D.BrowserWindow({ title: "Adania Client (spike)", width: 720, height: 560, url: `http://127.0.0.1:${PORT}/` });
  // hide-on-close → process keeps running in the tray, so the reverse-WS socket stays alive
  win.addEventListener?.("close", (e: any) => { e.preventDefault?.(); win.hide?.(); });

  if (D.Tray) {
    try {
      const tray = new D.Tray();
      // a 16x16 PNG (solid square) — setIcon wants BYTES, not a path
      const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVR42mNgGAWjYBSMglEwCkbBKBgFo4AeAAANEAABEi7n9wAAAABJRU5ErkJggg==";
      const bytes = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
      tray.setIcon?.(bytes);
      tray.setMenu?.([
        { item: { label: "Show Adania Client", id: "show", enabled: true } },
        "separator",
        { item: { label: "Quit", id: "quit", enabled: true } },
      ]);
      tray.addEventListener?.("menuclick", (e: any) => {
        if (e.detail?.id === "show") win.show?.();
        if (e.detail?.id === "quit") Deno.exit(0);
      });
      tray.addEventListener?.("click", () => win.show?.());
      console.log("tray: initialised");
    } catch (err) {
      console.warn("tray unavailable on this canary:", (err as Error).message);
    }
  } else {
    console.warn("Deno.Tray not present in this canary build");
  }
}

// ---- guarded auto-update (won't fail the app if absent / URL unreachable) ----
try {
  D.autoUpdate?.({
    url: "https://releases.invalid/adania-client",
    interval: 3600_000,
    onUpdateReady: (v: string) => console.log("update ready:", v),
    onRollback: (r: string) => console.warn("rolled back:", r),
  });
  console.log("autoUpdate:", D.autoUpdate ? "wired" : "absent");
} catch (err) {
  console.warn("autoUpdate error:", (err as Error).message);
}
