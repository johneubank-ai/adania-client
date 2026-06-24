// FINDING: starting the background node here does NOT work for shared UI state — Next runs
// instrumentation in a SEPARATE module graph from route handlers, so its `lib/state` singleton is a
// different instance than the one /api/state reads (the WS connects + runs turns, but the UI never
// sees the updates). We start the node from the /api/state route instead, in the request graph.
export function register() {}
