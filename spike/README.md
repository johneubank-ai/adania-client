# adania-client — Deno Desktop spike

Disposable spike to de-risk building **adania-client** (the local agent-sdk runner + member login client + reverse-WS node) on **Deno Desktop** (Deno 2.9, canary/pre-stable). Riskiest step first. Re-run on each canary bump until Deno Desktop stabilizes.

## What each piece proves

| File | Proves | Runtime needed | Token needed |
|---|---|---|---|
| `probe_spawn.ts` | Deno spawns the Claude Code CLI **native binary** via `node:child_process` (the spawn half of Step 1) | **stable deno** | no |
| `step1_spawn.ts` | **GO/NO-GO**: the Agent SDK imports under Deno + `query()` spawns the extracted CLI + a **real Claude reply** comes back | stable deno | **yes** (`CLAUDE_CODE_OAUTH_TOKEN`) |
| `stub_gateway.ts` + `step2_ws.ts` | reverse-WS round-trip on Deno: outbound dial → hello-auth → event → run → reply, with heartbeat + reconnect (mock turn if no token) | **stable deno** | optional |
| `step0_window.ts` | the canary toolchain builds + launches a Deno Desktop window; baseline binary size | **canary** (`deno upgrade canary`) | no |
| `lib/extract_cli.ts` | Deno-native replacement for `extractFromBunfs()` (which **no-ops on Deno**) — read CLI bytes → temp → chmod → exec | both | no |

## Prerequisites

- **Stable steps (probe, step1, step2):** the installed `deno 2.1.7` is fine.
- **CLI binary:** either
  - `export CLAUDE_CLI_PATH=/Users/john2/a/adania/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-darwin-arm64@0.3.183/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` (dev fast-path, no copy), **or**
  - copy that binary to `./vendor/claude` to exercise the real extract path (and for the compiled build it MUST be vendored).
- **Real turns:** `export CLAUDE_CODE_OAUTH_TOKEN=...` (a Claude Code OAuth token — it authenticates only the Agent SDK path; Messages API / Managed Agents reject it).
- **Desktop steps (step0 + the compiled Step 1/2):** `deno upgrade canary` (pins you to Deno 2.9 canary — system-wide; revert with `deno upgrade --stable`).

## Run

```sh
# 1. spawn check (no token)
CLAUDE_CLI_PATH=<.../claude> deno task probe

# 2. GO/NO-GO real turn
CLAUDE_CODE_OAUTH_TOKEN=... CLAUDE_CLI_PATH=<.../claude> deno task step1

# 3. reverse-WS round-trip (two terminals)
deno task gateway
CLAUDE_CLI_PATH=<.../claude> deno task step2          # add CLAUDE_CODE_OAUTH_TOKEN for a real reply

# 4. desktop window (canary)
deno upgrade canary && deno desktop step0_window.ts
```

## Spike order & status

- [x] **Step 0** — canary `deno desktop` builds a code-signed macOS `.app` (WebView, **65 MB baseline**) and the **native window renders** (verified visually). Canary deno (2.8.3, has `deno desktop`) installed side-by-side at `/Users/john2/a/.tmp/deno-canary/bin/deno` (Homebrew deno can't self-upgrade).
- [~] **Step 1** — embed+spawn CLI for a real turn  ← **go/no-go gate**
  - [x] native CLI binary runs (`2.1.183 (Claude Code)`) and **Deno spawns it via `node:child_process`** (`deno task probe`, stable deno)
  - [x] **`npm:@anthropic-ai/claude-agent-sdk` resolves + imports under Deno** (fetched SDK + matching 206 MB darwin-arm64 binary)
  - [x] a **real Claude turn** via `query()` on Deno — `REPLY: deno-spike-ok` (used the ambient Claude Code **keychain** login; no explicit token needed)
  - [x] the **compiled-binary extract path** — a `deno compile --include vendor/claude` binary (294 MB, perms baked at compile) ran with NO runtime flags, **extracted the embedded CLI from its own virtual FS**, spawned it, and returned `REPLY: deno-compile-ok`. This is the exact mechanism `deno desktop` uses (compile + embed), minus the webview.
- [~] **Step 2** — reverse-WS round-trip + tray/background persistence
  - [x] **transport proven on stable deno**: outbound dial → signed `hello` auth → `event` → run → `reply` keyed by `requestId`; heartbeat + exponential-backoff reconnect verified
  - [✗] tray / hide-on-close — **RED on canary 2.8.3**: clicking the window's close button QUIT the app and dropped the socket (the 2.9-documented `close`+`preventDefault` / `Deno.Tray` keep-alive didn't hold on this pre-stable build). Background persistence needs Deno 2.9 stable, or retest with an explicit `new Deno.BrowserWindow` + verified-present `Deno.Tray`.
