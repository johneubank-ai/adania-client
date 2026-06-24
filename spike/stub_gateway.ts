// Stub cloud gateway for Step 2 (runs on STABLE deno).
// Accepts the client's OUTBOUND WebSocket, requires a signed `hello` frame (the per-member
// HMAC-handshake stand-in), pushes ONE event frame, prints the reply. Mirrors the real
// relay-gw contract: connect-auth, then event -> reply keyed by requestId, plus ping/pong.
//
// Run:  deno task gateway

const PORT = Number(Deno.env.get("PORT") ?? "8787");
const EXPECT = Deno.env.get("HELLO_TOKEN") ?? "dev-secret"; // stand-in for the per-member HMAC secret

Deno.serve({ port: PORT }, (req) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("websocket only", { status: 426 });
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  let authed = false;

  socket.onopen = () => console.log("client socket opened — awaiting hello");
  socket.onmessage = (e) => {
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(e.data);
    } catch {
      return;
    }
    if (f.type === "ping") {
      socket.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (f.type === "hello") {
      authed = f.token === EXPECT;
      console.log(authed ? "hello OK — authed" : "hello REJECTED");
      if (!authed) {
        socket.close(4401, "bad hello");
        return;
      }
      // push one event frame
      const evt = {
        type: "event",
        requestId: "req-1",
        payload: { messages: [{ role: "user", content: "Reply with exactly: deno-spike-ok" }] },
      };
      socket.send(JSON.stringify(evt));
      console.log("pushed event req-1");
      return;
    }
    if (f.type === "reply" && authed) {
      console.log(`REPLY frame ${f.requestId} => ${JSON.stringify(f.reply)}`);
    }
  };
  socket.onclose = () => console.log("client socket closed");
  return response;
});
console.log(`stub gateway listening on ws://localhost:${PORT}`);
