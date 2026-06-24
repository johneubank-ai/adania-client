// FINDING: Next instantiates module singletons SEPARATELY per server entry bundle (instrumentation,
// route handlers, Server Actions, RSC render) — a plain `export const` is NOT shared across them.
// Pin the state to a PROCESS-global so every bundle sees the same object.
type AppState = {
  runtime: string; login: string; socket: string; turns: number; lastEvent: string; lastReply: string;
};
const g = globalThis as unknown as { __adaniaState?: AppState };
export const state: AppState = (g.__adaniaState ??= {
  runtime: "next.js + deno desktop",
  login: "signed out",
  socket: "connecting…",
  turns: 0,
  lastEvent: "—",
  lastReply: "—",
});