- [x] **Integrated build** — one Deno Desktop app (`app.ts`, 296 MB) serving the UI + running the background reverse-WS + agent + embedded-CLI extract; verified LIVE in the native window: socket **connected**, **1 turn** handled, reply `deno-spike-ok`, CLI extracted to `/var/folders/.../adania-cli-*/claude`.
- [x] **Next.js on Deno Desktop** — App Router + RSC + a `use server` Server Action work inside `deno desktop` (count **0 → 1** on click). Must `next build` first; deno desktop auto-detects Next, embeds `.next` + the **entire node_modules (288 MB)** → 357 MB app.
- [ ] **Step 3 (remaining)** — real Cognito PKCE login + AgentConfig fetch + OS-keychain store (replace the stub gateway/login)
- [ ] **Step 4** — macOS Developer-ID sign + notarize (builds are **ad-hoc** signed; `spctl` rejects — "sealed resource missing") + auto-update apply/rollback (`Deno.autoUpdate` wired but not E2E-verified)

## Results so far (stable deno 2.1.7, no canary, no token)

- ✅ **Go/no-go spawn half PROVEN** — Deno runs the 206 MB bun-compiled CLI as a subprocess.
- ✅ **Agent SDK imports under Deno node-compat** (npm: specifier).
- ✅ **Reverse-WS reverse-tunnel mechanics PROVEN** (dial/auth/event/reply/heartbeat/reconnect).
- ✅ **Real Claude turn PROVEN on Deno** — `query()` → spawned CLI → `deno-spike-ok`, authed via the **ambient Claude Code keychain login** (no explicit token needed).
- 📌 **Credential insight:** the spawned CLI uses the member's existing Claude Code OS-keychain login automatically — so adania-client may not need to store/refresh a token itself; relying on "member has Claude Code logged in" (or setting `CLAUDE_CODE_OAUTH_TOKEN` explicitly) both work. Reinforces the OS-keychain credential recommendation.
- 📌 **Permission finding:** the Agent SDK needs **`--allow-sys`** under Deno (`node:os.homedir()` at init) — bake `--allow-run[=claude] --allow-net --allow-read --allow-write=<tmp> --allow-env=CLAUDE_CODE_OAUTH_TOKEN --allow-sys`.
- 📌 **Size finding:** one platform CLI binary = **206 MB** → bundling adds ~206 MB per target (informs the bundle-vs-separate-install fork + bsdiff budget).
- ✅ **Compiled-binary extract+spawn+turn PROVEN** via `deno compile --include` (294 MB, perms baked) → `deno-compile-ok`. This is `deno desktop`'s mechanism minus the webview, so feasibility is settled on stable deno.
- ⚠️ **Canary install blocked via Homebrew:** `deno upgrade canary` errors ("built without the upgrade feature") because deno was `brew install`ed. The actual `deno desktop` GUI + Deno-2.9 APIs (`Deno.BrowserWindow`, `Deno.Tray`, `Deno.autoUpdate`) need a **side-by-side canary install** (official install script to a local dir), not `deno upgrade`.
- ⏭ **Only canary-shell items remain unverified:** the webview window, tray/background persistence, auto-update, and embedding a `next build` (incl. the `use server` smoke test). The agent runtime, reverse-WS, compiled extract, and baked permissions are all GREEN.

## Next.js client (`next-client/`) — the real product shape

A Next.js (App Router) adania-client where the background reverse-WS + agent runner run inside the Next server, with a live status UI + a Server Action. Build: `pnpm install && pnpm build && deno desktop --output ../bin/AdaniaClient.app --allow-read --allow-write --allow-env --allow-sys --allow-net --allow-run .`

