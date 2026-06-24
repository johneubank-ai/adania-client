# Overnight build status (2026-06-24)

Autonomous build of the Desktop-app (reverse-WS) feature across **adania** (backend/portal) and
**adania-client** (Deno Desktop client). Both committed + pushed to `main`.

## ✅ DONE — adania (backend + portal) — pushed to main, auto-deploying
- **Domain model (DB, idempotent `ensure*` → applies on deploy, no manual migration):**
  `web.bot.assignee_membership_id` (a Desktop-app bot → up-to-one org member; `ON DELETE SET NULL`),
  `web.missed_event` (undeliverable inbound events; indexed for newest-first + search-by-name),
  `web.relay_turn` (the reverse-connection bus).
- **Runner wording (UI only, enum unchanged):** `managed-agents`→**Remote**, `claude-agent-sdk`→**Desktop app**
  via `runnerLabel()`, applied on bots list, create, Configure, Slack page, admin.
- **Member-agnostic webhooks:** slack/linear/github manifests now bake the **deployed relay** (`RELAY_URL`)
  for Desktop-app bots — swapping the assignee needs no app re-provision.
- **Relay:** `computeReply` Desktop branch → enqueue on the bot's assignee → wait for the held desktop
  connection's reply → on no-assignee/offline, record a `missed_event`.
- **AgentConfig endpoint:** `GET /api/bots` (authed) → the caller's orgs + assigned Desktop-app bots +
  token-free AgentConfig + relay URLs.
- **Reverse connection:** `GET /api/relay/desktop` (SSE; member dials OUT) + `POST /api/relay/reply`.
  (App Router can't raw-WS-upgrade under `next start`; SSE is the working transport now, swappable for a
  true WS service later — see DEFERRED.)
- **Auth:** `verifyCustomerToken` (Cognito customers pool, RS256/JWKS) + `resolvePrincipal` accepting the
  desktop's Cognito token OR the MCP agents token.
- **Portal:** bot **Configure** page with the **assignee dropdown** (any org member, default self);
  **Missed events** child page (paginated 100, newest-first, search by event name) + detail + **Retry**.
- Typechecks clean; Biome-formatted; pushed in 2 commits.

## ✅ DONE — adania-client (Deno Desktop client) — pushed to main
- Fetches `GET /api/bots` from the deployed backend with the Cognito token.
- **Orgs list + select + that org's web channels** (assigned Desktop-app bots) in the UI.
- **Real reverse SSE relay** (fetch-streaming with the Bearer token — `EventSource` can't send auth
  headers): receives turns, runs them via the Agent SDK, POSTs replies. Replaces the localhost stub.
- **OS keychain** token storage (macOS `security`, file fallback) — replaces the 0600 file.
- **JWKS RS256 verification** of the Cognito id_token (replaces decode-only).
- `next build` green.

## ⏳ DEFERRED / NEEDS VERIFY (could not finish autonomously)
1. **Deploy verification** — adania auto-deploy was in flight at sign-off. Verify:
   `curl -s -o /dev/null -w '%{http_code}' https://app.adania.johneubank.ai/api/bots` → expect **401**
   (route live, rejecting unauthenticated). Then check `gh run list --repo johneubank-ai/adania`.
2. **Desktop `.app` rebuild + live e2e** — I cleaned the 588 MB build to reclaim space. Rebuild:
   `cd adania-client/spike/next-client && pnpm install && pnpm build && deno desktop --output ../bin/AdaniaClient.app --allow-read --allow-write --allow-env --allow-sys --allow-net --allow-run .`
   then sign in and confirm a Slack @-mention to an assigned Desktop-app bot round-trips.
3. **True WebSocket** — currently SSE+POST (works, member dials out). A dedicated WS service is the
   eventual upgrade if SSE/ALB idle proves limiting (app-level heartbeats already added).
4. **ALB idle timeout** — SSE relies on the 20s app heartbeat vs the 60s ALB default; if drops occur,
   raise `idle_timeout` on the shared ALB (infra change — `cdk diff` first, shared blast radius).
5. **Retry redelivery semantics** — Retry re-enqueues onto the bus; if still no assignee it stays pending.

## New AWS resource created
Public Cognito desktop client `1c05scns13a3nofh7tj7v6ccp9` in pool `us-east-1_XinOnJ2F4` (no secret, PKCE,
loopback callback). Non-secret; safe in the repo.
