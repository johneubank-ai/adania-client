// STEP 0 — hello window (needs Deno 2.9 CANARY: `deno upgrade canary`).
// Proves the canary toolchain builds a runnable per-platform Deno Desktop binary at all,
// and gives the baseline binary-size number (input to the bsdiff/auto-update budget).
//
// Dev:    deno upgrade canary && deno desktop step0_window.ts
// Build:  deno desktop --target aarch64-apple-darwin step0_window.ts   (see README for permission flags)

Deno.serve(() =>
  new Response(
    "<!doctype html><meta charset=utf-8><title>Adania Client (spike)</title>" +
      "<body style='font:16px system-ui;padding:2rem'><h1>Adania Client — spike</h1>" +
      "<p>If you can read this in a native window, Deno Desktop built and launched.</p>",
    { headers: { "content-type": "text/html" } },
  )
);