**GREEN:** the app runs under `deno desktop`; the UI (client component polling `/api/state`) shows **Socket connected · Turns 1 · Last reply `deno-spike-ok`** — i.e. Next UI + background reverse-WS + a **real Claude turn** (CLI self-resolved from the embedded node_modules, no explicit path) in one binary. Next.js App Router + RSC + a `use server` Server Action also proven (see `next-smoke/`, count 0→1).

**Size:** **588 MB** — `deno desktop` embeds the entire `node_modules` (519 MB, incl. the 206 MB CLI) + `.next`. Much heavier than the plain-Deno integrated app (296 MB); the Next path's size is dominated by embedded node_modules.

**FINDING — in-process state is NOT shared across Next server entry points.** Next instantiates module singletons (and even `globalThis`) **separately** per entry realm: `instrumentation.ts`, route handlers, Server Actions, and RSC render don't share a live mutable object under `deno desktop`. Symptoms seen: (1) starting the background node from `instrumentation.ts` connected + ran a turn but the UI never saw it; (2) starting it from the `/api/state` route fixed the UI (same route realm); (3) the `Sign in` Server Action updated state but `/api/state` never reflected it (different realm) — even via `globalThis`. **Fix for the real client: cross-context state must go through an external store (a file / SQLite / IPC), not an in-process singleton.** The Server Action *mechanism* is fine (next-smoke); only cross-realm shared state is the issue.

## Real client — COMPLETE ✅ (`next-client/`)

End-to-end working Deno Desktop app: **Cognito PKCE login + background reverse-WS + agent runner**, verified live — signed in as `john@johneubank.ai` (Account row green), Socket connected, real turn `deno-spike-ok`, tokens (access + **refresh** + id) persisted `0600`. No password was typed/handled by the assistant — the browser's existing Cognito session SSO'd straight through to the loopback callback.

**Auth — Cognito Authorization-Code + PKCE** against a dedicated PUBLIC desktop client (no secret in the binary):
- pool `us-east-1_XinOnJ2F4` (adania-customers-dev), domain `adania-customers-660601648861.auth.us-east-1.amazoncognito.com`
- desktop client `1c05scns13a3nofh7tj7v6ccp9`, callback `http://127.0.0.1:8976/callback`, scope `openid profile email`
- flow: Sign in (Server Action) → genPKCE → open system browser → hosted UI → redirect to the loopback listener → token exchange → tokens to a 0600 file.

**Architecture (works around the Next realm-isolation finding):**
- **File-backed store** (`~/.adania-client/state.json`) = the single source of truth across all Next realms (module/`globalThis` singletons are NOT shared; the filesystem is).
- **Loopback listener on :8976** (`node:http`) doubles as a cross-realm/process **mutex** — whichever realm binds it owns the reverse-WS + the OAuth callback (no duplicate connections).
- **node: APIs throughout** (fs/http/crypto/child_process) so `next build` type-checks on Node while Deno runs it.

**Size:** the built `.app` is **~1.1 GB** on disk (embedded node_modules incl. the 206 MB CLI + webview).

**Stubbed / next:** AgentConfig+creds cloud fetch (endpoint not deployed yet); reverse-WS points at the local `stub_gateway.ts` (→ real relay-gw); tokens in a 0600 file (→ OS keychain); JWT signature verification via JWKS (prod).

Run: `cd next-client && pnpm install && pnpm build && deno desktop --output ../bin/AdaniaClient.app --allow-read --allow-write --allow-env --allow-sys --allow-net --allow-run .` then (stub gateway in another shell) `deno run --allow-net --allow-env ../stub_gateway.ts` and `open ../bin/AdaniaClient.app`.

## Known Deno-specific gotchas baked into this spike

- `extractFromBunfs()` is Bun-only and **no-ops on Deno** → `lib/extract_cli.ts` hand-rolls it.
- Deno's client `WebSocket` constructor support for custom headers is **uncertain** → auth is sent as a signed `hello` **frame** (matches the existing per-member HMAC model) instead of a connect header.
- Deno Desktop permissions are **baked at compile time** (no runtime prompts) → enumerate `--allow-run[=claude] --allow-net --allow-read --allow-write=<tmp> --allow-env=CLAUDE_CODE_OAUTH_TOKEN`; never `--allow-all` on a token-holding binary.
- Next.js: run `next build` BEFORE `deno desktop`; docs are silent on RSC/Server Actions → Step 3 must smoke-test them.
